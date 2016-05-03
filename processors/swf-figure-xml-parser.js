var fs = require('fs'),
    xmldom = require('xmldom'),
    x2js = new (require('x2js'))({ attributePrefix: '' }),
    utils = require('../utils');

function fixObjectArray(obj) {
    if (Array.isArray(obj)) {
        return obj;
    }
    else {
        return [obj];
    }
}

module.exports = function(targetFolder, swfName, tagNames, binaryTags, finishCB) {
    var result = {
        renderType: 'figure',

        name: swfName,

        assets: {
        }
    };

    for (var i in binaryTags) {
        var binaryTag = binaryTags[i];
            tagData = binaryTag.data;
            binaryName = tagNames[tagData.symbolTag];

        var jsonObj = x2js.xml2js(tagData.data);

        //console.log(binaryName, jsonObj);

        var objAssets = fixObjectArray(jsonObj.manifest.library.assets.asset);
        for (var i in objAssets) {
            var objAsset = objAssets[i];

            if (objAsset.mimeType != 'image/png') {
                continue;
            }

            var objParam = fixObjectArray(objAsset.param)[0];

            var x = 0,
                y = 0;

            if (objParam.key == 'offset') {
                var offsets = objParam.value.split(',');

                x = parseInt(offsets[0]);
                y = parseInt(offsets[1]);
            }
            else {
                console.log('-------- WARNING: PARAM IS NOT OFFSET! --------');
            }

            result.assets[objAsset.name] = {
                offset: {
                    x: x,
                    y: y
                }
            }
        }
    }

    fs.writeFileSync(targetFolder + '/' + swfName + '.json', JSON.stringify(result));

    finishCB(null);
};