/// <reference path="jquery.d.ts" />

"use strict";

class CartesianViewport {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    constructor();
    constructor(minX: number, maxX: number, minY: number, maxY: number);
    constructor() {
        if (arguments.length == 0) {
            this.minX = -10;
            this.maxX = 10;
            this.minY = -10;
            this.maxY = 10;
        }
        else if (arguments.length == 4) {
            this.minX = arguments[0];
            this.maxX = arguments[1];
            this.minY = arguments[2];
            this.maxY = arguments[3];
        }
        else throw 'Can\'t construct CartesianViewport with ' + arguments.length + ' arguments';
    }

    static fromJSON(str: string) {
        var obj = JSON.parse(str);
        return new CartesianViewport(obj.minX, obj.maxX, obj.minY, obj.maxY);
    }

    zoom(zoomAmt): void {
        this.minX *= zoomAmt;
        this.maxX *= zoomAmt;
        this.minY *= zoomAmt;
        this.maxY *= zoomAmt;
    }

    isValid(): boolean {
        return this.minX < this.maxX && this.minY < this.maxY;
    }
}

interface Point {
    x: number;
    y: number;
}

interface PlottedFunction {
    colour: string;
    expression: string;
}

var functions: PlottedFunction[] = [];
var cartesianBounds: CartesianViewport = new CartesianViewport();
var mouseX = -1;

// read cartesianBounds out of url if passed
(function () {
    var serialised = getURLParameter('cartesianBounds');
    if (serialised) {
        var temp = JSON.parse(serialised);
        cartesianBounds.minX = temp.minX;
        cartesianBounds.maxX = temp.maxX;
        cartesianBounds.minY = temp.minY;
        cartesianBounds.maxY = temp.maxY;
    }
});


// take an expression, with only 'x' as a variable and a list of values for 'x' and return a list of points
function expressionToPlotPoints(expression: string, xValues: number[]): Point[] {
    var parser = math.parser();
    parser.eval('f(x) = ' + expression);
    var func = parser.get('f');
    var plotPoints: Point[] = new Array(xValues.length);
    for (var i = 0; i < xValues.length; ++i)
        plotPoints[i] = { x: xValues[i], y: func(xValues[i]) };
    return plotPoints;
}

function expressionToPlotPoint(expression: string, xValue: number): Point {
    var parser = math.parser();
    parser.eval('f(x) = ' + expression);
    var func = parser.get('f');
    return { x: xValue, y: func(xValue) };
}

function setPixel(imageData: ImageData, x: number, y: number, r: number, g: number, b: number): void {
    var index = (x + y * imageData.width) * 4;
    imageData.data[index + 0] = r;
    imageData.data[index + 1] = g;
    imageData.data[index + 2] = b;
    imageData.data[index + 3] = 255;
}

function drawAxes(ctx: CanvasRenderingContext2D): void {
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

function plotFunctions(viewport: CartesianViewport, cxt: CanvasRenderingContext2D): void {
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
        // calculate cartesian points to plot then turn them into pixels in the ImageData to set
        try {
            var cartpoints = expressionToPlotPoints(functions[fIndex].expression, xValues);
        } catch (e) {
            continue;   // on badly formed expression skip to next
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

function drawVerticalIntersectionLine(cxt: CanvasRenderingContext2D): void {
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
        var xValue = mouseX / cWidth * viewportWidth + cartesianBounds.minX; // cartesian x value for mouseX
        
        var lineHeight = 15;
        cxt.font = 14 + "px sans-serif"

        var printList: {
            string: string;
            colour: string;
        }[] = [{ string: "x = " + xValue.toPrecision(4), colour: '#000' }];
        var width = Math.ceil(cxt.measureText(printList[printList.length - 1].string).width);
        for (var i = 0; i < functions.length; ++i) {
            try {
                var p: Point = expressionToPlotPoint(functions[i].expression, xValue);
                printList.push({ string: "f(x) = " + p.y.toPrecision(4), colour: functions[i].colour });
                width = Math.max(width, Math.ceil(cxt.measureText(printList[printList.length - 1].string).width));
            } catch (e) {
                continue;
            }
        }
        //console.log(printList);

        
        var leftOfLine = mouseX >= width + 2;    // if true print strings on left side of line, else right side
        var currectYInCanvas = 14;
        for (var i = 0; i < printList.length; ++i) {
            cxt.fillStyle = printList[i].colour;
            cxt.fillText(printList[i].string, leftOfLine ? (mouseX - width - 2) : mouseX + 2, currectYInCanvas);
            currectYInCanvas += lineHeight;
        }

        cxt.restore();
    }
}

// Convert a point in the cartesian system to a pixel location to plot
// TODO: there seems to be a bug where pixels overflow
function cartesianPointToCanvasPoint(viewport: CartesianViewport, cWidth: number, cHeight: number, cartpoint: Point): Point {
    var viewportWidth = Math.abs(viewport.maxX - viewport.minX);
    var viewportHeight = Math.abs(viewport.maxY - viewport.minY);

    var p: Point = {
        x: Math.round((cartpoint.x - viewport.minX) / viewportWidth * cWidth),
        y: Math.round(cHeight - ((cartpoint.y - viewport.minY) / viewportHeight * cHeight))
    };
    if (p.x >= cWidth)
        p.x = NaN;
    return p;
}

function canvasPointToCartesian(viewport: CartesianViewport, cWidth: number, cHeight: number, canvaspoint: Point): Point {
    var viewportWidth = Math.abs(viewport.maxX - viewport.minX);
    var viewportHeight = Math.abs(viewport.maxY - viewport.minY);
    // TODO: finish
    return {
        x: canvaspoint.x / cWidth * viewportWidth + cartesianBounds.minX,
        y: 0
    };
}

function paint(): void {
    if (!cartesianBounds.isValid())
        return;
    var cxt = (<HTMLCanvasElement> document.getElementById('plotCanvas')).getContext('2d');
    cxt.clearRect(0, 0, cxt.canvas.width, cxt.canvas.height);

    drawAxes(cxt);
    plotFunctions(cartesianBounds, cxt);
    drawVerticalIntersectionLine(cxt);
}

// Called when the inputs are changed to redraw the graphs and save input state to url
function update(): void {
    paint();
    // TODO: update url
}

// Ajdust the canvas size to take up optimal space. If the size is changed the graphs will be redrawn.
function fixCanvasSize(): void {
    var newSize = Math.max(Math.min(document.getElementById('plotCanvasHolder').clientWidth, window.innerHeight - $('#page-header>*').outerHeight(true) - $('#controls').outerHeight(true)) & 0xfffffff0, 224);
    var canvas: HTMLCanvasElement = <HTMLCanvasElement> document.getElementById('plotCanvas');

    if (canvas.width != newSize) {
        canvas.width = newSize;
        canvas.height = newSize;

        update();
    }
}

$(document).ready(function () {

    var checkMinMax = function () {
        var temp = new CartesianViewport(
            parseFloat((<HTMLInputElement> document.getElementById('minX')).value),
            parseFloat((<HTMLInputElement> document.getElementById('maxX')).value),
            parseFloat((<HTMLInputElement> document.getElementById('minY')).value),
            parseFloat((<HTMLInputElement> document.getElementById('maxY')).value));
        document.getElementById('minMaxErrorMessage').hidden = temp.isValid();
    };
    var updateCartesianBoundsModel = function () {
        cartesianBounds[this.getAttribute('id')] = parseFloat(this.value);
        update();
    };
    $("#minX, #maxX, #minY, #maxY").on('input', checkMinMax);
    $("#minX, #maxX, #minY, #maxY").on('input', updateCartesianBoundsModel);

    updateCartesianBoundsView();

    fixCanvasSize();

    (<HTMLCanvasElement> document.getElementById('plotCanvas')).onwheel = function (event) {
        var wheel = event.deltaY / 120;//n or -n
        console.log(event.deltaMode);
        //console.log(wheel);

        var zoom = Math.pow(2, wheel);
        console.log(zoom);
        //console.log(zoom);

        cartesianBounds.zoom(zoom);
        updateCartesianBoundsView();
        update();

        return false;
    };

    (<HTMLCanvasElement> document.getElementById('plotCanvas')).addEventListener("mousemove", mouseMoveMouseX, false);
    (<HTMLCanvasElement> document.getElementById('plotCanvas')).addEventListener("mouseleave", mouseClearMouseX, false);

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

function updateCartesianBoundsView(): void {
    (<HTMLInputElement> document.getElementById('minX')).valueAsNumber = cartesianBounds.minX;
    (<HTMLInputElement> document.getElementById('maxX')).valueAsNumber = cartesianBounds.maxX;
    (<HTMLInputElement> document.getElementById('minY')).valueAsNumber = cartesianBounds.minY;
    (<HTMLInputElement> document.getElementById('maxY')).valueAsNumber = cartesianBounds.maxY;
}

function addFunction(): void {
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

function updateFunctionExpression(singleFunctionView: HTMLDivElement): void {
    var $singleFunctionView = $(singleFunctionView);
    var indexInFunctions = $singleFunctionView.prevAll('div').length;   // number of previous siblings is equal to index in functions array
    functions[indexInFunctions].expression = (<HTMLInputElement> singleFunctionView.querySelector('.functionExpression')).value;
    update();
}

function updateFunctionColour(singleFunctionView: HTMLDivElement): void {
    var $singleFunctionView = $(singleFunctionView);
    var indexInFunctions = $singleFunctionView.prevAll('div').length;   // number of previous siblings is equal to index in functions array
    functions[indexInFunctions].colour = (<HTMLInputElement> singleFunctionView.querySelector('.functionColour')).value;
    update();
}

function deleteFunction(singleFunctionView: HTMLDivElement): void {
    var $singleFunctionView = $(singleFunctionView);
    var indexInFunctions = $singleFunctionView.prevAll('div').length;   // number of previous siblings is equal to index in functions array
    $singleFunctionView.remove();
    functions.splice(indexInFunctions, 1);
    fixCanvasSize();
    update();
}

// originally from http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html, edited
function getURLParameter(sParam: string) {
    var sPageURL = window.location.search.substring(1);
    var sURLVariables = sPageURL.split('&');
    for (var i = 0; i < sURLVariables.length; i++) {
        var sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] == sParam) {
            return decodeURIComponent(sParameterName[1]);
        }
    }
}​