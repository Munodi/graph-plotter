/// <reference path="jquery.d.ts" />
"use strict";
var CartesianViewport = (function () {
    function CartesianViewport() {
        if (arguments.length == 0) {
            this.minX = -5;
            this.maxX = 5;
            this.minY = -5;
            this.maxY = 5;
        }
        else if (arguments.length == 4) {
            this.minX = arguments[0];
            this.maxX = arguments[1];
            this.minY = arguments[2];
            this.maxY = arguments[3];
        }
        else
            throw 'Can\'t construct CartesianViewport with ' + arguments.length + ' arguments';
    }
    CartesianViewport.fromJSON = function (str) {
        var obj = JSON.parse(str);
        return new CartesianViewport(obj.minX, obj.maxX, obj.minY, obj.maxY);
    };
    CartesianViewport.prototype.zoom = function (zoomAmt) {
        this.minX *= zoomAmt;
        this.maxX *= zoomAmt;
        this.minY *= zoomAmt;
        this.maxY *= zoomAmt;
    };
    CartesianViewport.prototype.isValid = function () {
        return this.minX < this.maxX && this.minY < this.maxY;
    };
    return CartesianViewport;
})();
var functions = [];
var cartesianBounds = new CartesianViewport();
var mouseX = -1;
// take an expression, with only 'x' as a variable and a list of values for 'x' and return a list of points
function expressionToPlotPoints(expression, xValues) {
    var parser = math.parser();
    parser.eval('f(x) = ' + expression);
    var func = parser.get('f');
    var plotPoints = new Array(xValues.length);
    for (var i = 0; i < xValues.length; ++i)
        plotPoints[i] = { x: xValues[i], y: func(xValues[i]) };
    return plotPoints;
}
function expressionToPlotPoint(expression, xValue) {
    var parser = math.parser();
    parser.eval('f(x) = ' + expression);
    var func = parser.get('f');
    return { x: xValue, y: func(xValue) };
}
function setPixel(imageData, x, y, r, g, b) {
    var index = (x + y * imageData.width) * 4;
    imageData.data[index + 0] = r;
    imageData.data[index + 1] = g;
    imageData.data[index + 2] = b;
    imageData.data[index + 3] = 255;
}
function drawAxes(ctx) {
    var cWidth = ctx.canvas.width;
    var cHeight = ctx.canvas.height;
    var viewportWidth = Math.abs(cartesianBounds.maxX - cartesianBounds.minX);
    var viewportHeight = Math.abs(cartesianBounds.maxY - cartesianBounds.minY);
    var xAxisPosition = Math.round(cHeight - ((0 - cartesianBounds.minY) / viewportHeight * cHeight));
    var yAxisPosition = Math.round((0 - cartesianBounds.minX) / viewportWidth * cWidth);
    ctx.beginPath();
    // draw x-axis
    ctx.moveTo(0, xAxisPosition + 0.5);
    ctx.lineTo(ctx.canvas.width, xAxisPosition + 0.5);
    ctx.lineTo(ctx.canvas.width - 4.5, xAxisPosition - 3.5);
    ctx.moveTo(ctx.canvas.width, xAxisPosition + 0.5);
    ctx.lineTo(ctx.canvas.width - 4.5, xAxisPosition + 4.5);
    // draw y-axis
    ctx.moveTo(yAxisPosition + 0.5, ctx.canvas.height);
    ctx.lineTo(yAxisPosition + 0.5, 0);
    ctx.lineTo(yAxisPosition - 3.5, 4.5);
    ctx.moveTo(yAxisPosition + 0.5, 0);
    ctx.lineTo(yAxisPosition + 4.5, 4.5);
    ctx.stroke();
    ctx.font = "12px sans-serif";
    ctx.fillText('x', cWidth - ctx.measureText('x').width - 6, xAxisPosition + 10);
    ctx.fillText('f(x)', yAxisPosition - ctx.measureText('f(x)').width - 6, 10);
}
function plotFunctions(viewport, cxt) {
    var imageData = cxt.getImageData(0, 0, cxt.canvas.width, cxt.canvas.height);
    var cWidth = imageData.width;
    var cHeight = imageData.height;
    var viewportWidth = Math.abs(viewport.maxX - viewport.minX);
    var viewportHeight = Math.abs(viewport.maxY - viewport.minY);
    // make a list of x-values in the cartesian system that fit in the ImageData
    var xValues = [];
    for (var i = 0; i < cWidth + 1; ++i) {
        xValues.push((viewportWidth / cWidth * i) + viewport.minX);
    }
    for (var fIndex = 0; fIndex < functions.length; ++fIndex) {
        try {
            var cartpoints = expressionToPlotPoints(functions[fIndex].expression, xValues);
        }
        catch (e) {
            continue;
        }
        //console.log(cartpoints);
        var points = [];
        for (var i = 0; i < cartpoints.length; ++i) {
            points[i] = cartesianPointToCanvasPoint(viewport, cWidth, cHeight, cartpoints[i]);
        }
        //console.log(points);
        // get components of hex colour
        var colourAsNum = parseInt(functions[fIndex].colour.substring(1), 16);
        var r = colourAsNum >> 16;
        var g = (colourAsNum >> 8) & 0xff;
        var b = colourAsNum & 0xff;
        for (var i = 1; i < points.length; ++i) {
            setPixel(imageData, points[i].x, points[i].y, r, g, b);
        }
        cxt.putImageData(imageData, 0, 0);
    }
}
function drawVerticalIntersectionLine(cxt) {
    var cHeight = cxt.canvas.height;
    var cWidth = cxt.canvas.width;
    if (mouseX >= 0) {
        cxt.save();
        // print dashed vertial line at mouse position
        cxt.beginPath();
        cxt.setLineDash([10, 5]);
        cxt.moveTo(mouseX + 0.5, 0);
        cxt.lineTo(mouseX + 0.5, cHeight);
        cxt.strokeStyle = '#7f7f7f';
        cxt.stroke();
        // print all x and f(x) values at the line next to the line
        var viewportWidth = Math.abs(cartesianBounds.maxX - cartesianBounds.minX);
        var xValue = mouseX / cWidth * viewportWidth + cartesianBounds.minX; // cartesian x value for mouseX TODO: fix
        var printList = [];
        var width = 0;
        for (var i = 0; i < functions.length; ++i) {
            try {
                var p = expressionToPlotPoint(functions[i].expression, xValue);
                printList.push({ string: "x: " + p.x.toPrecision(4) + ", f(x): " + p.y.toPrecision(4), colour: functions[i].colour });
                width = Math.max(width, Math.ceil(cxt.measureText(printList[printList.length - 1].string).width));
            }
            catch (e) {
                continue;
            }
        }
        //console.log(printList);
        if (printList.length > 0) {
            var leftOfLine = mouseX >= width; // if true print strings on left side of line, else right side
            var lineHeight = 15;
            var currectYInCanvas = 14;
            cxt.font = 12 + "px sans-serif";
            for (var i = 0; i < printList.length; ++i) {
                cxt.fillStyle = printList[i].colour;
                cxt.fillText(printList[i].string, leftOfLine ? (mouseX - width) : mouseX, currectYInCanvas);
                currectYInCanvas += lineHeight;
            }
        }
        cxt.restore();
    }
}
// Convert a point in the cartesian system to a pixel location to plot
// TODO: there seems to be a bug where pixels overflow
function cartesianPointToCanvasPoint(viewport, cWidth, cHeight, cartpoint) {
    var viewportWidth = Math.abs(viewport.maxX - viewport.minX);
    var viewportHeight = Math.abs(viewport.maxY - viewport.minY);
    var p = {
        x: Math.round((cartpoint.x - viewport.minX) / viewportWidth * cWidth),
        y: Math.round(cHeight - ((cartpoint.y - viewport.minY) / viewportHeight * cHeight))
    };
    if (p.x >= cWidth)
        p.x = NaN;
    return p;
}
function canvasPointToCartesian(viewport, cWidth, cHeight, canvaspoint) {
    var viewportWidth = Math.abs(viewport.maxX - viewport.minX);
    var viewportHeight = Math.abs(viewport.maxY - viewport.minY);
    // TODO: finish
    return {
        x: 0,
        y: 0
    };
}
function paint() {
    var cxt = document.getElementById('plotCanvas').getContext('2d');
    cxt.clearRect(0, 0, cxt.canvas.width, cxt.canvas.height);
    drawAxes(cxt);
    plotFunctions(cartesianBounds, cxt);
    drawVerticalIntersectionLine(cxt);
}
// Called when the inputs are changed to redraw the graphs and save input state to url
function update() {
    paint();
    // TODO: update url
}
// Ajdust the canvas size to take up optimal space. If the size is changed the graphs will be redrawn.
function fixCanvasSize() {
    var newSize = Math.max(Math.min(document.getElementById('plotCanvasHolder').clientWidth, window.innerHeight - $('#page-header>*').outerHeight(true) - $('#controls').outerHeight(true)) & 0xfffffff0, 192);
    var canvas = document.getElementById('plotCanvas');
    if (canvas.width != newSize) {
        canvas.width = newSize;
        canvas.height = newSize;
        update();
    }
}
$(document).ready(function () {
    $("#cartesianBoundsInput").submit(function () {
        if ($("#minX")[0].checkValidity() && $("#maxX")[0].checkValidity() && $("#minY")[0].checkValidity() && $("#maxY")[0].checkValidity()) {
            var minX = parseFloat($("#minX").val()), maxX = parseFloat($("#maxX").val()), minY = parseFloat($("#minY").val()), maxY = parseFloat($("#maxY").val());
            cartesianBounds = new CartesianViewport(minX, maxX, minY, maxY);
            update();
        }
        return false;
    });
    // read cartesianBounds out of url if passed
    var serialised = getURLParameter('cartesianBounds');
    if (serialised) {
        var temp = JSON.parse(serialised);
        cartesianBounds.minX = temp.minX;
        cartesianBounds.maxX = temp.maxX;
        cartesianBounds.minY = temp.minY;
        cartesianBounds.maxY = temp.maxY;
    }
    updateCartesianBoundsView();
    fixCanvasSize();
    document.getElementById('plotCanvas').onwheel = function (event) {
        //var mousex = event.clientX - canvas.offsetLeft;
        //var mousey = event.clientY - canvas.offsetTop;
        var wheel = event.deltaY / 120; //n or -n
        var zoom = 1 + wheel / 2;
        console.log(zoom);
        cartesianBounds.zoom(zoom);
        updateCartesianBoundsView();
        update();
        return false;
    };
    document.getElementById('plotCanvas').addEventListener("mousemove", mouseMoveMouseX, false);
    document.getElementById('plotCanvas').addEventListener("mouseleave", mouseClearMouseX, false);
    function mouseMoveMouseX(event) {
        mouseX = event.clientX - document.getElementById('plotCanvas').getBoundingClientRect().left;
        paint();
    }
    function mouseClearMouseX(event) {
        mouseX = -1;
        paint();
    }
});
$(window).resize(fixCanvasSize);
function updateCartesianBoundsView() {
    document.getElementById('minX').valueAsNumber = cartesianBounds.minX;
    document.getElementById('maxX').valueAsNumber = cartesianBounds.maxX;
    document.getElementById('minY').valueAsNumber = cartesianBounds.minY;
    document.getElementById('maxY').valueAsNumber = cartesianBounds.maxY;
}
function addFunction() {
    if (typeof addFunction.counter == 'undefined')
        addFunction.counter = 1;
    else
        addFunction.counter = (addFunction.counter + 1) % 7;
    var temp = addFunction.counter;
    var colour = '#' + ('00000' + (((temp & 4) >> 2) * 0xbf0000 + ((temp & 2) >> 1) * 0xbf00 + (temp & 1) * 0xbf).toString(16)).slice(-6);
    // add new empty PlottedFunction to model
    functions.push({ colour: colour, expression: "" });
    // update view
    var template = $('#function-template').html();
    var info = Mustache.to_html(template, functions[functions.length - 1]);
    $('#functionsInput').append(info);
    fixCanvasSize();
    update();
}
function updateFunctionExpression(singleFunctionView) {
    var $singleFunctionView = $(singleFunctionView);
    var indexInFunctions = $singleFunctionView.prevAll('div').length; // number of previous siblings is equal to index in functions array
    functions[indexInFunctions].expression = singleFunctionView.querySelector('.functionExpression').value;
    update();
}
function updateFunctionColour(singleFunctionView) {
    var $singleFunctionView = $(singleFunctionView);
    var indexInFunctions = $singleFunctionView.prevAll('div').length; // number of previous siblings is equal to index in functions array
    functions[indexInFunctions].colour = singleFunctionView.querySelector('.functionColour').value;
    update();
}
function deleteFunction(singleFunctionView) {
    var $singleFunctionView = $(singleFunctionView);
    var indexInFunctions = $singleFunctionView.prevAll('div').length; // number of previous siblings is equal to index in functions array
    $singleFunctionView.remove();
    functions.splice(indexInFunctions, 1);
    update();
}
// originally from http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html, edited
function getURLParameter(sParam) {
    var sPageURL = window.location.search.substring(1);
    var sURLVariables = sPageURL.split('&');
    for (var i = 0; i < sURLVariables.length; i++) {
        var sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] == sParam) {
            return decodeURIComponent(sParameterName[1]);
        }
    }
}