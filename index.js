var fs = require('fs'),
    path = require('path'),
    glob = require('glob'),
    swfParser = require('./processors/swf-parser'),
    Texturer = require('./node_modules/texturer/dist/texturer.js'),
    texturerConfig = require('./texturer-config');

process.on('uncaughtException', function(err) {
  console.log(err.stack);
});

process.on("unhandledRejection", function(err) { 
    throw err; 
});

var sourceFolder = process.argv[2],
    targetFolder = process.argv[3],
    parseType = process.argv[4],
    onlyTextures = process.argv[5];

texturerConfig['folders']['source'] = sourceFolder;
texturerConfig['folders']['target'] = targetFolder;


glob(sourceFolder + '/*.swf', function(err, files) {

    var textureMaps = [];

    var doSwfParser = function(fileIndex) {
        var sourceFile = files[fileIndex];
            sourceName = path.basename(sourceFile, '.swf');


        if (sourceName == 'hh_human_fx' || sourceName == 'hh_pets') { // TODO: Make this nicer
            if (fileIndex + 1 < files.length) {
                doSwfParser(fileIndex + 1);
            }
            else {
                doGenerateTextures(0);
            }
        }
        else {
            swfParser(sourceFolder, sourceFile, targetFolder, parseType, function(err, swfName) {
                if (err) throw new Error(err);

                textureMaps.push({
                    folder: swfName,
                    'texture-map-file':   swfName + '.png'
                });

                if (fileIndex + 1 < files.length) {
                    doSwfParser(fileIndex + 1);
                }
                else {
                    doGenerateTextures(0);
                }
            });
        }
    };

    var doGenerateTextures = function(mapIndex) {
        texturerConfig['texture-map-tasks'][0] = textureMaps[mapIndex];

        new Texturer().generate(texturerConfig, function (err) {
            if (err) if (err.message.indexOf('too large art. Split images into 2 or more folders!') == -1) { // TODO: Fix this error (it's rarely)
                throw err;
            } 
            else {
                doGenerateTextures(mapIndex + 1); return;
            }

            delete require.cache[require.resolve(targetFolder + '/texturePool.js')];
            var texturePool = require(targetFolder + '/texturePool.js');

            for (var i in texturePool.maps) {
                var map = texturePool.maps[i];

                console.log('Generate spritesheet for ' + map.url);

                var spritesheet = {
                    meta: {
                        image: map.url,
                        size: {
                            w: map.width,
                            h: map.height
                        },
                        scale: 1
                    },
                    frames: {}
                };

                for (var j in texturePool.textures) {
                    var texture = texturePool.textures[j];

                    if (texture.mapIndex == i) {
                        spritesheet.frames[j] = {
                            frame: {
                                x: texture.x,
                                y: texture.y,
                                w: texture.width,
                                h: texture.height
                            },
                            rotated: false,
                            trimmed: false,
                            spriteSourceSize: {
                                x: 0,
                                y: 0,
                                w: texture.width,
                                h: texture.height
                            },
                            sourceSize: {
                                w: texture.width,
                                h: texture.height
                            }
                        };
                    }
                }
                
                fs.writeFileSync(targetFolder + '/' + path.basename(map.url, '.png') + '_spritesheet.json', JSON.stringify(spritesheet));

                if (mapIndex + 1 < textureMaps.length) {
                    doGenerateTextures(mapIndex + 1);
                }
                else {
                    console.log('------ DONE ------');
                }
            }
        }, null);
    };

    if (onlyTextures) {
        for (var i in files) {
            var swfName = path.basename(files[i], '.swf');

            textureMaps.push({
                folder: swfName,
                'texture-map-file':   swfName + '.png'
            });
        }

        doGenerateTextures(0);
    }
    else {
        doSwfParser(0);
    }
});