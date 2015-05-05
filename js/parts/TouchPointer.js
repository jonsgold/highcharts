/* Support for touch devices */
Highcharts.extend(Highcharts.Pointer.prototype, {

	/**
	 * Run translation operations
	 */
	pinchTranslate: function (pinchDown, touches, transform, selectionMarker, clip, lastValidTouch) {
		if (this.zoomHor || this.pinchHor) {
			this.pinchTranslateDirection(true, pinchDown, touches, transform, selectionMarker, clip, lastValidTouch);
		}
		if (this.zoomVert || this.pinchVert) {
			this.pinchTranslateDirection(false, pinchDown, touches, transform, selectionMarker, clip, lastValidTouch);
		}
	},

	/**
	 * Run translation operations for each direction (horizontal and vertical) independently
	 */
	pinchTranslateDirection: function (horiz, pinchDown, touches, transform, selectionMarker, clip, lastValidTouch, forcedScale) {
		var chart = this.chart,
			xy = horiz ? 'x' : 'y',
			XY = horiz ? 'X' : 'Y',
			sChartXY = 'chart' + XY,
			wh = horiz ? 'width' : 'height',
			plotLeftTop = chart['plot' + (horiz ? 'Left' : 'Top')],
			selectionWH,
			selectionXY,
			clipXY,
			scale = forcedScale || 1,
			inverted = chart.inverted,
			bounds = chart.bounds[horiz ? 'h' : 'v'],
			singleTouch = pinchDown.length === 1,
			touch0Start = pinchDown[0][sChartXY],
			touch0Now = touches[0][sChartXY],
			touch1Start = !singleTouch && pinchDown[1][sChartXY],
			touch1Now = !singleTouch && touches[1][sChartXY],
			outOfBounds,
			transformScale,
			scaleKey,
			setScale = function () {
				if (!singleTouch && Math.abs(touch0Start - touch1Start) > 20) { // Don't zoom if fingers are too close on this axis
					scale = forcedScale || Math.abs(touch0Now - touch1Now) / Math.abs(touch0Start - touch1Start); 
				}
				
				clipXY = ((plotLeftTop - touch0Now) / scale) + touch0Start;
				selectionWH = chart['plot' + (horiz ? 'Width' : 'Height')] / scale;
			};

		// Set the scale, first pass
		setScale();

		selectionXY = clipXY; // the clip position (x or y) is altered if out of bounds, the selection position is not

		// Out of bounds
		if (selectionXY < bounds.min) {
			selectionXY = bounds.min;
			outOfBounds = true;
		} else if (selectionXY + selectionWH > bounds.max) {
			selectionXY = bounds.max - selectionWH;
			outOfBounds = true;
		}
		
		// Is the chart dragged off its bounds, determined by dataMin and dataMax?
		if (outOfBounds) {

			// Modify the touchNow position in order to create an elastic drag movement. This indicates
			// to the user that the chart is responsive but can't be dragged further.
			touch0Now -= 0.8 * (touch0Now - lastValidTouch[xy][0]);
			if (!singleTouch) {
				touch1Now -= 0.8 * (touch1Now - lastValidTouch[xy][1]);
			}

			// Set the scale, second pass to adapt to the modified touchNow positions
			setScale();

		} else {
			lastValidTouch[xy] = [touch0Now, touch1Now];
		}

		// Set geometry for clipping, selection and transformation
		if (!inverted) { // TODO: implement clipping for inverted charts
			clip[xy] = clipXY - plotLeftTop;
			clip[wh] = selectionWH;
		}
		scaleKey = inverted ? (horiz ? 'scaleY' : 'scaleX') : 'scale' + XY;
		transformScale = inverted ? 1 / scale : scale;

		selectionMarker[wh] = selectionWH;
		selectionMarker[xy] = selectionXY;
		transform[scaleKey] = scale;
		transform['translate' + XY] = (transformScale * plotLeftTop) + (touch0Now - (transformScale * touch0Start));
	},
	
	/**
	 * Handle touch events with two touches
	 */
	pinch: function (e) {

		var self = this,
			chart = self.chart,
			pinchDown = self.pinchDown,
			touches = e.touches,
			touchesLength = touches.length,
			lastValidTouch = self.lastValidTouch,
			hasZoom = self.hasZoom,
			selectionMarker = self.selectionMarker,
			transform = {},
			pick = Highcharts.pick,
			fireClickEvent = touchesLength === 1 && ((self.inClass(e.target, 'highcharts-tracker') && 
				chart.runTrackerClick) || self.runChartClick),
			clip = {};

		// On touch devices, only proceed to trigger click if a handler is defined
		if (hasZoom && !fireClickEvent) {
			e.preventDefault();
		}
		
		// Normalize each touch
		Highcharts.map(touches, function (e) {
			return self.normalize(e);
		});
		
		// Register the touch start position
		if (e.type === 'touchstart') {
			Highcharts.each(touches, function (e, i) {
				pinchDown[i] = { chartX: e.chartX, chartY: e.chartY };
			});
			lastValidTouch.x = [pinchDown[0].chartX, pinchDown[1] && pinchDown[1].chartX];
			lastValidTouch.y = [pinchDown[0].chartY, pinchDown[1] && pinchDown[1].chartY];

			// Identify the data bounds in pixels
			Highcharts.each(chart.axes, function (axis) {
				if (axis.zoomEnabled) {
					var bounds = chart.bounds[axis.horiz ? 'h' : 'v'],
						minPixelPadding = axis.minPixelPadding,
						min = axis.toPixels(pick(axis.options.min, axis.dataMin)),
						max = axis.toPixels(pick(axis.options.max, axis.dataMax)),
						absMin = Math.min(min, max),
						absMax = Math.max(min, max);

					// Store the bounds for use in the touchmove handler
					bounds.min = Math.min(axis.pos, absMin - minPixelPadding);
					bounds.max = Math.max(axis.pos + axis.len, absMax + minPixelPadding);
				}
			});
			self.res = true; // reset on next move
		
		// Event type is touchmove, handle panning and pinching
		} else if (pinchDown.length) { // can be 0 when releasing, if touchend fires first
			

			// Set the marker
			if (!selectionMarker) {
				self.selectionMarker = selectionMarker = Highcharts.extend({
					destroy: Highcharts.noop
				}, chart.plotBox);
			}
			
			self.pinchTranslate(pinchDown, touches, transform, selectionMarker, clip, lastValidTouch);

			self.hasPinched = hasZoom;

			// Scale and translate the groups to provide visual feedback during pinching
			self.scaleGroups(transform, clip);
			
			// Optionally move the tooltip on touchmove
			if (!hasZoom && self.followTouchMove && touchesLength === 1) {
				this.runPointActions(self.normalize(e));
			} else if (self.res) {
				self.res = false;
				this.reset(false, 0);
			}
		}
	},

	onContainerTouchStart: function (e) {
		var chart = this.chart;

		hoverChartIndex = chart.index;

		if (e.touches.length === 1) {

			e = this.normalize(e);

			if (chart.isInsidePlot(e.chartX - chart.plotLeft, e.chartY - chart.plotTop) && !chart.openMenu) {

				// Run mouse events and display tooltip etc
				this.runPointActions(e);

				this.pinch(e);

			} else {
				// Hide the tooltip on touching outside the plot area (#1203)
				this.reset();
			}

		} else if (e.touches.length === 2) {
			this.pinch(e);
		}   
	},

	onContainerTouchMove: function (e) {
		if (e.touches.length === 1 || e.touches.length === 2) {
			this.pinch(e);
		}
	},

	onDocumentTouchEnd: function (e) {
		if (Highcharts.charts[hoverChartIndex]) {
			Highcharts.charts[hoverChartIndex].pointer.drop(e);
		}
	}

});
