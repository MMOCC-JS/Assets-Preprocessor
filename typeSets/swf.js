var jDataView = require('jdataview'),
    jBinary = require('jbinary'),
    pako = require('pako');

var LITTLE_ENDIAN = true;

function reconstructDataView(binary, offset, dataBuffer) {
    var headerLength = offset,
        headerBuffer = binary.view.getBytes(headerLength, 0),
        buffer = new Uint8Array(headerBuffer.length + dataBuffer.length);

    buffer.set(headerBuffer);
    buffer.set(dataBuffer, headerBuffer.length);

    binary.view = new jDataView(buffer, 0, buffer.length, LITTLE_ENDIAN);
    binary.seek(offset);

    return binary.view;
}

module.exports = swfTypeSet = {
    'jBinary.all': 'file',
    'jBinary.littleEndian': LITTLE_ENDIAN,

    // SWF types
    rgb: {
        r: 'uint8',
        g: 'uint8',
        b: 'uint8'
    },

    rectangle: jBinary.Template({
        read: function() {
            var nBits = this.binary.read(['bitfield', 5]),
                xMin = this.binary.read(['bitfield', nBits]) / 20,
                xMax = this.binary.read(['bitfield', nBits]) / 20,
                yMin = this.binary.read(['bitfield', nBits]) / 20,
                yMax = this.binary.read(['bitfield', nBits]) / 20;

            return {
                x : xMin,
                y : yMin,
                width : (xMax > xMin ?  xMax - xMin : xMin - xMax),
                height : (yMax > yMin ? yMax - yMin : yMin - yMax)
            };
        }
    }),

    recordHeader: jBinary.Template({
        baseType: 'uint16',
        read: function() {
            var tagCodeAndLength = this.baseRead(),
                tagCode = tagCodeAndLength >> 6,
                tagLength = tagCodeAndLength & 0x3F;

            if (tagLength == 0x3F) {
                tagLength = this.binary.read('uint32');
            }

            return {
                code: tagCode,
                length: tagLength,
                start: this.binary.tell()
            };
        }
    }),

    // SWF tags

    fileAttributesTag: jBinary.Template({
        baseType: 'uint32',
        read: function() {
            var flags = this.baseRead();

            return {
                useNetwork: !!(flags & 0x1),
                actionScript3: !!(flags & 0x8),
                hasMetaData: !!(flags & 0x10),
                useGPU: !!(flags & 0x20),
                useDirectBit: !!(flags & 0x40),
            };
        }
    }),

    symbolClassTag: {
        numSymbols: 'uint16',
        symbols: ['array', {
            'tag': 'uint16',
            'name': 'string0'
        }, 'numSymbols']
    },

    metaDataTag: {
        xml: 'string0'
    },

    scriptLimitsTag: {
        maxRecursionDepth: 'uint16',
        scriptTimeoutSeconds: 'uint16'
    },

    setBackgroundColorTag: {
        backgroundColor: 'rgb'
    },

    'frameLabelTag': {
        name: 'string0'
    },

    'defineBinaryDataTag': jBinary.Template({
        params: ['record'],
        setParams: function(record) {
            this.baseType = {
                symbolTag: 'uint16',
                _: ['skip', 4],
                data: ['string', record.length - 6]
            }
        }
    }),
    
    defineBitsLossless2Tag: jBinary.Template({
        baseType: ['extend', {
            symbolTag: 'uint16',
            bitmapFormat: 'uint8',
            bitmapWidth: 'uint16',
            bitmapHeight: 'uint16'
        },
        ['if', function(context) { return context.bitmapFormat == 3}, {
            bitmapColorTableSize: 'uint8'
        }]],
        params: ['record'],
        read: function() {
            var result = this.baseRead(),
                bitmapSize = result.bitmapWidth * result.bitmapHeight,
                startOffset = this.record.start,
                currOffset = this.binary.tell(),
                compressedLength = this.record.length - (currOffset - startOffset),
                compressedBytes = this.binary.view.getBytes(compressedLength, currOffset),
                decompressedBytes = pako.inflate(compressedBytes),
                decompressedLength = decompressedBytes.length;

            if (bitmapSize * 4 != decompressedLength) {
                throw 'invalid defineBitsLossless2 bitmap data';
            }

            result.bitmapData = decompressedBytes;

            return result;
        }
    }),

    // SWF header (initialize the swf)

    header: jBinary.Template({
        baseType: {
            signature: ['string0', 3],
            version: 'uint8',
            fileLength: 'uint32'
        },
        read: function() {
            this.binary.seek(0);

            var result = this.baseRead();

            switch (result.signature) {

                case 'CWS': 
                    // ZLib compression
                    var offset = this.binary.tell(),
                        compressedLength = this.binary.view.byteLength - offset,
                        compressedBytes = this.binary.view.getBytes(compressedLength, offset),
                        decompressedBytes = pako.inflate(compressedBytes),
                        decompressedLength = decompressedBytes.length;

                    reconstructDataView(this.binary, offset, decompressedBytes);
                    break;

                case 'ZWS': 
                    // LZMA compression
                    throw 'LZMA compression not supported'; break;
                    break;

                case 'FWS': break;

                default:
                    throw 'invalid SWF signature'; break;
            }

            result.frameSize = this.binary.read('rectangle');
            result.frameRate = this.binary.read('uint16') / 256;
            result.frameCount = this.binary.read('uint16');

            return result;
        }
    }),

    // SWF read a tag

    tag: jBinary.Template({
        baseType: 'recordHeader',
        read: function() {

            var result = this.baseRead();

            switch (result.code) {
                case 9: result.data = this.binary.read('setBackgroundColorTag'); break;
                case 36: result.data = this.binary.read(['defineBitsLossless2Tag', result]); break;
                case 43: result.data = this.binary.read('frameLabelTag'); break;
                case 65: result.data = this.binary.read('scriptLimitsTag'); break;
                case 69: result.data = this.binary.read('fileAttributesTag'); break;
                case 76: result.data = this.binary.read('symbolClassTag'); break;
                case 77: result.data = this.binary.read('metaDataTag'); break;
                case 87: result.data = this.binary.read(['defineBinaryDataTag', result]); break;

                default:
                    console.log("unhandled tag: ", result.code);
                    
                    this.binary.skip(result.length); break;
            }

            return result;
        }
    }),

    // SWF read all tags

    tags: jBinary.Template({
        baseType: 'tag',
        read: function() {
            var result = {};

            var tag;
            do
            {
                tag = this.baseRead();

                if (!result[tag.code]) {
                    result[tag.code] = [];
                }

                result[tag.code][result[tag.code].length] = tag;
            }
            while (tag.code != 0);

            return result;
        }
    }),


    // SWF file

    file: {
        header: 'header',
        tags: 'tags'
    }
};