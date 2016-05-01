var fs = require('fs'),
    jBinary = require('jbinary'),
    swfTypeSet = require('../typeSets/swf'),
    swfImageParser = require('./swf-image-parser'),
    swfFurnitureXmlParser = require('./swf-furniture-xml-parser'),
    swfFigureXmlParser = require('./swf-figure-xml-parser');

module.exports = function(sourceFolder, sourceFile, targetFolder, parseType, finishCB) {
    if (parseType != 'furniture' && parseType != 'figure') {
        finishCB('Invalid parse type passed by!'); return;
    }

    jBinary.load(sourceFile, swfTypeSet, function(err, binary) {
        if (err) {
            finishCB(err); return;
        }

        var swf = binary.readAll(),
            swfName = swf.tags[43][0].data.name,
            swfProjectPath = sourceFolder + '/' + swfName,
            tagNames = {};

        var symbolTags = swf.tags[76],
            binaryTags = swf.tags[87],
            imageTags = swf.tags[36];

        for (var i in symbolTags)
        {
            var symbolTag = symbolTags[i];

            for (var j in symbolTag.data.symbols) {
                var symbol = symbolTag.data.symbols[j];

                tagNames[symbol.tag] = symbol.name;
            }
        }

        fs.mkdir(swfProjectPath, function(err) {
            swfImageParser(swfProjectPath, tagNames, imageTags, function(err) {
                if (err) {
                    finishCB(err); return;
                }

                var xmlParser = null;
                if (parseType == 'furniture') {
                    xmlParser = swfFurnitureXmlParser;
                }
                else if (parseType == 'figure') {
                    xmlParser = swfFigureXmlParser;
                }
                else {
                    finishCB('Invalid parse type passed by!'); return;
                }

                xmlParser(targetFolder, swfName, tagNames, binaryTags, function(err) {
                    if (err) {
                        finishCB(err); return;
                    }

                    finishCB(null, swfName);
                });
            });
        });
    });
};