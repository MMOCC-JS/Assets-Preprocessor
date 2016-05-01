var fs = require('fs'),
    PNG = require('node-png').PNG;

module.exports = function(swfProjectPath, tagNames, imageTags, finishCB) {
    for (var i in imageTags) {
        var imageTag = imageTags[i],
            tagData = imageTag.data;
            imageName = tagNames[tagData.symbolTag];

        var image = new PNG({
            width: tagData.bitmapWidth,
            height: tagData.bitmapHeight
        });
        for (var j = 0; j < tagData.bitmapData.length; j += 4) { // contains ARGB, ... data
            // PNG needs RGBA, ... data

            image.data[j] = tagData.bitmapData[j + 1];
            image.data[j + 1] = tagData.bitmapData[j + 2];
            image.data[j + 2] = tagData.bitmapData[j + 3];
            image.data[j + 3] = tagData.bitmapData[j];
        }

        image.pack().pipe(fs.createWriteStream(swfProjectPath + '/' + imageName + '.png'));
    }

    finishCB(null);
};