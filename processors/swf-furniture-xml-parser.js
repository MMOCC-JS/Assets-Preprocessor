var fs = require('fs'),
    xmldom = require('xmldom'),
    x2js = new (require('x2js'))({ attributePrefix: '' }),
    utils = require('../utils');

function parseLayerByString(layer) {
    var result = 0;

    for (var i = 0; i < layer.length; i++) {
        var layerChar = layer.charCodeAt(i) - 97;

        result += layerChar * Math.pow(26, layer.length - 1 - i);
    }

    return result;
}

function fixObjectArray(obj) {
    if (Array.isArray(obj)) {
        return obj;
    }
    else {
        return [obj];
    }
}

function tryParseXmlLogic(jsonObj, result) {
    if (!jsonObj.objectData) {
        return false;
    }

    var objData = jsonObj.objectData;

    if (utils.isset(objData, 'model.dimensions')) {
        result.dimensions = objData.model.dimensions;
    }

    if (utils.isset(objData, 'model.directions.direction')) {
        var objDirections = fixObjectArray(objData.model.directions.direction);

        //console.log(objDirections);

        for (var i in objDirections) {
            var direction = objDirections[i].id / 90 * 2;

            result.directions.push(direction);
        }
    }

    return true;
}

function tryParseXmlAssets(jsonObj, result) {
    if (!jsonObj.assets) {
        return false;
    }

    var objAssets = fixObjectArray(jsonObj.assets.asset);
    for (var i in objAssets) {
        var asset = objAssets[i],
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

        result.assets[assetName] = asset;
    }

    return true;
}

function tryParseXmlIndex(jsonObj, result) {
    if (!jsonObj.object) {
        return false;
    }

    result.logic = jsonObj.object.logic;
    result.visualization = jsonObj.object.visualization;

    return true;
}

function tryParseXmlVisualization(jsonObj, result) {
    if (!jsonObj.visualizationData) {
        return false;
    }

    if (!utils.isset(jsonObj, 'visualizationData.graphics.visualization')) {
        return false;
    }

    var objVisualizations = jsonObj.visualizationData.graphics.visualization;
    for (var i in objVisualizations) {
        var objVisualization = objVisualizations[i];

        var visualization = {
            angle: objVisualization.angle,
            layerCount: objVisualization.layerCount
        }

        if (utils.isset(objVisualization, 'layers.layer')) {
            var objLayers = fixObjectArray(objVisualization.layers.layer),
                layers = {};

            for (var j in objLayers) {
                var layer = objLayers[j],
                    layerId = layer.id;
                delete layer.id;

                layers[layerId] = layer;
            }

            if (Object.keys(layers).length != 0) {
                visualization.layers = layers;
            }
        }

        if (utils.isset(objVisualization, 'directions.direction')) {
            var objDirections = fixObjectArray(objVisualization.directions.direction),
                directions = {};

            for (var j in objDirections) {
                var objDirection = objDirections[j];

                if (objDirection.layer) {
                    var objLayers = fixObjectArray(objDirection.layer),
                        layers = {};

                    for (var k in objLayers) {
                        var layer = objLayers[k],
                            layerId = layer.id;
                        delete layer.id;

                        layers[layerId] = layer;
                    }

                    if (Object.keys(layers).length != 0) {
                        directions[objDirection.id] = {};
                        directions[objDirection.id].layers = layers;
                    }
                }
            }

            if (Object.keys(directions).length != 0) {
                visualization.directions = directions;
            }
        }

        if (utils.isset(objVisualization, 'colors.color')) {
            var objColors = fixObjectArray(objVisualization.colors.color),
                colors = {};

            for (var j in objColors) {
                var objColor = objColors[j];

                //console.log(objColor);

                if (objColor.colorLayer) {
                    var objLayers = fixObjectArray(objColor.colorLayer),
                        layers = {};

                    for (var k in objLayers) {
                        var layer = objLayers[k],
                            layerId = layer.id;
                        delete layer.id;

                        layers[layerId] = layer;
                    }

                    if (Object.keys(layers).length != 0) {
                        colors[objColor.id] = {};
                        colors[objColor.id].layers = layers;
                    }
                }
            }

            if (Object.keys(colors).length != 0) {
                visualization.colors = colors;
            }
        }
    }

    return true;
}

module.exports = function(targetFolder, swfName, tagNames, binaryTags, finishCB) {
    var result = {
        renderType: 'furniture',

        name: swfName,
        logic: '',
        visualization: '',

        dimensions: {
            x: 0,
            y: 0,
            z: 0,
            centerZ: null
        },

        directions: [
        ],

        assets: {
        },

        graphics: {
        }
    };

    for (var i in binaryTags) {
        var binaryTag = binaryTags[i];
            tagData = binaryTag.data;
            binaryName = tagNames[tagData.symbolTag];

        console.log(binaryName);

        var jsonObj = x2js.xml2js(tagData.data);

        if (tryParseXmlIndex(jsonObj, result)) {
            console.log('Parsed XML: Index');
        }
        else if (tryParseXmlLogic(jsonObj, result)) {
            console.log('Parsed XML: Logic');
        }
        else if (tryParseXmlAssets(jsonObj, result)) {
            console.log('Parsed XML: Assets');
        }
        else if (tryParseXmlVisualization(jsonObj, result)) {
            console.log('Parsed XML: Visualization');
        }
        else if (!jsonObj.manifest) {
            finishCB('Parsed unknown XML'); return;
        }
    }

    fs.writeFileSync(targetFolder + '/' + swfName + '.json', JSON.stringify(result));

    finishCB(null);
};