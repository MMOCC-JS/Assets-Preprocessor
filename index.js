var fs = require('fs'),
    path = require('path'),
    glob = require('glob'),
    jBinary = require('jbinary'),
    swfTypeSet = require('./swf'),
    PNG = require('node-png').PNG,
    Texturer = require('./node_modules/texturer/dist/texturer.js'),
    texturerConfig = require('./texturer-config'),
    waterfall = require('async-waterfall'),
    xmldom = require('xmldom'),
    x2js = new (require('x2js'))({ attributePrefix: '', emptyNodeForm: 'array' });

process.on('uncaughtException', function(err) {
  console.log(err.stack);
});

process.on("unhandledRejection", function(err) { 
    throw err; 
});

var sourceFolder = process.argv[2],
    targetFolder = process.argv[3],
    renderParseType = process.argv[4];

texturerConfig['folders']['source'] = sourceFolder;
texturerConfig['folders']['target'] = targetFolder;

function parseLayerByString(layer) {
    var result = 0;

    for (var i = 0; i < layer.length; i++) {
        var layerChar = layer.charCodeAt(i) - 97;

        result += layerChar * Math.pow(26, layer.length - 1 - i);
    }

    return result;
}

waterfall([
    function(callback) {
        glob(sourceFolder + '/*.swf', function(err, files) {
            
            callback(err, files);
        });
    },
    function(files, callback) {
        var textureMaps = [];

        var loadAndParseSWF = function(fileIndex) {
            var file = files[fileIndex];

            jBinary.load(file, swfTypeSet, function(err, binary) {
                if (err) throw err;

                var swf = binary.readAll(),
                    swfName = swf.tags[43][0].data.name,
                    swfProjectPath = sourceFolder + '/' + swfName,
                    tagNames = {};

                var symbolTags = swf.tags[76],
                    binaryTags = swf.tags[87],
                    imageTags = swf.tags[36];

                console.log('Preprocessing swf: ' + swfName);

                for (var i in symbolTags)
                {
                    var symbolTag = symbolTags[i];

                    for (var j in symbolTag.data.symbols) {
                        var symbol = symbolTag.data.symbols[j];

                        tagNames[symbol.tag] = symbol.name;

                        //console.log(symbol.name);
                    }
                }

                fs.mkdir(swfProjectPath, function(err) {
                    //if (err) throw err;

                    textureMaps.push({
                        folder: swfName,
                        'texture-map-file':  swfName + '.png'
                    });

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

                    var processedData = {};
                    switch (renderParseType) {
                        case 'furniture':
                            processedData = {
                                renderType: renderParseType,

                                name: swfName,
                                logic: "",
                                visualization: "",

                                dimensions: {
                                    x: 0,
                                    y: 0,
                                    z: 0,
                                    centerZ: -1
                                },

                                directions: [],
                                assets: {},
                                graphics: {}
                            };
                            break;

                        case 'figure':
                            // add base figure items
                            break;
                    }

                    // this will crashe the texture packer for some odd reasons....
                    for (var i in binaryTags) {
                        var binaryTag = binaryTags[i];
                            tagData = binaryTag.data;
                            binaryName = tagNames[tagData.symbolTag];

                        var jsonObj = x2js.xml2js(tagData.data);

                        if (jsonObj.objectData) {
                            processedData.dimensions = jsonObj.objectData.model.dimensions;

                            if (jsonObj.objectData.model.directions) {
                                var objDirections = jsonObj.objectData.model.directions.direction;
                                if (objDirections.id) {
                                    objDirections = [objDirections];
                                }

                                for (var j in objDirections) {
                                    var direction = objDirections[j].id / 90 * 2;

                                    processedData.directions.push(direction);
                                }
                            }
                        }
                        else if (jsonObj.visualizationData) {
                            var objVisualizations = jsonObj.visualizationData.graphics.visualization;
                            for (var j in objVisualizations) {
                                var objVisualization = objVisualizations[j];
                                var visualization = {
                                    angle: objVisualization.angle,
                                    layerCount: objVisualization.layerCount
                                };

                                if (objVisualization.layers && Object.getOwnPropertyNames(objVisualization.layers).length > 0) {
                                    visualization.layers = {};

                                    if (objVisualization.layers.layer.id) {
                                        objVisualization.layers.layer = [objVisualization.layers.layer];
                                    }

                                    for (var k in objVisualization.layers.layer) {
                                        var layer = objVisualization.layers.layer[k],
                                            layerId = layer.id;
                                        delete layer.id;

                                        visualization.layers[layerId] = layer;
                                    }
                                }

                                if (objVisualization.directions && Object.getOwnPropertyNames(objVisualization.directions).length > 0) {
                                    visualization.directions = {};

                                    if (objVisualization.directions.direction.id) {
                                        objVisualization.directions.direction = [objVisualization.directions.direction];
                                    }

                                    for (var k in objVisualization.directions.direction) {
                                        var objDirection = objVisualization.directions.direction[k];

                                        if (objDirection.layer) {
                                            visualization.directions[objDirection.id] = {};

                                            if (objDirection.layer.id) {
                                                objDirection.layer = [objDirection.layer];
                                            }

                                            for (var l in objDirection.layer) {
                                                var layer = objDirection.layer[l],
                                                    layerId = layer.id;
                                                delete layer.id;

                                                visualization.directions[objDirection.id][layerId] = layer;
                                            }
                                        }
                                    }
                                }

                                if (objVisualization.colors && Object.getOwnPropertyNames(objVisualization.colors).length > 0) {
                                    visualization.colors = {};

                                    if (objVisualization.colors.color.id) {
                                        objVisualization.colors.color = [objVisualization.colors.color];
                                    }

                                    for (var k in objVisualization.colors.color) {
                                        var objColor = objVisualization.colors.color[k];

                                        if (objColor.colorLayer) {
                                            visualization.colors[objColor.id] = {};

                                            if (objColor.colorLayer.id) {
                                                objColor.colorLayer = [objColor.colorLayer];
                                            }

                                            for (var l in objColor.colorLayer) {
                                                var layer = objColor.colorLayer[l],
                                                    layerId = layer.id;
                                                delete layer.id;

                                                visualization.colors[objColor.id][layerId] = layer;
                                            }
                                        }
                                    }
                                }

                                if (objVisualization.animations && Object.getOwnPropertyNames(objVisualization.animations).length > 0) {
                                    visualization.animations = {};

                                    if (objVisualization.animations.animation.id) {
                                        objVisualization.animations.animation = [objVisualization.animations.animation];
                                    }

                                    for (var k in objVisualization.animations.animation) {
                                        var objAnimation = objVisualization.animations.animation[k];

                                        if (objAnimation.animationLayer) {
                                            visualization.animations[objAnimation.id] = {};

                                            if (objAnimation.animationLayer.id) {
                                                objAnimation.animationLayer = [objAnimation.animationLayer];
                                            }

                                            for (var l in objAnimation.animationLayer) {
                                                var layer = objAnimation.animationLayer[l],
                                                    layerId = layer.id;
                                                delete layer.id;

                                                if (layer.frameSequence) {
                                                    if (layer.frameSequence.frame) {
                                                        layer.frameSequence = [layer.frameSequence];
                                                    }

                                                    for (var m in layer.frameSequence) {
                                                        var objFrames = layer.frameSequence[m].frame;
                                                        if (layer.frameSequence[m].frame.id) {
                                                            objFrames = [layer.frameSequence[m].frame];
                                                        }

                                                        layer.frameSequence[m] = [];

                                                        for (var n in objFrames) {
                                                            layer.frameSequence[m].push(objFrames[n].id);
                                                        }
                                                    }
                                            }

                                                visualization.animations[objAnimation.id][layerId] = layer;
                                            }
                                        }
                                    }
                                }

                                processedData.graphics[objVisualization.size] = visualization;
                            }
                        }
                        else if (jsonObj.object) {
                            processedData.logic = jsonObj.object.logic;
                            processedData.visualization = jsonObj.object.visualization;
                        }
                        else if (jsonObj.assets) {
                            var objAssets = jsonObj.assets.asset;
                            for (var j in objAssets) {
                                var asset = objAssets[j],
                                    assetName = asset.name;
                                delete asset.name;
                                asset.properties = {};

                                if (assetName === undefined) {
                                    continue;
                                }

                                if (asset.flipH) {
                                    asset.flipH = asset.flipH == '1';
                                }

                                if (asset.flipV) {
                                    asset.flipV = asset.flipV == '1';
                                }

                                var nameParts = assetName.split('_'),
                                    namePartIndex = nameParts.length;

                                if (nameParts[namePartIndex - 1] == 'small') {
                                    asset.properties.size = 1;
                                    asset.properties.layer = 0;

                                }
                                else if (nameParts[namePartIndex - 2] == 'icon') {
                                    asset.properties.size = 1;
                                    asset.properties.layer = parseLayerByString(nameParts[--namePartIndex]);
                                }
                                else {
                                    asset.properties.frame = nameParts[--namePartIndex];
                                    asset.properties.direction = nameParts[--namePartIndex];
                                    asset.properties.layer = parseLayerByString(nameParts[--namePartIndex]); // throw error by prizetrophy_2011_r
                                    asset.properties.size = nameParts[--namePartIndex];
                                }

                                processedData.assets[assetName] = asset;
                            }
                        }
                    }

                    fs.writeFileSync(targetFolder + '/' + swfName + '.json', JSON.stringify(processedData));

                    if (fileIndex + 1 < files.length) {
                        loadAndParseSWF(fileIndex + 1);
                    }
                    else {
                        callback(null, textureMaps);
                    }
                });
            });
        };

        loadAndParseSWF(0);
    },
    function(textureMaps, callback) {
        var generateSpritesheet = function(mapIndex) {
            texturerConfig['texture-map-tasks'][0] = textureMaps[mapIndex];

            new Texturer().generate(texturerConfig, function (err) {
                if (err) return callback(err);

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
                        generateSpritesheet(mapIndex + 1);
                    }
                    else {
                        callback(null);
                    }
                }
            }, null);

        };

        generateSpritesheet(0);
    }
], function(err) {
    if (err) throw err;

    console.log('All SWFs in the folder are preprocessed');
});