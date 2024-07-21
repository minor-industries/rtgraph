// ../../node_modules/tinyqueue/index.js
var TinyQueue = class {
  constructor(data = [], compare = (a, b) => a < b ? -1 : a > b ? 1 : 0) {
    this.data = data;
    this.length = this.data.length;
    this.compare = compare;
    if (this.length > 0) {
      for (let i = (this.length >> 1) - 1; i >= 0; i--) this._down(i);
    }
  }
  push(item) {
    this.data.push(item);
    this._up(this.length++);
  }
  pop() {
    if (this.length === 0) return void 0;
    const top = this.data[0];
    const bottom = this.data.pop();
    if (--this.length > 0) {
      this.data[0] = bottom;
      this._down(0);
    }
    return top;
  }
  peek() {
    return this.data[0];
  }
  _up(pos) {
    const { data, compare } = this;
    const item = data[pos];
    while (pos > 0) {
      const parent = pos - 1 >> 1;
      const current = data[parent];
      if (compare(item, current) >= 0) break;
      data[pos] = current;
      pos = parent;
    }
    data[pos] = item;
  }
  _down(pos) {
    const { data, compare } = this;
    const halfLength = this.length >> 1;
    const item = data[pos];
    while (pos < halfLength) {
      let bestChild = (pos << 1) + 1;
      const right = bestChild + 1;
      if (right < this.length && compare(data[right], data[bestChild]) < 0) {
        bestChild = right;
      }
      if (compare(data[bestChild], item) >= 0) break;
      data[pos] = data[bestChild];
      pos = bestChild;
    }
    data[pos] = item;
  }
};

// dist/binary_search.js
function binarySearch(arr, notFoundValue, comparator) {
  let left = 0;
  let right = arr.length - 1;
  let result = notFoundValue;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (comparator(arr[mid])) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return result;
}

// dist/sorted_array_merge.js
function sortedArrayMerge(arr1x, arr1y, arr2x, arr2y) {
  let m = arr1x.length;
  let n = arr2x.length;
  arr1x.length = m + n;
  let i = m - 1;
  let j = n - 1;
  let k = m + n - 1;
  while (i >= 0 && j >= 0) {
    if (arr1x[i] > arr2x[j]) {
      arr1x[k] = arr1x[i];
      arr1y[k] = arr1y[i];
      i--;
    } else {
      arr1x[k] = arr2x[j];
      arr1y[k] = arr2y[j];
      j--;
    }
    k--;
  }
  while (j >= 0) {
    arr1x[k] = arr2x[j];
    arr1y[k] = arr2y[j];
    j--;
    k--;
  }
  return arr1x;
}

// dist/combine.js
var Cache = class {
  constructor(numSeries, maxGapMS) {
    this.overlapCount = 0;
    this.maxGapMS = maxGapMS;
    this.data = [];
    this.series = [];
    for (let i = 0; i < numSeries; i++) {
      this.series[i] = {
        Pos: i,
        Timestamps: [],
        Values: []
      };
    }
  }
  newRow(timestamp) {
    const row = new Array(this.series.length + 1);
    row.fill(null, 1);
    row[0] = new Date(timestamp);
    this.data.push(row);
    return row;
  }
  interleave(data) {
    if (data.length === 0) {
      return;
    }
    let row;
    let first = true;
    this.mergeAndAddGaps(data, (sample) => {
      const [pos, timestamp, value, _] = sample;
      if (first || row[0].getTime() !== timestamp) {
        row = this.newRow(timestamp);
        first = false;
      }
      row[pos + 1] = value;
    });
  }
  append(data) {
    this.interleave(data);
  }
  getData() {
    return this.data;
  }
  detectOverlap(data) {
    if (this.data.length === 0) {
      return [0, false];
    }
    const t1 = data.filter((x) => x.Timestamps.length > 0).map((x) => x.Timestamps[0]).reduce((acc, x) => x < acc ? x : acc, Number.MAX_VALUE);
    if (t1 === Number.MAX_VALUE) {
      return [0, false];
    }
    const t0 = this.data[this.data.length - 1][0].getTime();
    return [t1, t1 <= t0];
  }
  mergeSingleSeries(series) {
    const existing = this.series[series.Pos];
    if (existing.Values.length === 0) {
      existing.Timestamps = series.Timestamps;
      existing.Values = series.Values;
    } else {
      sortedArrayMerge(existing.Timestamps, existing.Values, series.Timestamps, series.Values);
    }
  }
  mergeAndAddGaps(data, callback) {
    const [minT, overlap] = this.detectOverlap(data);
    let startPositions;
    if (overlap) {
      this.overlapCount++;
      this.data.length = binarySearch(this.data, this.data.length, (x) => x[0].getTime() >= minT);
      startPositions = this.series.map((s) => {
        return binarySearch(s.Timestamps, s.Timestamps.length, (x) => x >= minT);
      });
    } else {
      startPositions = this.series.map((x) => x.Timestamps.length);
    }
    for (let i = 0; i < data.length; i++) {
      this.mergeSingleSeries(data[i]);
    }
    const queue = new TinyQueue([], (a, b) => {
      return a[1] - b[1];
    });
    for (let pos = 0; pos < this.series.length; pos++) {
      const series = this.series[pos];
      const start = startPositions[pos];
      if (series.Timestamps.length === start) {
        continue;
      }
      const storedSeries = this.series[pos];
      if (start > 0) {
        const t0 = storedSeries.Timestamps[start - 1];
        const t1 = series.Timestamps[start];
        if (t1 - t0 > this.maxGapMS) {
          queue.push([pos, t1 - 1, NaN, -1]);
        }
      }
      queue.push([pos, series.Timestamps[start], series.Values[start], start]);
    }
    while (queue.length > 0) {
      const item = queue.pop();
      const idx = item[3];
      callback(item);
      if (idx < 0) {
        continue;
      }
      const pos = item[0];
      const series = this.series[pos];
      const next = idx + 1;
      if (next >= series.Timestamps.length) {
        continue;
      }
      const t0 = item[1];
      const t1 = series.Timestamps[next];
      if (t1 - t0 > this.maxGapMS) {
        queue.push([pos, t1 - 1, NaN, -1]);
      }
      queue.push([pos, series.Timestamps[next], series.Values[next], next]);
    }
  }
};

// ../../node_modules/dygraphs/src/dygraph-tickers.js
var numericLinearTicks = function(a, b, pixels, opts, dygraph, vals) {
  var nonLogscaleOpts = function(opt) {
    if (opt === "logscale") return false;
    return opts(opt);
  };
  return numericTicks(a, b, pixels, nonLogscaleOpts, dygraph, vals);
};
var numericTicks = function(a, b, pixels, opts, dygraph, vals) {
  var pixels_per_tick = (
    /** @type{number} */
    opts("pixelsPerLabel")
  );
  var ticks = [];
  var i, j, tickV, nTicks;
  if (vals) {
    for (i = 0; i < vals.length; i++) {
      ticks.push({ v: vals[i] });
    }
  } else {
    if (opts("logscale")) {
      nTicks = Math.floor(pixels / pixels_per_tick);
      var minIdx = binarySearch2(a, PREFERRED_LOG_TICK_VALUES, 1);
      var maxIdx = binarySearch2(b, PREFERRED_LOG_TICK_VALUES, -1);
      if (minIdx == -1) {
        minIdx = 0;
      }
      if (maxIdx == -1) {
        maxIdx = PREFERRED_LOG_TICK_VALUES.length - 1;
      }
      var lastDisplayed = null;
      if (maxIdx - minIdx >= nTicks / 4) {
        for (var idx = maxIdx; idx >= minIdx; idx--) {
          var tickValue = PREFERRED_LOG_TICK_VALUES[idx];
          var pixel_coord = Math.log(tickValue / a) / Math.log(b / a) * pixels;
          var tick = { v: tickValue };
          if (lastDisplayed === null) {
            lastDisplayed = {
              tickValue,
              pixel_coord
            };
          } else {
            if (Math.abs(pixel_coord - lastDisplayed.pixel_coord) >= pixels_per_tick) {
              lastDisplayed = {
                tickValue,
                pixel_coord
              };
            } else {
              tick.label = "";
            }
          }
          ticks.push(tick);
        }
        ticks.reverse();
      }
    }
    if (ticks.length === 0) {
      var kmg2 = opts("labelsKMG2");
      var mults, base;
      if (kmg2) {
        mults = [1, 2, 4, 8, 16, 32, 64, 128, 256];
        base = 16;
      } else {
        mults = [1, 2, 5, 10, 20, 50, 100];
        base = 10;
      }
      var max_ticks = Math.ceil(pixels / pixels_per_tick);
      var units_per_tick = Math.abs(b - a) / max_ticks;
      var base_power = Math.floor(Math.log(units_per_tick) / Math.log(base));
      var base_scale = Math.pow(base, base_power);
      var scale, low_val, high_val, spacing;
      for (j = 0; j < mults.length; j++) {
        scale = base_scale * mults[j];
        low_val = Math.floor(a / scale) * scale;
        high_val = Math.ceil(b / scale) * scale;
        nTicks = Math.abs(high_val - low_val) / scale;
        spacing = pixels / nTicks;
        if (spacing > pixels_per_tick) break;
      }
      if (low_val > high_val) scale *= -1;
      for (i = 0; i <= nTicks; i++) {
        tickV = low_val + i * scale;
        ticks.push({ v: tickV });
      }
    }
  }
  var formatter = (
    /**@type{AxisLabelFormatter}*/
    opts("axisLabelFormatter")
  );
  for (i = 0; i < ticks.length; i++) {
    if (ticks[i].label !== void 0) continue;
    ticks[i].label = formatter.call(dygraph, ticks[i].v, 0, opts, dygraph);
  }
  return ticks;
};
var dateTicker = function(a, b, pixels, opts, dygraph, vals) {
  var chosen = pickDateTickGranularity(a, b, pixels, opts);
  if (chosen >= 0) {
    return getDateAxis(a, b, chosen, opts, dygraph);
  } else {
    return [];
  }
};
var Granularity = {
  MILLISECONDLY: 0,
  TWO_MILLISECONDLY: 1,
  FIVE_MILLISECONDLY: 2,
  TEN_MILLISECONDLY: 3,
  FIFTY_MILLISECONDLY: 4,
  HUNDRED_MILLISECONDLY: 5,
  FIVE_HUNDRED_MILLISECONDLY: 6,
  SECONDLY: 7,
  TWO_SECONDLY: 8,
  FIVE_SECONDLY: 9,
  TEN_SECONDLY: 10,
  THIRTY_SECONDLY: 11,
  MINUTELY: 12,
  TWO_MINUTELY: 13,
  FIVE_MINUTELY: 14,
  TEN_MINUTELY: 15,
  THIRTY_MINUTELY: 16,
  HOURLY: 17,
  TWO_HOURLY: 18,
  SIX_HOURLY: 19,
  DAILY: 20,
  TWO_DAILY: 21,
  WEEKLY: 22,
  MONTHLY: 23,
  QUARTERLY: 24,
  BIANNUAL: 25,
  ANNUAL: 26,
  DECADAL: 27,
  CENTENNIAL: 28,
  NUM_GRANULARITIES: 29
};
var DateField = {
  DATEFIELD_Y: 0,
  DATEFIELD_M: 1,
  DATEFIELD_D: 2,
  DATEFIELD_HH: 3,
  DATEFIELD_MM: 4,
  DATEFIELD_SS: 5,
  DATEFIELD_MS: 6,
  NUM_DATEFIELDS: 7
};
var TICK_PLACEMENT = [];
TICK_PLACEMENT[Granularity.MILLISECONDLY] = { datefield: DateField.DATEFIELD_MS, step: 1, spacing: 1 };
TICK_PLACEMENT[Granularity.TWO_MILLISECONDLY] = { datefield: DateField.DATEFIELD_MS, step: 2, spacing: 2 };
TICK_PLACEMENT[Granularity.FIVE_MILLISECONDLY] = { datefield: DateField.DATEFIELD_MS, step: 5, spacing: 5 };
TICK_PLACEMENT[Granularity.TEN_MILLISECONDLY] = { datefield: DateField.DATEFIELD_MS, step: 10, spacing: 10 };
TICK_PLACEMENT[Granularity.FIFTY_MILLISECONDLY] = { datefield: DateField.DATEFIELD_MS, step: 50, spacing: 50 };
TICK_PLACEMENT[Granularity.HUNDRED_MILLISECONDLY] = { datefield: DateField.DATEFIELD_MS, step: 100, spacing: 100 };
TICK_PLACEMENT[Granularity.FIVE_HUNDRED_MILLISECONDLY] = { datefield: DateField.DATEFIELD_MS, step: 500, spacing: 500 };
TICK_PLACEMENT[Granularity.SECONDLY] = { datefield: DateField.DATEFIELD_SS, step: 1, spacing: 1e3 * 1 };
TICK_PLACEMENT[Granularity.TWO_SECONDLY] = { datefield: DateField.DATEFIELD_SS, step: 2, spacing: 1e3 * 2 };
TICK_PLACEMENT[Granularity.FIVE_SECONDLY] = { datefield: DateField.DATEFIELD_SS, step: 5, spacing: 1e3 * 5 };
TICK_PLACEMENT[Granularity.TEN_SECONDLY] = { datefield: DateField.DATEFIELD_SS, step: 10, spacing: 1e3 * 10 };
TICK_PLACEMENT[Granularity.THIRTY_SECONDLY] = { datefield: DateField.DATEFIELD_SS, step: 30, spacing: 1e3 * 30 };
TICK_PLACEMENT[Granularity.MINUTELY] = { datefield: DateField.DATEFIELD_MM, step: 1, spacing: 1e3 * 60 };
TICK_PLACEMENT[Granularity.TWO_MINUTELY] = { datefield: DateField.DATEFIELD_MM, step: 2, spacing: 1e3 * 60 * 2 };
TICK_PLACEMENT[Granularity.FIVE_MINUTELY] = { datefield: DateField.DATEFIELD_MM, step: 5, spacing: 1e3 * 60 * 5 };
TICK_PLACEMENT[Granularity.TEN_MINUTELY] = { datefield: DateField.DATEFIELD_MM, step: 10, spacing: 1e3 * 60 * 10 };
TICK_PLACEMENT[Granularity.THIRTY_MINUTELY] = { datefield: DateField.DATEFIELD_MM, step: 30, spacing: 1e3 * 60 * 30 };
TICK_PLACEMENT[Granularity.HOURLY] = { datefield: DateField.DATEFIELD_HH, step: 1, spacing: 1e3 * 3600 };
TICK_PLACEMENT[Granularity.TWO_HOURLY] = { datefield: DateField.DATEFIELD_HH, step: 2, spacing: 1e3 * 3600 * 2 };
TICK_PLACEMENT[Granularity.SIX_HOURLY] = { datefield: DateField.DATEFIELD_HH, step: 6, spacing: 1e3 * 3600 * 6 };
TICK_PLACEMENT[Granularity.DAILY] = { datefield: DateField.DATEFIELD_D, step: 1, spacing: 1e3 * 86400 };
TICK_PLACEMENT[Granularity.TWO_DAILY] = { datefield: DateField.DATEFIELD_D, step: 2, spacing: 1e3 * 86400 * 2 };
TICK_PLACEMENT[Granularity.WEEKLY] = { datefield: DateField.DATEFIELD_D, step: 7, spacing: 1e3 * 604800 };
TICK_PLACEMENT[Granularity.MONTHLY] = { datefield: DateField.DATEFIELD_M, step: 1, spacing: 1e3 * 7200 * 365.2425 };
TICK_PLACEMENT[Granularity.QUARTERLY] = { datefield: DateField.DATEFIELD_M, step: 3, spacing: 1e3 * 21600 * 365.2425 };
TICK_PLACEMENT[Granularity.BIANNUAL] = { datefield: DateField.DATEFIELD_M, step: 6, spacing: 1e3 * 43200 * 365.2425 };
TICK_PLACEMENT[Granularity.ANNUAL] = { datefield: DateField.DATEFIELD_Y, step: 1, spacing: 1e3 * 86400 * 365.2425 };
TICK_PLACEMENT[Granularity.DECADAL] = { datefield: DateField.DATEFIELD_Y, step: 10, spacing: 1e3 * 864e3 * 365.2425 };
TICK_PLACEMENT[Granularity.CENTENNIAL] = { datefield: DateField.DATEFIELD_Y, step: 100, spacing: 1e3 * 864e4 * 365.2425 };
var PREFERRED_LOG_TICK_VALUES = function() {
  var vals = [];
  for (var power = -39; power <= 39; power++) {
    var range = Math.pow(10, power);
    for (var mult = 1; mult <= 9; mult++) {
      var val = range * mult;
      vals.push(val);
    }
  }
  return vals;
}();
var pickDateTickGranularity = function(a, b, pixels, opts) {
  var pixels_per_tick = (
    /** @type{number} */
    opts("pixelsPerLabel")
  );
  for (var i = 0; i < Granularity.NUM_GRANULARITIES; i++) {
    var num_ticks = numDateTicks(a, b, i);
    if (pixels / num_ticks >= pixels_per_tick) {
      return i;
    }
  }
  return -1;
};
var numDateTicks = function(start_time, end_time, granularity) {
  var spacing = TICK_PLACEMENT[granularity].spacing;
  return Math.round(1 * (end_time - start_time) / spacing);
};
var getDateAxis = function(start_time, end_time, granularity, opts, dg) {
  var formatter = (
    /** @type{AxisLabelFormatter} */
    opts("axisLabelFormatter")
  );
  var utc = opts("labelsUTC");
  var accessors = utc ? DateAccessorsUTC : DateAccessorsLocal;
  var datefield = TICK_PLACEMENT[granularity].datefield;
  var step = TICK_PLACEMENT[granularity].step;
  var spacing = TICK_PLACEMENT[granularity].spacing;
  var start_date = new Date(start_time);
  var date_array = [];
  date_array[DateField.DATEFIELD_Y] = accessors.getFullYear(start_date);
  date_array[DateField.DATEFIELD_M] = accessors.getMonth(start_date);
  date_array[DateField.DATEFIELD_D] = accessors.getDate(start_date);
  date_array[DateField.DATEFIELD_HH] = accessors.getHours(start_date);
  date_array[DateField.DATEFIELD_MM] = accessors.getMinutes(start_date);
  date_array[DateField.DATEFIELD_SS] = accessors.getSeconds(start_date);
  date_array[DateField.DATEFIELD_MS] = accessors.getMilliseconds(start_date);
  var start_date_offset = date_array[datefield] % step;
  if (granularity == Granularity.WEEKLY) {
    start_date_offset = accessors.getDay(start_date);
  }
  date_array[datefield] -= start_date_offset;
  for (var df = datefield + 1; df < DateField.NUM_DATEFIELDS; df++) {
    date_array[df] = df === DateField.DATEFIELD_D ? 1 : 0;
  }
  var ticks = [];
  var tick_date = accessors.makeDate.apply(null, date_array);
  var tick_time = tick_date.getTime();
  if (granularity <= Granularity.HOURLY) {
    if (tick_time < start_time) {
      tick_time += spacing;
      tick_date = new Date(tick_time);
    }
    while (tick_time <= end_time) {
      ticks.push({
        v: tick_time,
        label: formatter.call(dg, tick_date, granularity, opts, dg)
      });
      tick_time += spacing;
      tick_date = new Date(tick_time);
    }
  } else {
    if (tick_time < start_time) {
      date_array[datefield] += step;
      tick_date = accessors.makeDate.apply(null, date_array);
      tick_time = tick_date.getTime();
    }
    while (tick_time <= end_time) {
      if (granularity >= Granularity.DAILY || accessors.getHours(tick_date) % step === 0) {
        ticks.push({
          v: tick_time,
          label: formatter.call(dg, tick_date, granularity, opts, dg)
        });
      }
      date_array[datefield] += step;
      tick_date = accessors.makeDate.apply(null, date_array);
      tick_time = tick_date.getTime();
    }
  }
  return ticks;
};

// ../../node_modules/dygraphs/src/dygraph-utils.js
var LOG_SCALE = 10;
var LN_TEN = Math.log(LOG_SCALE);
var log10 = function(x) {
  return Math.log(x) / LN_TEN;
};
var logRangeFraction = function(r0, r1, pct) {
  var logr0 = log10(r0);
  var logr1 = log10(r1);
  var exponent = logr0 + pct * (logr1 - logr0);
  var value = Math.pow(LOG_SCALE, exponent);
  return value;
};
var DASHED_LINE = [7, 3];
var DOT_DASH_LINE = [7, 2, 2, 2];
var HORIZONTAL = 1;
var VERTICAL = 2;
var getContext = function(canvas) {
  return (
    /** @type{!CanvasRenderingContext2D}*/
    canvas.getContext("2d")
  );
};
var addEvent = function addEvent2(elem, type, fn) {
  elem.addEventListener(type, fn, false);
};
function removeEvent(elem, type, fn) {
  elem.removeEventListener(type, fn, false);
}
function cancelEvent(e) {
  e = e ? e : window.event;
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.cancelBubble = true;
  e.cancel = true;
  e.returnValue = false;
  return false;
}
function hsvToRGB(hue, saturation, value) {
  var red;
  var green;
  var blue;
  if (saturation === 0) {
    red = value;
    green = value;
    blue = value;
  } else {
    var i = Math.floor(hue * 6);
    var f = hue * 6 - i;
    var p = value * (1 - saturation);
    var q = value * (1 - saturation * f);
    var t = value * (1 - saturation * (1 - f));
    switch (i) {
      case 1:
        red = q;
        green = value;
        blue = p;
        break;
      case 2:
        red = p;
        green = value;
        blue = t;
        break;
      case 3:
        red = p;
        green = q;
        blue = value;
        break;
      case 4:
        red = t;
        green = p;
        blue = value;
        break;
      case 5:
        red = value;
        green = p;
        blue = q;
        break;
      case 6:
      case 0:
        red = value;
        green = t;
        blue = p;
        break;
    }
  }
  red = Math.floor(255 * red + 0.5);
  green = Math.floor(255 * green + 0.5);
  blue = Math.floor(255 * blue + 0.5);
  return "rgb(" + red + "," + green + "," + blue + ")";
}
function findPos(obj) {
  var p = obj.getBoundingClientRect(), w = window, d = document.documentElement;
  return {
    x: p.left + (w.pageXOffset || d.scrollLeft),
    y: p.top + (w.pageYOffset || d.scrollTop)
  };
}
function pageX(e) {
  return !e.pageX || e.pageX < 0 ? 0 : e.pageX;
}
function pageY(e) {
  return !e.pageY || e.pageY < 0 ? 0 : e.pageY;
}
function dragGetX_(e, context) {
  return pageX(e) - context.px;
}
function dragGetY_(e, context) {
  return pageY(e) - context.py;
}
function isOK(x) {
  return !!x && !isNaN(x);
}
function isValidPoint(p, opt_allowNaNY) {
  if (!p) return false;
  if (p.yval === null) return false;
  if (p.x === null || p.x === void 0) return false;
  if (p.y === null || p.y === void 0) return false;
  if (isNaN(p.x) || !opt_allowNaNY && isNaN(p.y)) return false;
  return true;
}
function floatFormat(x, opt_precision) {
  var p = Math.min(Math.max(1, opt_precision || 2), 21);
  return Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential(p - 1) : x.toPrecision(p);
}
function zeropad(x) {
  if (x < 10) return "0" + x;
  else return "" + x;
}
var DateAccessorsLocal = {
  getFullYear: (d) => d.getFullYear(),
  getMonth: (d) => d.getMonth(),
  getDate: (d) => d.getDate(),
  getHours: (d) => d.getHours(),
  getMinutes: (d) => d.getMinutes(),
  getSeconds: (d) => d.getSeconds(),
  getMilliseconds: (d) => d.getMilliseconds(),
  getDay: (d) => d.getDay(),
  makeDate: function(y, m, d, hh, mm, ss, ms) {
    return new Date(y, m, d, hh, mm, ss, ms);
  }
};
var DateAccessorsUTC = {
  getFullYear: (d) => d.getUTCFullYear(),
  getMonth: (d) => d.getUTCMonth(),
  getDate: (d) => d.getUTCDate(),
  getHours: (d) => d.getUTCHours(),
  getMinutes: (d) => d.getUTCMinutes(),
  getSeconds: (d) => d.getUTCSeconds(),
  getMilliseconds: (d) => d.getUTCMilliseconds(),
  getDay: (d) => d.getUTCDay(),
  makeDate: function(y, m, d, hh, mm, ss, ms) {
    return new Date(Date.UTC(y, m, d, hh, mm, ss, ms));
  }
};
function hmsString_(hh, mm, ss, ms) {
  var ret = zeropad(hh) + ":" + zeropad(mm);
  if (ss) {
    ret += ":" + zeropad(ss);
    if (ms) {
      var str = "" + ms;
      ret += "." + ("000" + str).substring(str.length);
    }
  }
  return ret;
}
function dateString_(time, utc) {
  var accessors = utc ? DateAccessorsUTC : DateAccessorsLocal;
  var date = new Date(time);
  var y = accessors.getFullYear(date);
  var m = accessors.getMonth(date);
  var d = accessors.getDate(date);
  var hh = accessors.getHours(date);
  var mm = accessors.getMinutes(date);
  var ss = accessors.getSeconds(date);
  var ms = accessors.getMilliseconds(date);
  var year = "" + y;
  var month = zeropad(m + 1);
  var day = zeropad(d);
  var frac = hh * 3600 + mm * 60 + ss + 1e-3 * ms;
  var ret = year + "/" + month + "/" + day;
  if (frac) {
    ret += " " + hmsString_(hh, mm, ss, ms);
  }
  return ret;
}
function round_(num, places) {
  var shift = Math.pow(10, places);
  return Math.round(num * shift) / shift;
}
function binarySearch2(val, arry, abs, low, high) {
  if (low === null || low === void 0 || high === null || high === void 0) {
    low = 0;
    high = arry.length - 1;
  }
  if (low > high) {
    return -1;
  }
  if (abs === null || abs === void 0) {
    abs = 0;
  }
  var validIndex = function(idx2) {
    return idx2 >= 0 && idx2 < arry.length;
  };
  var mid = parseInt((low + high) / 2, 10);
  var element = arry[mid];
  var idx;
  if (element == val) {
    return mid;
  } else if (element > val) {
    if (abs > 0) {
      idx = mid - 1;
      if (validIndex(idx) && arry[idx] < val) {
        return mid;
      }
    }
    return binarySearch2(val, arry, abs, low, mid - 1);
  } else if (element < val) {
    if (abs < 0) {
      idx = mid + 1;
      if (validIndex(idx) && arry[idx] > val) {
        return mid;
      }
    }
    return binarySearch2(val, arry, abs, mid + 1, high);
  }
  return -1;
}
function dateParser(dateStr) {
  var dateStrSlashed;
  var d;
  if (dateStr.search("-") == -1 || dateStr.search("T") != -1 || dateStr.search("Z") != -1) {
    d = dateStrToMillis(dateStr);
    if (d && !isNaN(d)) return d;
  }
  if (dateStr.search("-") != -1) {
    dateStrSlashed = dateStr.replace("-", "/", "g");
    while (dateStrSlashed.search("-") != -1) {
      dateStrSlashed = dateStrSlashed.replace("-", "/");
    }
    d = dateStrToMillis(dateStrSlashed);
  } else {
    d = dateStrToMillis(dateStr);
  }
  if (!d || isNaN(d)) {
    console.error("Couldn't parse " + dateStr + " as a date");
  }
  return d;
}
function dateStrToMillis(str) {
  return new Date(str).getTime();
}
function update(self, o) {
  if (typeof o != "undefined" && o !== null) {
    for (var k in o) {
      if (o.hasOwnProperty(k)) {
        self[k] = o[k];
      }
    }
  }
  return self;
}
var _isNode = typeof Node !== "undefined" && Node !== null && typeof Node === "object" ? function _isNode2(o) {
  return o instanceof Node;
} : function _isNode3(o) {
  return typeof o === "object" && typeof o.nodeType === "number" && typeof o.nodeName === "string";
};
function updateDeep(self, o) {
  if (typeof o != "undefined" && o !== null) {
    for (var k in o) {
      if (o.hasOwnProperty(k)) {
        const v = o[k];
        if (v === null) {
          self[k] = null;
        } else if (isArrayLike(v)) {
          self[k] = v.slice();
        } else if (_isNode(v)) {
          self[k] = v;
        } else if (typeof v == "object") {
          if (typeof self[k] != "object" || self[k] === null) {
            self[k] = {};
          }
          updateDeep(self[k], v);
        } else {
          self[k] = v;
        }
      }
    }
  }
  return self;
}
function typeArrayLike(o) {
  if (o === null)
    return "null";
  const t = typeof o;
  if ((t === "object" || t === "function" && typeof o.item === "function") && typeof o.length === "number" && o.nodeType !== 3 && o.nodeType !== 4)
    return "array";
  return t;
}
function isArrayLike(o) {
  const t = typeof o;
  return o !== null && (t === "object" || t === "function" && typeof o.item === "function") && typeof o.length === "number" && o.nodeType !== 3 && o.nodeType !== 4;
}
function isDateLike(o) {
  return o !== null && typeof o === "object" && typeof o.getTime === "function";
}
function clone(o) {
  var r = [];
  for (var i = 0; i < o.length; i++) {
    if (isArrayLike(o[i])) {
      r.push(clone(o[i]));
    } else {
      r.push(o[i]);
    }
  }
  return r;
}
function createCanvas() {
  return document.createElement("canvas");
}
function getContextPixelRatio(context) {
  try {
    var devicePixelRatio = window.devicePixelRatio;
    var backingStoreRatio = context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio || context.msBackingStorePixelRatio || context.oBackingStorePixelRatio || context.backingStorePixelRatio || 1;
    if (devicePixelRatio !== void 0) {
      return devicePixelRatio / backingStoreRatio;
    } else {
      return 1;
    }
  } catch (e) {
    return 1;
  }
}
function Iterator(array, start, length, predicate) {
  start = start || 0;
  length = length || array.length;
  this.hasNext = true;
  this.peek = null;
  this.start_ = start;
  this.array_ = array;
  this.predicate_ = predicate;
  this.end_ = Math.min(array.length, start + length);
  this.nextIdx_ = start - 1;
  this.next();
}
Iterator.prototype.next = function() {
  if (!this.hasNext) {
    return null;
  }
  var obj = this.peek;
  var nextIdx = this.nextIdx_ + 1;
  var found = false;
  while (nextIdx < this.end_) {
    if (!this.predicate_ || this.predicate_(this.array_, nextIdx)) {
      this.peek = this.array_[nextIdx];
      found = true;
      break;
    }
    nextIdx++;
  }
  this.nextIdx_ = nextIdx;
  if (!found) {
    this.hasNext = false;
    this.peek = null;
  }
  return obj;
};
function createIterator(array, start, length, opt_predicate) {
  return new Iterator(array, start, length, opt_predicate);
}
var requestAnimFrame = function() {
  return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function(callback) {
    window.setTimeout(callback, 1e3 / 60);
  };
}();
function repeatAndCleanup(repeatFn, maxFrames, framePeriodInMillis, cleanupFn) {
  var frameNumber = 0;
  var previousFrameNumber;
  var startTime = (/* @__PURE__ */ new Date()).getTime();
  repeatFn(frameNumber);
  if (maxFrames == 1) {
    cleanupFn();
    return;
  }
  var maxFrameArg = maxFrames - 1;
  (function loop() {
    if (frameNumber >= maxFrames) return;
    requestAnimFrame.call(window, function() {
      var currentTime = (/* @__PURE__ */ new Date()).getTime();
      var delayInMillis = currentTime - startTime;
      previousFrameNumber = frameNumber;
      frameNumber = Math.floor(delayInMillis / framePeriodInMillis);
      var frameDelta = frameNumber - previousFrameNumber;
      var predictOvershootStutter = frameNumber + frameDelta > maxFrameArg;
      if (predictOvershootStutter || frameNumber >= maxFrameArg) {
        repeatFn(maxFrameArg);
        cleanupFn();
      } else {
        if (frameDelta !== 0) {
          repeatFn(frameNumber);
        }
        loop();
      }
    });
  })();
}
var pixelSafeOptions = {
  "annotationClickHandler": true,
  "annotationDblClickHandler": true,
  "annotationMouseOutHandler": true,
  "annotationMouseOverHandler": true,
  "axisLineColor": true,
  "axisLineWidth": true,
  "clickCallback": true,
  "drawCallback": true,
  "drawHighlightPointCallback": true,
  "drawPoints": true,
  "drawPointCallback": true,
  "drawGrid": true,
  "fillAlpha": true,
  "gridLineColor": true,
  "gridLineWidth": true,
  "hideOverlayOnMouseOut": true,
  "highlightCallback": true,
  "highlightCircleSize": true,
  "interactionModel": true,
  "labelsDiv": true,
  "labelsKMB": true,
  "labelsKMG2": true,
  "labelsSeparateLines": true,
  "labelsShowZeroValues": true,
  "legend": true,
  "panEdgeFraction": true,
  "pixelsPerYLabel": true,
  "pointClickCallback": true,
  "pointSize": true,
  "rangeSelectorPlotFillColor": true,
  "rangeSelectorPlotFillGradientColor": true,
  "rangeSelectorPlotStrokeColor": true,
  "rangeSelectorBackgroundStrokeColor": true,
  "rangeSelectorBackgroundLineWidth": true,
  "rangeSelectorPlotLineWidth": true,
  "rangeSelectorForegroundStrokeColor": true,
  "rangeSelectorForegroundLineWidth": true,
  "rangeSelectorAlpha": true,
  "showLabelsOnHighlight": true,
  "showRoller": true,
  "strokeWidth": true,
  "underlayCallback": true,
  "unhighlightCallback": true,
  "zoomCallback": true
};
function isPixelChangingOptionList(labels, attrs) {
  var seriesNamesDictionary = {};
  if (labels) {
    for (var i = 1; i < labels.length; i++) {
      seriesNamesDictionary[labels[i]] = true;
    }
  }
  var scanFlatOptions = function(options) {
    for (var property2 in options) {
      if (options.hasOwnProperty(property2) && !pixelSafeOptions[property2]) {
        return true;
      }
    }
    return false;
  };
  for (var property in attrs) {
    if (!attrs.hasOwnProperty(property)) continue;
    if (property == "highlightSeriesOpts" || seriesNamesDictionary[property] && !attrs.series) {
      if (scanFlatOptions(attrs[property])) return true;
    } else if (property == "series" || property == "axes") {
      var perSeries = attrs[property];
      for (var series in perSeries) {
        if (perSeries.hasOwnProperty(series) && scanFlatOptions(perSeries[series])) {
          return true;
        }
      }
    } else {
      if (!pixelSafeOptions[property]) return true;
    }
  }
  return false;
}
var Circles = {
  DEFAULT: function(g, name, ctx, canvasx, canvasy, color, radius) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(canvasx, canvasy, radius, 0, 2 * Math.PI, false);
    ctx.fill();
  }
  // For more shapes, include extras/shapes.js
};
function detectLineDelimiter(data) {
  for (var i = 0; i < data.length; i++) {
    var code = data.charAt(i);
    if (code === "\r") {
      if (i + 1 < data.length && data.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return code;
    }
    if (code === "\n") {
      if (i + 1 < data.length && data.charAt(i + 1) === "\r") {
        return "\n\r";
      }
      return code;
    }
  }
  return null;
}
function isNodeContainedBy(containee, container) {
  if (container === null || containee === null) {
    return false;
  }
  var containeeNode = (
    /** @type {Node} */
    containee
  );
  while (containeeNode && containeeNode !== container) {
    containeeNode = containeeNode.parentNode;
  }
  return containeeNode === container;
}
function pow(base, exp) {
  if (exp < 0) {
    return 1 / Math.pow(base, -exp);
  }
  return Math.pow(base, exp);
}
var RGBAxRE = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})?$/;
var RGBA_RE = /^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*([01](?:\.\d+)?))?\)$/;
function parseRGBA(rgbStr) {
  var bits, r, g, b, a = null;
  if (bits = RGBAxRE.exec(rgbStr)) {
    r = parseInt(bits[1], 16);
    g = parseInt(bits[2], 16);
    b = parseInt(bits[3], 16);
    if (bits[4])
      a = parseInt(bits[4], 16);
  } else if (bits = RGBA_RE.exec(rgbStr)) {
    r = parseInt(bits[1], 10);
    g = parseInt(bits[2], 10);
    b = parseInt(bits[3], 10);
    if (bits[4])
      a = parseFloat(bits[4]);
  } else
    return null;
  if (a !== null)
    return { "r": r, "g": g, "b": b, "a": a };
  return { "r": r, "g": g, "b": b };
}
function toRGB_(colorStr) {
  var rgb = parseRGBA(colorStr);
  if (rgb) return rgb;
  var div = document.createElement("div");
  div.style.backgroundColor = colorStr;
  div.style.visibility = "hidden";
  document.body.appendChild(div);
  var rgbStr = window.getComputedStyle(div, null).backgroundColor;
  document.body.removeChild(div);
  return parseRGBA(rgbStr);
}
function isCanvasSupported(opt_canvasElement) {
  try {
    var canvas = opt_canvasElement || document.createElement("canvas");
    canvas.getContext("2d");
  } catch (e) {
    return false;
  }
  return true;
}
function parseFloat_(x, opt_line_no, opt_line) {
  var val = parseFloat(x);
  if (!isNaN(val)) return val;
  if (/^ *$/.test(x)) return null;
  if (/^ *nan *$/i.test(x)) return NaN;
  var msg = "Unable to parse '" + x + "' as a number";
  if (opt_line !== void 0 && opt_line_no !== void 0) {
    msg += " on line " + (1 + (opt_line_no || 0)) + " ('" + opt_line + "') of CSV.";
  }
  console.error(msg);
  return null;
}
var KMB_LABELS_LARGE = ["k", "M", "G", "T", "P", "E", "Z", "Y"];
var KMB_LABELS_SMALL = ["m", "\xB5", "n", "p", "f", "a", "z", "y"];
var KMG2_LABELS_LARGE = ["Ki", "Mi", "Gi", "Ti", "Pi", "Ei", "Zi", "Yi"];
var KMG2_LABELS_SMALL = ["p-10", "p-20", "p-30", "p-40", "p-50", "p-60", "p-70", "p-80"];
var KMB2_LABELS_LARGE = ["K", "M", "G", "T", "P", "E", "Z", "Y"];
var KMB2_LABELS_SMALL = KMB_LABELS_SMALL;
function numberValueFormatter(x, opts) {
  var sigFigs = opts("sigFigs");
  if (sigFigs !== null) {
    return floatFormat(x, sigFigs);
  }
  if (x === 0)
    return "0";
  var digits = opts("digitsAfterDecimal");
  var maxNumberWidth = opts("maxNumberWidth");
  var kmb = opts("labelsKMB");
  var kmg2 = opts("labelsKMG2");
  var label;
  var absx = Math.abs(x);
  if (kmb || kmg2) {
    var k;
    var k_labels = [];
    var m_labels = [];
    if (kmb) {
      k = 1e3;
      k_labels = KMB_LABELS_LARGE;
      m_labels = KMB_LABELS_SMALL;
    }
    if (kmg2) {
      k = 1024;
      k_labels = KMG2_LABELS_LARGE;
      m_labels = KMG2_LABELS_SMALL;
      if (kmb) {
        k_labels = KMB2_LABELS_LARGE;
        m_labels = KMB2_LABELS_SMALL;
      }
    }
    var n;
    var j;
    if (absx >= k) {
      j = k_labels.length;
      while (j > 0) {
        n = pow(k, j);
        --j;
        if (absx >= n) {
          if (absx / n >= Math.pow(10, maxNumberWidth))
            label = x.toExponential(digits);
          else
            label = round_(x / n, digits) + k_labels[j];
          return label;
        }
      }
    } else if (absx < 1) {
      j = 0;
      while (j < m_labels.length) {
        ++j;
        n = pow(k, j);
        if (absx * n >= 1)
          break;
      }
      if (absx * n < Math.pow(10, -digits))
        label = x.toExponential(digits);
      else
        label = round_(x * n, digits) + m_labels[j - 1];
      return label;
    }
  }
  if (absx >= Math.pow(10, maxNumberWidth) || absx < Math.pow(10, -digits)) {
    label = x.toExponential(digits);
  } else {
    label = "" + round_(x, digits);
  }
  return label;
}
function numberAxisLabelFormatter(x, granularity, opts) {
  return numberValueFormatter.call(this, x, opts);
}
var SHORT_MONTH_NAMES_ = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateAxisLabelFormatter(date, granularity, opts) {
  var utc = opts("labelsUTC");
  var accessors = utc ? DateAccessorsUTC : DateAccessorsLocal;
  var year = accessors.getFullYear(date), month = accessors.getMonth(date), day = accessors.getDate(date), hours = accessors.getHours(date), mins = accessors.getMinutes(date), secs = accessors.getSeconds(date), millis = accessors.getMilliseconds(date);
  if (granularity >= Granularity.DECADAL) {
    return "" + year;
  } else if (granularity >= Granularity.MONTHLY) {
    return SHORT_MONTH_NAMES_[month] + "&#160;" + year;
  } else {
    var frac = hours * 3600 + mins * 60 + secs + 1e-3 * millis;
    if (frac === 0 || granularity >= Granularity.DAILY) {
      return zeropad(day) + "&#160;" + SHORT_MONTH_NAMES_[month];
    } else if (granularity < Granularity.SECONDLY) {
      var str = "" + millis;
      return zeropad(secs) + "." + ("000" + str).substring(str.length);
    } else if (granularity > Granularity.MINUTELY) {
      return hmsString_(hours, mins, secs, 0);
    } else {
      return hmsString_(hours, mins, secs, millis);
    }
  }
}
function dateValueFormatter(d, opts) {
  return dateString_(d, opts("labelsUTC"));
}
var deferDOM_callbacks = [];
var deferDOM_handlerCalled = false;
function deferDOM_ready(cb) {
  if (typeof cb === "function")
    cb();
  return true;
}
function setupDOMready_(self) {
  if (typeof document !== "undefined") {
    const handler2 = function deferDOM_handler() {
      if (deferDOM_handlerCalled)
        return;
      deferDOM_handlerCalled = true;
      self.onDOMready = deferDOM_ready;
      document.removeEventListener("DOMContentLoaded", handler2, false);
      window.removeEventListener("load", handler2, false);
      for (let i = 0; i < deferDOM_callbacks.length; ++i)
        deferDOM_callbacks[i]();
      deferDOM_callbacks = null;
    };
    self.onDOMready = function deferDOM_initial(cb) {
      if (document.readyState === "complete") {
        self.onDOMready = deferDOM_ready;
        return deferDOM_ready(cb);
      }
      const enqfn = function deferDOM_enqueue(cb2) {
        if (typeof cb2 === "function")
          deferDOM_callbacks.push(cb2);
        return false;
      };
      self.onDOMready = enqfn;
      document.addEventListener("DOMContentLoaded", handler2, false);
      window.addEventListener("load", handler2, false);
      if (document.readyState === "complete") {
        handler2();
        self.onDOMready = deferDOM_ready;
        return deferDOM_ready(cb);
      }
      return enqfn(cb);
    };
  }
}

// ../../node_modules/dygraphs/src/dygraph-layout.js
var DygraphLayout = function(dygraph) {
  this.dygraph_ = dygraph;
  this.points = [];
  this.setNames = [];
  this.annotations = [];
  this.yAxes_ = null;
  this.xTicks_ = null;
  this.yTicks_ = null;
};
DygraphLayout.prototype.addDataset = function(setname, set_xy) {
  this.points.push(set_xy);
  this.setNames.push(setname);
};
DygraphLayout.prototype.getPlotArea = function() {
  return this.area_;
};
DygraphLayout.prototype.computePlotArea = function() {
  var area = {
    // TODO(danvk): per-axis setting.
    x: 0,
    y: 0
  };
  area.w = this.dygraph_.width_ - area.x - this.dygraph_.getOption("rightGap");
  area.h = this.dygraph_.height_;
  var e = {
    chart_div: this.dygraph_.graphDiv,
    reserveSpaceLeft: function(px) {
      var r = {
        x: area.x,
        y: area.y,
        w: px,
        h: area.h
      };
      area.x += px;
      area.w -= px;
      return r;
    },
    reserveSpaceRight: function(px) {
      var r = {
        x: area.x + area.w - px,
        y: area.y,
        w: px,
        h: area.h
      };
      area.w -= px;
      return r;
    },
    reserveSpaceTop: function(px) {
      var r = {
        x: area.x,
        y: area.y,
        w: area.w,
        h: px
      };
      area.y += px;
      area.h -= px;
      return r;
    },
    reserveSpaceBottom: function(px) {
      var r = {
        x: area.x,
        y: area.y + area.h - px,
        w: area.w,
        h: px
      };
      area.h -= px;
      return r;
    },
    chartRect: function() {
      return { x: area.x, y: area.y, w: area.w, h: area.h };
    }
  };
  this.dygraph_.cascadeEvents_("layout", e);
  this.area_ = area;
};
DygraphLayout.prototype.setAnnotations = function(ann) {
  this.annotations = [];
  var parse = this.dygraph_.getOption("xValueParser") || function(x) {
    return x;
  };
  for (var i = 0; i < ann.length; i++) {
    var a = {};
    if (!ann[i].xval && ann[i].x === void 0) {
      console.error("Annotations must have an 'x' property");
      return;
    }
    if (ann[i].icon && !(ann[i].hasOwnProperty("width") && ann[i].hasOwnProperty("height"))) {
      console.error("Must set width and height when setting annotation.icon property");
      return;
    }
    update(a, ann[i]);
    if (!a.xval) a.xval = parse(a.x);
    this.annotations.push(a);
  }
};
DygraphLayout.prototype.setXTicks = function(xTicks) {
  this.xTicks_ = xTicks;
};
DygraphLayout.prototype.setYAxes = function(yAxes) {
  this.yAxes_ = yAxes;
};
DygraphLayout.prototype.evaluate = function() {
  this._xAxis = {};
  this._evaluateLimits();
  this._evaluateLineCharts();
  this._evaluateLineTicks();
  this._evaluateAnnotations();
};
DygraphLayout.prototype._evaluateLimits = function() {
  var xlimits = this.dygraph_.xAxisRange();
  this._xAxis.minval = xlimits[0];
  this._xAxis.maxval = xlimits[1];
  var xrange = xlimits[1] - xlimits[0];
  this._xAxis.scale = xrange !== 0 ? 1 / xrange : 1;
  if (this.dygraph_.getOptionForAxis("logscale", "x")) {
    this._xAxis.xlogrange = log10(this._xAxis.maxval) - log10(this._xAxis.minval);
    this._xAxis.xlogscale = this._xAxis.xlogrange !== 0 ? 1 / this._xAxis.xlogrange : 1;
  }
  for (var i = 0; i < this.yAxes_.length; i++) {
    var axis = this.yAxes_[i];
    axis.minyval = axis.computedValueRange[0];
    axis.maxyval = axis.computedValueRange[1];
    axis.yrange = axis.maxyval - axis.minyval;
    axis.yscale = axis.yrange !== 0 ? 1 / axis.yrange : 1;
    if (this.dygraph_.getOption("logscale") || axis.logscale) {
      axis.ylogrange = log10(axis.maxyval) - log10(axis.minyval);
      axis.ylogscale = axis.ylogrange !== 0 ? 1 / axis.ylogrange : 1;
      if (!isFinite(axis.ylogrange) || isNaN(axis.ylogrange)) {
        console.error("axis " + i + " of graph at " + axis.g + " can't be displayed in log scale for range [" + axis.minyval + " - " + axis.maxyval + "]");
      }
    }
  }
};
DygraphLayout.calcXNormal_ = function(value, xAxis, logscale) {
  if (logscale) {
    return (log10(value) - log10(xAxis.minval)) * xAxis.xlogscale;
  } else {
    return (value - xAxis.minval) * xAxis.scale;
  }
};
DygraphLayout.calcYNormal_ = function(axis, value, logscale) {
  if (logscale) {
    var x = 1 - (log10(value) - log10(axis.minyval)) * axis.ylogscale;
    return isFinite(x) ? x : NaN;
  } else {
    return 1 - (value - axis.minyval) * axis.yscale;
  }
};
DygraphLayout.prototype._evaluateLineCharts = function() {
  var isStacked = this.dygraph_.getOption("stackedGraph");
  var isLogscaleForX = this.dygraph_.getOptionForAxis("logscale", "x");
  for (var setIdx = 0; setIdx < this.points.length; setIdx++) {
    var points = this.points[setIdx];
    var setName = this.setNames[setIdx];
    var connectSeparated = this.dygraph_.getOption("connectSeparatedPoints", setName);
    var axis = this.dygraph_.axisPropertiesForSeries(setName);
    var logscale = this.dygraph_.attributes_.getForSeries("logscale", setName);
    for (var j = 0; j < points.length; j++) {
      var point = points[j];
      point.x = DygraphLayout.calcXNormal_(point.xval, this._xAxis, isLogscaleForX);
      var yval = point.yval;
      if (isStacked) {
        point.y_stacked = DygraphLayout.calcYNormal_(
          axis,
          point.yval_stacked,
          logscale
        );
        if (yval !== null && !isNaN(yval)) {
          yval = point.yval_stacked;
        }
      }
      if (yval === null) {
        yval = NaN;
        if (!connectSeparated) {
          point.yval = NaN;
        }
      }
      point.y = DygraphLayout.calcYNormal_(axis, yval, logscale);
    }
    this.dygraph_.dataHandler_.onLineEvaluated(points, axis, logscale);
  }
};
DygraphLayout.prototype._evaluateLineTicks = function() {
  var i, tick, label, pos, v, has_tick;
  this.xticks = [];
  for (i = 0; i < this.xTicks_.length; i++) {
    tick = this.xTicks_[i];
    label = tick.label;
    has_tick = !("label_v" in tick);
    v = has_tick ? tick.v : tick.label_v;
    pos = this.dygraph_.toPercentXCoord(v);
    if (pos >= 0 && pos < 1) {
      this.xticks.push({ pos, label, has_tick });
    }
  }
  this.yticks = [];
  for (i = 0; i < this.yAxes_.length; i++) {
    var axis = this.yAxes_[i];
    for (var j = 0; j < axis.ticks.length; j++) {
      tick = axis.ticks[j];
      label = tick.label;
      has_tick = !("label_v" in tick);
      v = has_tick ? tick.v : tick.label_v;
      pos = this.dygraph_.toPercentYCoord(v, i);
      if (pos > 0 && pos <= 1) {
        this.yticks.push({ axis: i, pos, label, has_tick });
      }
    }
  }
};
DygraphLayout.prototype._evaluateAnnotations = function() {
  var i;
  var annotations2 = {};
  for (i = 0; i < this.annotations.length; i++) {
    var a = this.annotations[i];
    annotations2[a.xval + "," + a.series] = a;
  }
  this.annotated_points = [];
  if (!this.annotations || !this.annotations.length) {
    return;
  }
  for (var setIdx = 0; setIdx < this.points.length; setIdx++) {
    var points = this.points[setIdx];
    for (i = 0; i < points.length; i++) {
      var p = points[i];
      var k = p.xval + "," + p.name;
      if (k in annotations2) {
        p.annotation = annotations2[k];
        this.annotated_points.push(p);
        delete annotations2[k];
      }
    }
  }
};
DygraphLayout.prototype.removeAllDatasets = function() {
  delete this.points;
  delete this.setNames;
  delete this.setPointsLengths;
  delete this.setPointsOffsets;
  this.points = [];
  this.setNames = [];
  this.setPointsLengths = [];
  this.setPointsOffsets = [];
};
var dygraph_layout_default = DygraphLayout;

// ../../node_modules/dygraphs/src/dygraph-canvas.js
var DygraphCanvasRenderer = function(dygraph, element, elementContext, layout) {
  this.dygraph_ = dygraph;
  this.layout = layout;
  this.element = element;
  this.elementContext = elementContext;
  this.height = dygraph.height_;
  this.width = dygraph.width_;
  if (!isCanvasSupported(this.element)) {
    throw "Canvas is not supported.";
  }
  this.area = layout.getPlotArea();
  var ctx = this.dygraph_.canvas_ctx_;
  ctx.beginPath();
  ctx.rect(this.area.x, this.area.y, this.area.w, this.area.h);
  ctx.clip();
  ctx = this.dygraph_.hidden_ctx_;
  ctx.beginPath();
  ctx.rect(this.area.x, this.area.y, this.area.w, this.area.h);
  ctx.clip();
};
DygraphCanvasRenderer.prototype.clear = function() {
  this.elementContext.clearRect(0, 0, this.width, this.height);
};
DygraphCanvasRenderer.prototype.render = function() {
  this._updatePoints();
  this._renderLineChart();
};
DygraphCanvasRenderer._getIteratorPredicate = function(connectSeparatedPoints) {
  return connectSeparatedPoints ? DygraphCanvasRenderer._predicateThatSkipsEmptyPoints : null;
};
DygraphCanvasRenderer._predicateThatSkipsEmptyPoints = function(array, idx) {
  return array[idx].yval !== null;
};
DygraphCanvasRenderer._drawStyledLine = function(e, color, strokeWidth, strokePattern, drawPoints, drawPointCallback, pointSize) {
  var g = e.dygraph;
  var stepPlot = g.getBooleanOption("stepPlot", e.setName);
  if (!isArrayLike(strokePattern)) {
    strokePattern = null;
  }
  var drawGapPoints = g.getBooleanOption("drawGapEdgePoints", e.setName);
  var points = e.points;
  var setName = e.setName;
  var iter = createIterator(
    points,
    0,
    points.length,
    DygraphCanvasRenderer._getIteratorPredicate(
      g.getBooleanOption("connectSeparatedPoints", setName)
    )
  );
  var stroking = strokePattern && strokePattern.length >= 2;
  var ctx = e.drawingContext;
  ctx.save();
  if (stroking) {
    if (ctx.setLineDash) ctx.setLineDash(strokePattern);
  }
  var pointsOnLine = DygraphCanvasRenderer._drawSeries(
    e,
    iter,
    strokeWidth,
    pointSize,
    drawPoints,
    drawGapPoints,
    stepPlot,
    color
  );
  DygraphCanvasRenderer._drawPointsOnLine(
    e,
    pointsOnLine,
    drawPointCallback,
    color,
    pointSize
  );
  if (stroking) {
    if (ctx.setLineDash) ctx.setLineDash([]);
  }
  ctx.restore();
};
DygraphCanvasRenderer._drawSeries = function(e, iter, strokeWidth, pointSize, drawPoints, drawGapPoints, stepPlot, color) {
  var prevCanvasX = null;
  var prevCanvasY = null;
  var nextCanvasY = null;
  var isIsolated;
  var point;
  var pointsOnLine = [];
  var first = true;
  var ctx = e.drawingContext;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  var arr = iter.array_;
  var limit = iter.end_;
  var predicate = iter.predicate_;
  for (var i = iter.start_; i < limit; i++) {
    point = arr[i];
    if (predicate) {
      while (i < limit && !predicate(arr, i)) {
        i++;
      }
      if (i == limit) break;
      point = arr[i];
    }
    if (point.canvasy === null || point.canvasy != point.canvasy) {
      if (stepPlot && prevCanvasX !== null) {
        ctx.moveTo(prevCanvasX, prevCanvasY);
        ctx.lineTo(point.canvasx, prevCanvasY);
      }
      prevCanvasX = prevCanvasY = null;
    } else {
      isIsolated = false;
      if (drawGapPoints || prevCanvasX === null) {
        iter.nextIdx_ = i;
        iter.next();
        nextCanvasY = iter.hasNext ? iter.peek.canvasy : null;
        var isNextCanvasYNullOrNaN = nextCanvasY === null || nextCanvasY != nextCanvasY;
        isIsolated = prevCanvasX === null && isNextCanvasYNullOrNaN;
        if (drawGapPoints) {
          if (!first && prevCanvasX === null || iter.hasNext && isNextCanvasYNullOrNaN) {
            isIsolated = true;
          }
        }
      }
      if (prevCanvasX !== null) {
        if (strokeWidth) {
          if (stepPlot) {
            ctx.moveTo(prevCanvasX, prevCanvasY);
            ctx.lineTo(point.canvasx, prevCanvasY);
          }
          ctx.lineTo(point.canvasx, point.canvasy);
        }
      } else {
        ctx.moveTo(point.canvasx, point.canvasy);
      }
      if (drawPoints || isIsolated) {
        pointsOnLine.push([point.canvasx, point.canvasy, point.idx]);
      }
      prevCanvasX = point.canvasx;
      prevCanvasY = point.canvasy;
    }
    first = false;
  }
  ctx.stroke();
  return pointsOnLine;
};
DygraphCanvasRenderer._drawPointsOnLine = function(e, pointsOnLine, drawPointCallback, color, pointSize) {
  var ctx = e.drawingContext;
  for (var idx = 0; idx < pointsOnLine.length; idx++) {
    var cb = pointsOnLine[idx];
    ctx.save();
    drawPointCallback.call(
      e.dygraph,
      e.dygraph,
      e.setName,
      ctx,
      cb[0],
      cb[1],
      color,
      pointSize,
      cb[2]
    );
    ctx.restore();
  }
};
DygraphCanvasRenderer.prototype._updatePoints = function() {
  var sets = this.layout.points;
  for (var i = sets.length; i--; ) {
    var points = sets[i];
    for (var j = points.length; j--; ) {
      var point = points[j];
      point.canvasx = this.area.w * point.x + this.area.x;
      point.canvasy = this.area.h * point.y + this.area.y;
    }
  }
};
DygraphCanvasRenderer.prototype._renderLineChart = function(opt_seriesName, opt_ctx) {
  var ctx = opt_ctx || this.elementContext;
  var i;
  var sets = this.layout.points;
  var setNames = this.layout.setNames;
  var setName;
  this.colors = this.dygraph_.colorsMap_;
  var plotter_attr = this.dygraph_.getOption("plotter");
  var plotters = plotter_attr;
  if (!isArrayLike(plotters)) {
    plotters = [plotters];
  }
  var setPlotters = {};
  for (i = 0; i < setNames.length; i++) {
    setName = setNames[i];
    var setPlotter = this.dygraph_.getOption("plotter", setName);
    if (setPlotter == plotter_attr) continue;
    setPlotters[setName] = setPlotter;
  }
  for (i = 0; i < plotters.length; i++) {
    var plotter = plotters[i];
    var is_last = i == plotters.length - 1;
    for (var j = 0; j < sets.length; j++) {
      setName = setNames[j];
      if (opt_seriesName && setName != opt_seriesName) continue;
      var points = sets[j];
      var p = plotter;
      if (setName in setPlotters) {
        if (is_last) {
          p = setPlotters[setName];
        } else {
          continue;
        }
      }
      var color = this.colors[setName];
      var strokeWidth = this.dygraph_.getOption("strokeWidth", setName);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      p({
        points,
        setName,
        drawingContext: ctx,
        color,
        strokeWidth,
        dygraph: this.dygraph_,
        axis: this.dygraph_.axisPropertiesForSeries(setName),
        plotArea: this.area,
        seriesIndex: j,
        seriesCount: sets.length,
        singleSeriesName: opt_seriesName,
        allSeriesPoints: sets
      });
      ctx.restore();
    }
  }
};
DygraphCanvasRenderer._Plotters = {
  linePlotter: function(e) {
    DygraphCanvasRenderer._linePlotter(e);
  },
  fillPlotter: function(e) {
    DygraphCanvasRenderer._fillPlotter(e);
  },
  errorPlotter: function(e) {
    DygraphCanvasRenderer._errorPlotter(e);
  }
};
DygraphCanvasRenderer._linePlotter = function(e) {
  var g = e.dygraph;
  var setName = e.setName;
  var strokeWidth = e.strokeWidth;
  var borderWidth = g.getNumericOption("strokeBorderWidth", setName);
  var drawPointCallback = g.getOption("drawPointCallback", setName) || Circles.DEFAULT;
  var strokePattern = g.getOption("strokePattern", setName);
  var drawPoints = g.getBooleanOption("drawPoints", setName);
  var pointSize = g.getNumericOption("pointSize", setName);
  if (borderWidth && strokeWidth) {
    DygraphCanvasRenderer._drawStyledLine(
      e,
      g.getOption("strokeBorderColor", setName),
      strokeWidth + 2 * borderWidth,
      strokePattern,
      drawPoints,
      drawPointCallback,
      pointSize
    );
  }
  DygraphCanvasRenderer._drawStyledLine(
    e,
    e.color,
    strokeWidth,
    strokePattern,
    drawPoints,
    drawPointCallback,
    pointSize
  );
};
DygraphCanvasRenderer._errorPlotter = function(e) {
  var g = e.dygraph;
  var setName = e.setName;
  var errorBars = g.getBooleanOption("errorBars") || g.getBooleanOption("customBars");
  if (!errorBars) return;
  var fillGraph = g.getBooleanOption("fillGraph", setName);
  if (fillGraph) {
    console.warn("Can't use fillGraph option with customBars or errorBars option");
  }
  var ctx = e.drawingContext;
  var color = e.color;
  var fillAlpha = g.getNumericOption("fillAlpha", setName);
  var stepPlot = g.getBooleanOption("stepPlot", setName);
  var points = e.points;
  var iter = createIterator(
    points,
    0,
    points.length,
    DygraphCanvasRenderer._getIteratorPredicate(
      g.getBooleanOption("connectSeparatedPoints", setName)
    )
  );
  var newYs;
  var prevX = NaN;
  var prevY = NaN;
  var prevYs = [-1, -1];
  var rgb = toRGB_(color);
  var err_color = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + fillAlpha + ")";
  ctx.fillStyle = err_color;
  ctx.beginPath();
  var isNullUndefinedOrNaN = function(x) {
    return x === null || x === void 0 || isNaN(x);
  };
  while (iter.hasNext) {
    var point = iter.next();
    if (!stepPlot && isNullUndefinedOrNaN(point.y) || stepPlot && !isNaN(prevY) && isNullUndefinedOrNaN(prevY)) {
      prevX = NaN;
      continue;
    }
    newYs = [point.y_bottom, point.y_top];
    if (stepPlot) {
      prevY = point.y;
    }
    if (isNaN(newYs[0])) newYs[0] = point.y;
    if (isNaN(newYs[1])) newYs[1] = point.y;
    newYs[0] = e.plotArea.h * newYs[0] + e.plotArea.y;
    newYs[1] = e.plotArea.h * newYs[1] + e.plotArea.y;
    if (!isNaN(prevX)) {
      if (stepPlot) {
        ctx.moveTo(prevX, prevYs[0]);
        ctx.lineTo(point.canvasx, prevYs[0]);
        ctx.lineTo(point.canvasx, prevYs[1]);
      } else {
        ctx.moveTo(prevX, prevYs[0]);
        ctx.lineTo(point.canvasx, newYs[0]);
        ctx.lineTo(point.canvasx, newYs[1]);
      }
      ctx.lineTo(prevX, prevYs[1]);
      ctx.closePath();
    }
    prevYs = newYs;
    prevX = point.canvasx;
  }
  ctx.fill();
};
DygraphCanvasRenderer._fastCanvasProxy = function(context) {
  var pendingActions = [];
  var lastRoundedX = null;
  var lastFlushedX = null;
  var LINE_TO = 1, MOVE_TO = 2;
  var actionCount = 0;
  var compressActions = function(opt_losslessOnly) {
    if (pendingActions.length <= 1) return;
    for (var i = pendingActions.length - 1; i > 0; i--) {
      var action = pendingActions[i];
      if (action[0] == MOVE_TO) {
        var prevAction = pendingActions[i - 1];
        if (prevAction[1] == action[1] && prevAction[2] == action[2]) {
          pendingActions.splice(i, 1);
        }
      }
    }
    for (var i = 0; i < pendingActions.length - 1; ) {
      var action = pendingActions[i];
      if (action[0] == MOVE_TO && pendingActions[i + 1][0] == MOVE_TO) {
        pendingActions.splice(i, 1);
      } else {
        i++;
      }
    }
    if (pendingActions.length > 2 && !opt_losslessOnly) {
      var startIdx = 0;
      if (pendingActions[0][0] == MOVE_TO) startIdx++;
      var minIdx = null, maxIdx = null;
      for (var i = startIdx; i < pendingActions.length; i++) {
        var action = pendingActions[i];
        if (action[0] != LINE_TO) continue;
        if (minIdx === null && maxIdx === null) {
          minIdx = i;
          maxIdx = i;
        } else {
          var y = action[2];
          if (y < pendingActions[minIdx][2]) {
            minIdx = i;
          } else if (y > pendingActions[maxIdx][2]) {
            maxIdx = i;
          }
        }
      }
      var minAction = pendingActions[minIdx], maxAction = pendingActions[maxIdx];
      pendingActions.splice(startIdx, pendingActions.length - startIdx);
      if (minIdx < maxIdx) {
        pendingActions.push(minAction);
        pendingActions.push(maxAction);
      } else if (minIdx > maxIdx) {
        pendingActions.push(maxAction);
        pendingActions.push(minAction);
      } else {
        pendingActions.push(minAction);
      }
    }
  };
  var flushActions = function(opt_noLossyCompression) {
    compressActions(opt_noLossyCompression);
    for (var i = 0, len = pendingActions.length; i < len; i++) {
      var action = pendingActions[i];
      if (action[0] == LINE_TO) {
        context.lineTo(action[1], action[2]);
      } else if (action[0] == MOVE_TO) {
        context.moveTo(action[1], action[2]);
      }
    }
    if (pendingActions.length) {
      lastFlushedX = pendingActions[pendingActions.length - 1][1];
    }
    actionCount += pendingActions.length;
    pendingActions = [];
  };
  var addAction = function(action, x, y) {
    var rx = Math.round(x);
    if (lastRoundedX === null || rx != lastRoundedX) {
      var hasGapOnLeft = lastRoundedX - lastFlushedX > 1, hasGapOnRight = rx - lastRoundedX > 1, hasGap = hasGapOnLeft || hasGapOnRight;
      flushActions(hasGap);
      lastRoundedX = rx;
    }
    pendingActions.push([action, x, y]);
  };
  return {
    moveTo: function(x, y) {
      addAction(MOVE_TO, x, y);
    },
    lineTo: function(x, y) {
      addAction(LINE_TO, x, y);
    },
    // for major operations like stroke/fill, we skip compression to ensure
    // that there are no artifacts at the right edge.
    stroke: function() {
      flushActions(true);
      context.stroke();
    },
    fill: function() {
      flushActions(true);
      context.fill();
    },
    beginPath: function() {
      flushActions(true);
      context.beginPath();
    },
    closePath: function() {
      flushActions(true);
      context.closePath();
    },
    _count: function() {
      return actionCount;
    }
  };
};
DygraphCanvasRenderer._fillPlotter = function(e) {
  if (e.singleSeriesName) return;
  if (e.seriesIndex !== 0) return;
  var g = e.dygraph;
  var setNames = g.getLabels().slice(1);
  for (var i = setNames.length; i >= 0; i--) {
    if (!g.visibility()[i]) setNames.splice(i, 1);
  }
  var anySeriesFilled = function() {
    for (var i2 = 0; i2 < setNames.length; i2++) {
      if (g.getBooleanOption("fillGraph", setNames[i2])) return true;
    }
    return false;
  }();
  if (!anySeriesFilled) return;
  var area = e.plotArea;
  var sets = e.allSeriesPoints;
  var setCount = sets.length;
  var stackedGraph = g.getBooleanOption("stackedGraph");
  var colors = g.getColors();
  var baseline = {};
  var currBaseline;
  var prevStepPlot;
  var traceBackPath = function(ctx2, baselineX, baselineY, pathBack2) {
    ctx2.lineTo(baselineX, baselineY);
    if (stackedGraph) {
      for (var i2 = pathBack2.length - 1; i2 >= 0; i2--) {
        var pt = pathBack2[i2];
        ctx2.lineTo(pt[0], pt[1]);
      }
    }
  };
  for (var setIdx = setCount - 1; setIdx >= 0; setIdx--) {
    var ctx = e.drawingContext;
    var setName = setNames[setIdx];
    if (!g.getBooleanOption("fillGraph", setName)) continue;
    var fillAlpha = g.getNumericOption("fillAlpha", setName);
    var stepPlot = g.getBooleanOption("stepPlot", setName);
    var color = colors[setIdx];
    var axis = g.axisPropertiesForSeries(setName);
    var axisY = 1 + axis.minyval * axis.yscale;
    if (axisY < 0) axisY = 0;
    else if (axisY > 1) axisY = 1;
    axisY = area.h * axisY + area.y;
    var points = sets[setIdx];
    var iter = createIterator(
      points,
      0,
      points.length,
      DygraphCanvasRenderer._getIteratorPredicate(
        g.getBooleanOption("connectSeparatedPoints", setName)
      )
    );
    var prevX = NaN;
    var prevYs = [-1, -1];
    var newYs;
    var rgb = toRGB_(color);
    var err_color = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + fillAlpha + ")";
    ctx.fillStyle = err_color;
    ctx.beginPath();
    var last_x, is_first = true;
    if (points.length > 2 * g.width_ || dygraph_default.FORCE_FAST_PROXY) {
      ctx = DygraphCanvasRenderer._fastCanvasProxy(ctx);
    }
    var pathBack = [];
    var point;
    while (iter.hasNext) {
      point = iter.next();
      if (!isOK(point.y) && !stepPlot) {
        traceBackPath(ctx, prevX, prevYs[1], pathBack);
        pathBack = [];
        prevX = NaN;
        if (point.y_stacked !== null && !isNaN(point.y_stacked)) {
          baseline[point.canvasx] = area.h * point.y_stacked + area.y;
        }
        continue;
      }
      if (stackedGraph) {
        if (!is_first && last_x == point.xval) {
          continue;
        } else {
          is_first = false;
          last_x = point.xval;
        }
        currBaseline = baseline[point.canvasx];
        var lastY;
        if (currBaseline === void 0) {
          lastY = axisY;
        } else {
          if (prevStepPlot) {
            lastY = currBaseline[0];
          } else {
            lastY = currBaseline;
          }
        }
        newYs = [point.canvasy, lastY];
        if (stepPlot) {
          if (prevYs[0] === -1) {
            baseline[point.canvasx] = [point.canvasy, axisY];
          } else {
            baseline[point.canvasx] = [point.canvasy, prevYs[0]];
          }
        } else {
          baseline[point.canvasx] = point.canvasy;
        }
      } else {
        if (isNaN(point.canvasy) && stepPlot) {
          newYs = [area.y + area.h, axisY];
        } else {
          newYs = [point.canvasy, axisY];
        }
      }
      if (!isNaN(prevX)) {
        if (stepPlot) {
          ctx.lineTo(point.canvasx, prevYs[0]);
          ctx.lineTo(point.canvasx, newYs[0]);
        } else {
          ctx.lineTo(point.canvasx, newYs[0]);
        }
        if (stackedGraph) {
          pathBack.push([prevX, prevYs[1]]);
          if (prevStepPlot && currBaseline) {
            pathBack.push([point.canvasx, currBaseline[1]]);
          } else {
            pathBack.push([point.canvasx, newYs[1]]);
          }
        }
      } else {
        ctx.moveTo(point.canvasx, newYs[1]);
        ctx.lineTo(point.canvasx, newYs[0]);
      }
      prevYs = newYs;
      prevX = point.canvasx;
    }
    prevStepPlot = stepPlot;
    if (newYs && point) {
      traceBackPath(ctx, point.canvasx, newYs[1], pathBack);
      pathBack = [];
    }
    ctx.fill();
  }
};
var dygraph_canvas_default = DygraphCanvasRenderer;

// ../../node_modules/dygraphs/src/dygraph-interaction-model.js
var DRAG_EDGE_MARGIN = 100;
var DygraphInteraction = {};
DygraphInteraction.maybeTreatMouseOpAsClick = function(event, g, context) {
  context.dragEndX = dragGetX_(event, context);
  context.dragEndY = dragGetY_(event, context);
  var regionWidth = Math.abs(context.dragEndX - context.dragStartX);
  var regionHeight = Math.abs(context.dragEndY - context.dragStartY);
  if (regionWidth < 2 && regionHeight < 2 && g.lastx_ !== void 0 && g.lastx_ !== null) {
    DygraphInteraction.treatMouseOpAsClick(g, event, context);
  }
  context.regionWidth = regionWidth;
  context.regionHeight = regionHeight;
};
DygraphInteraction.startPan = function(event, g, context) {
  var i, axis;
  context.isPanning = true;
  var xRange = g.xAxisRange();
  if (g.getOptionForAxis("logscale", "x")) {
    context.initialLeftmostDate = log10(xRange[0]);
    context.dateRange = log10(xRange[1]) - log10(xRange[0]);
  } else {
    context.initialLeftmostDate = xRange[0];
    context.dateRange = xRange[1] - xRange[0];
  }
  context.xUnitsPerPixel = context.dateRange / (g.plotter_.area.w - 1);
  if (g.getNumericOption("panEdgeFraction")) {
    var maxXPixelsToDraw = g.width_ * g.getNumericOption("panEdgeFraction");
    var xExtremes = g.xAxisExtremes();
    var boundedLeftX = g.toDomXCoord(xExtremes[0]) - maxXPixelsToDraw;
    var boundedRightX = g.toDomXCoord(xExtremes[1]) + maxXPixelsToDraw;
    var boundedLeftDate = g.toDataXCoord(boundedLeftX);
    var boundedRightDate = g.toDataXCoord(boundedRightX);
    context.boundedDates = [boundedLeftDate, boundedRightDate];
    var boundedValues = [];
    var maxYPixelsToDraw = g.height_ * g.getNumericOption("panEdgeFraction");
    for (i = 0; i < g.axes_.length; i++) {
      axis = g.axes_[i];
      var yExtremes = axis.extremeRange;
      var boundedTopY = g.toDomYCoord(yExtremes[0], i) + maxYPixelsToDraw;
      var boundedBottomY = g.toDomYCoord(yExtremes[1], i) - maxYPixelsToDraw;
      var boundedTopValue = g.toDataYCoord(boundedTopY, i);
      var boundedBottomValue = g.toDataYCoord(boundedBottomY, i);
      boundedValues[i] = [boundedTopValue, boundedBottomValue];
    }
    context.boundedValues = boundedValues;
  } else {
    context.boundedDates = null;
    context.boundedValues = null;
  }
  context.is2DPan = false;
  context.axes = [];
  for (i = 0; i < g.axes_.length; i++) {
    axis = g.axes_[i];
    var axis_data = {};
    var yRange = g.yAxisRange(i);
    var logscale = g.attributes_.getForAxis("logscale", i);
    if (logscale) {
      axis_data.initialTopValue = log10(yRange[1]);
      axis_data.dragValueRange = log10(yRange[1]) - log10(yRange[0]);
    } else {
      axis_data.initialTopValue = yRange[1];
      axis_data.dragValueRange = yRange[1] - yRange[0];
    }
    axis_data.unitsPerPixel = axis_data.dragValueRange / (g.plotter_.area.h - 1);
    context.axes.push(axis_data);
    if (axis.valueRange) context.is2DPan = true;
  }
};
DygraphInteraction.movePan = function(event, g, context) {
  context.dragEndX = dragGetX_(event, context);
  context.dragEndY = dragGetY_(event, context);
  var minDate = context.initialLeftmostDate - (context.dragEndX - context.dragStartX) * context.xUnitsPerPixel;
  if (context.boundedDates) {
    minDate = Math.max(minDate, context.boundedDates[0]);
  }
  var maxDate = minDate + context.dateRange;
  if (context.boundedDates) {
    if (maxDate > context.boundedDates[1]) {
      minDate = minDate - (maxDate - context.boundedDates[1]);
      maxDate = minDate + context.dateRange;
    }
  }
  if (g.getOptionForAxis("logscale", "x")) {
    g.dateWindow_ = [
      Math.pow(LOG_SCALE, minDate),
      Math.pow(LOG_SCALE, maxDate)
    ];
  } else {
    g.dateWindow_ = [minDate, maxDate];
  }
  if (context.is2DPan) {
    var pixelsDragged = context.dragEndY - context.dragStartY;
    for (var i = 0; i < g.axes_.length; i++) {
      var axis = g.axes_[i];
      var axis_data = context.axes[i];
      var unitsDragged = pixelsDragged * axis_data.unitsPerPixel;
      var boundedValue = context.boundedValues ? context.boundedValues[i] : null;
      var maxValue = axis_data.initialTopValue + unitsDragged;
      if (boundedValue) {
        maxValue = Math.min(maxValue, boundedValue[1]);
      }
      var minValue = maxValue - axis_data.dragValueRange;
      if (boundedValue) {
        if (minValue < boundedValue[0]) {
          maxValue = maxValue - (minValue - boundedValue[0]);
          minValue = maxValue - axis_data.dragValueRange;
        }
      }
      if (g.attributes_.getForAxis("logscale", i)) {
        axis.valueRange = [
          Math.pow(LOG_SCALE, minValue),
          Math.pow(LOG_SCALE, maxValue)
        ];
      } else {
        axis.valueRange = [minValue, maxValue];
      }
    }
  }
  g.drawGraph_(false);
};
DygraphInteraction.endPan = DygraphInteraction.maybeTreatMouseOpAsClick;
DygraphInteraction.startZoom = function(event, g, context) {
  context.isZooming = true;
  context.zoomMoved = false;
};
DygraphInteraction.moveZoom = function(event, g, context) {
  context.zoomMoved = true;
  context.dragEndX = dragGetX_(event, context);
  context.dragEndY = dragGetY_(event, context);
  var xDelta = Math.abs(context.dragStartX - context.dragEndX);
  var yDelta = Math.abs(context.dragStartY - context.dragEndY);
  context.dragDirection = xDelta < yDelta / 2 ? VERTICAL : HORIZONTAL;
  g.drawZoomRect_(
    context.dragDirection,
    context.dragStartX,
    context.dragEndX,
    context.dragStartY,
    context.dragEndY,
    context.prevDragDirection,
    context.prevEndX,
    context.prevEndY
  );
  context.prevEndX = context.dragEndX;
  context.prevEndY = context.dragEndY;
  context.prevDragDirection = context.dragDirection;
};
DygraphInteraction.treatMouseOpAsClick = function(g, event, context) {
  var clickCallback = g.getFunctionOption("clickCallback");
  var pointClickCallback = g.getFunctionOption("pointClickCallback");
  var selectedPoint = null;
  var closestIdx = -1;
  var closestDistance = Number.MAX_VALUE;
  for (var i = 0; i < g.selPoints_.length; i++) {
    var p = g.selPoints_[i];
    var distance = Math.pow(p.canvasx - context.dragEndX, 2) + Math.pow(p.canvasy - context.dragEndY, 2);
    if (!isNaN(distance) && (closestIdx == -1 || distance < closestDistance)) {
      closestDistance = distance;
      closestIdx = i;
    }
  }
  var radius = g.getNumericOption("highlightCircleSize") + 2;
  if (closestDistance <= radius * radius) {
    selectedPoint = g.selPoints_[closestIdx];
  }
  if (selectedPoint) {
    var e = {
      cancelable: true,
      point: selectedPoint,
      canvasx: context.dragEndX,
      canvasy: context.dragEndY
    };
    var defaultPrevented = g.cascadeEvents_("pointClick", e);
    if (defaultPrevented) {
      return;
    }
    if (pointClickCallback) {
      pointClickCallback.call(g, event, selectedPoint);
    }
  }
  var e = {
    cancelable: true,
    xval: g.lastx_,
    // closest point by x value
    pts: g.selPoints_,
    canvasx: context.dragEndX,
    canvasy: context.dragEndY
  };
  if (!g.cascadeEvents_("click", e)) {
    if (clickCallback) {
      clickCallback.call(g, event, g.lastx_, g.selPoints_);
    }
  }
};
DygraphInteraction.endZoom = function(event, g, context) {
  g.clearZoomRect_();
  context.isZooming = false;
  DygraphInteraction.maybeTreatMouseOpAsClick(event, g, context);
  var plotArea = g.getArea();
  if (context.regionWidth >= 10 && context.dragDirection == HORIZONTAL) {
    var left = Math.min(context.dragStartX, context.dragEndX), right = Math.max(context.dragStartX, context.dragEndX);
    left = Math.max(left, plotArea.x);
    right = Math.min(right, plotArea.x + plotArea.w);
    if (left < right) {
      g.doZoomX_(left, right);
    }
    context.cancelNextDblclick = true;
  } else if (context.regionHeight >= 10 && context.dragDirection == VERTICAL) {
    var top = Math.min(context.dragStartY, context.dragEndY), bottom = Math.max(context.dragStartY, context.dragEndY);
    top = Math.max(top, plotArea.y);
    bottom = Math.min(bottom, plotArea.y + plotArea.h);
    if (top < bottom) {
      g.doZoomY_(top, bottom);
    }
    context.cancelNextDblclick = true;
  }
  context.dragStartX = null;
  context.dragStartY = null;
};
DygraphInteraction.startTouch = function(event, g, context) {
  event.preventDefault();
  if (event.touches.length > 1) {
    context.startTimeForDoubleTapMs = null;
  }
  var touches = [];
  for (var i = 0; i < event.touches.length; i++) {
    var t = event.touches[i];
    var rect = t.target.getBoundingClientRect();
    touches.push({
      pageX: t.pageX,
      pageY: t.pageY,
      dataX: g.toDataXCoord(t.clientX - rect.left),
      dataY: g.toDataYCoord(t.clientY - rect.top)
      // identifier: t.identifier
    });
  }
  context.initialTouches = touches;
  if (touches.length == 1) {
    context.initialPinchCenter = touches[0];
    context.touchDirections = { x: true, y: true };
  } else if (touches.length >= 2) {
    context.initialPinchCenter = {
      pageX: 0.5 * (touches[0].pageX + touches[1].pageX),
      pageY: 0.5 * (touches[0].pageY + touches[1].pageY),
      // TODO(danvk): remove
      dataX: 0.5 * (touches[0].dataX + touches[1].dataX),
      dataY: 0.5 * (touches[0].dataY + touches[1].dataY)
    };
    var initialAngle = 180 / Math.PI * Math.atan2(
      context.initialPinchCenter.pageY - touches[0].pageY,
      touches[0].pageX - context.initialPinchCenter.pageX
    );
    initialAngle = Math.abs(initialAngle);
    if (initialAngle > 90) initialAngle = 90 - initialAngle;
    context.touchDirections = {
      x: initialAngle < 90 - 45 / 2,
      y: initialAngle > 45 / 2
    };
  }
  context.initialRange = {
    x: g.xAxisRange(),
    y: g.yAxisRange()
  };
};
DygraphInteraction.moveTouch = function(event, g, context) {
  context.startTimeForDoubleTapMs = null;
  var i, touches = [];
  for (i = 0; i < event.touches.length; i++) {
    var t = event.touches[i];
    touches.push({
      pageX: t.pageX,
      pageY: t.pageY
    });
  }
  var initialTouches = context.initialTouches;
  var c_now;
  var c_init = context.initialPinchCenter;
  if (touches.length == 1) {
    c_now = touches[0];
  } else {
    c_now = {
      pageX: 0.5 * (touches[0].pageX + touches[1].pageX),
      pageY: 0.5 * (touches[0].pageY + touches[1].pageY)
    };
  }
  var swipe = {
    pageX: c_now.pageX - c_init.pageX,
    pageY: c_now.pageY - c_init.pageY
  };
  var dataWidth = context.initialRange.x[1] - context.initialRange.x[0];
  var dataHeight = context.initialRange.y[0] - context.initialRange.y[1];
  swipe.dataX = swipe.pageX / g.plotter_.area.w * dataWidth;
  swipe.dataY = swipe.pageY / g.plotter_.area.h * dataHeight;
  var xScale, yScale;
  if (touches.length == 1) {
    xScale = 1;
    yScale = 1;
  } else if (touches.length >= 2) {
    var initHalfWidth = initialTouches[1].pageX - c_init.pageX;
    xScale = (touches[1].pageX - c_now.pageX) / initHalfWidth;
    var initHalfHeight = initialTouches[1].pageY - c_init.pageY;
    yScale = (touches[1].pageY - c_now.pageY) / initHalfHeight;
  }
  xScale = Math.min(8, Math.max(0.125, xScale));
  yScale = Math.min(8, Math.max(0.125, yScale));
  var didZoom = false;
  if (context.touchDirections.x) {
    var cFactor = c_init.dataX - swipe.dataX / xScale;
    g.dateWindow_ = [
      cFactor + (context.initialRange.x[0] - c_init.dataX) / xScale,
      cFactor + (context.initialRange.x[1] - c_init.dataX) / xScale
    ];
    didZoom = true;
  }
  if (context.touchDirections.y) {
    for (i = 0; i < 1; i++) {
      var axis = g.axes_[i];
      var logscale = g.attributes_.getForAxis("logscale", i);
      if (logscale) {
      } else {
        var cFactor = c_init.dataY - swipe.dataY / yScale;
        axis.valueRange = [
          cFactor + (context.initialRange.y[0] - c_init.dataY) / yScale,
          cFactor + (context.initialRange.y[1] - c_init.dataY) / yScale
        ];
        didZoom = true;
      }
    }
  }
  g.drawGraph_(false);
  if (didZoom && touches.length > 1 && g.getFunctionOption("zoomCallback")) {
    var viewWindow = g.xAxisRange();
    g.getFunctionOption("zoomCallback").call(g, viewWindow[0], viewWindow[1], g.yAxisRanges());
  }
};
DygraphInteraction.endTouch = function(event, g, context) {
  if (event.touches.length !== 0) {
    DygraphInteraction.startTouch(event, g, context);
  } else if (event.changedTouches.length == 1) {
    var now = (/* @__PURE__ */ new Date()).getTime();
    var t = event.changedTouches[0];
    if (context.startTimeForDoubleTapMs && now - context.startTimeForDoubleTapMs < 500 && context.doubleTapX && Math.abs(context.doubleTapX - t.screenX) < 50 && context.doubleTapY && Math.abs(context.doubleTapY - t.screenY) < 50) {
      g.resetZoom();
    } else {
      context.startTimeForDoubleTapMs = now;
      context.doubleTapX = t.screenX;
      context.doubleTapY = t.screenY;
    }
  }
};
var distanceFromInterval = function(x, left, right) {
  if (x < left) {
    return left - x;
  } else if (x > right) {
    return x - right;
  } else {
    return 0;
  }
};
var distanceFromChart = function(event, g) {
  var chartPos = findPos(g.canvas_);
  var box = {
    left: chartPos.x,
    right: chartPos.x + g.canvas_.offsetWidth,
    top: chartPos.y,
    bottom: chartPos.y + g.canvas_.offsetHeight
  };
  var pt = {
    x: pageX(event),
    y: pageY(event)
  };
  var dx = distanceFromInterval(pt.x, box.left, box.right), dy = distanceFromInterval(pt.y, box.top, box.bottom);
  return Math.max(dx, dy);
};
DygraphInteraction.defaultModel = {
  // Track the beginning of drag events
  mousedown: function(event, g, context) {
    if (event.button && event.button == 2) return;
    context.initializeMouseDown(event, g, context);
    if (event.altKey || event.shiftKey) {
      DygraphInteraction.startPan(event, g, context);
    } else {
      DygraphInteraction.startZoom(event, g, context);
    }
    var mousemove = function(event2) {
      if (context.isZooming) {
        var d = distanceFromChart(event2, g);
        if (d < DRAG_EDGE_MARGIN) {
          DygraphInteraction.moveZoom(event2, g, context);
        } else {
          if (context.dragEndX !== null) {
            context.dragEndX = null;
            context.dragEndY = null;
            g.clearZoomRect_();
          }
        }
      } else if (context.isPanning) {
        DygraphInteraction.movePan(event2, g, context);
      }
    };
    var mouseup = function(event2) {
      if (context.isZooming) {
        if (context.dragEndX !== null) {
          DygraphInteraction.endZoom(event2, g, context);
        } else {
          DygraphInteraction.maybeTreatMouseOpAsClick(event2, g, context);
        }
      } else if (context.isPanning) {
        DygraphInteraction.endPan(event2, g, context);
      }
      removeEvent(document, "mousemove", mousemove);
      removeEvent(document, "mouseup", mouseup);
      context.destroy();
    };
    g.addAndTrackEvent(document, "mousemove", mousemove);
    g.addAndTrackEvent(document, "mouseup", mouseup);
  },
  willDestroyContextMyself: true,
  touchstart: function(event, g, context) {
    DygraphInteraction.startTouch(event, g, context);
  },
  touchmove: function(event, g, context) {
    DygraphInteraction.moveTouch(event, g, context);
  },
  touchend: function(event, g, context) {
    DygraphInteraction.endTouch(event, g, context);
  },
  // Disable zooming out if panning.
  dblclick: function(event, g, context) {
    if (context.cancelNextDblclick) {
      context.cancelNextDblclick = false;
      return;
    }
    var e = {
      canvasx: context.dragEndX,
      canvasy: context.dragEndY,
      cancelable: true
    };
    if (g.cascadeEvents_("dblclick", e)) {
      return;
    }
    if (event.altKey || event.shiftKey) {
      return;
    }
    g.resetZoom();
  }
};
DygraphInteraction.nonInteractiveModel_ = {
  mousedown: function(event, g, context) {
    context.initializeMouseDown(event, g, context);
  },
  mouseup: DygraphInteraction.maybeTreatMouseOpAsClick
};
DygraphInteraction.dragIsPanInteractionModel = {
  mousedown: function(event, g, context) {
    context.initializeMouseDown(event, g, context);
    DygraphInteraction.startPan(event, g, context);
  },
  mousemove: function(event, g, context) {
    if (context.isPanning) {
      DygraphInteraction.movePan(event, g, context);
    }
  },
  mouseup: function(event, g, context) {
    if (context.isPanning) {
      DygraphInteraction.endPan(event, g, context);
    }
  }
};
var dygraph_interaction_model_default = DygraphInteraction;

// ../../node_modules/dygraphs/src/dygraph-default-attrs.js
var DEFAULT_ATTRS = {
  highlightCircleSize: 3,
  highlightSeriesOpts: null,
  highlightSeriesBackgroundAlpha: 0.5,
  highlightSeriesBackgroundColor: "rgb(255, 255, 255)",
  labelsSeparateLines: false,
  labelsShowZeroValues: true,
  labelsKMB: false,
  labelsKMG2: false,
  showLabelsOnHighlight: true,
  digitsAfterDecimal: 2,
  maxNumberWidth: 6,
  sigFigs: null,
  strokeWidth: 1,
  strokeBorderWidth: 0,
  strokeBorderColor: "white",
  axisTickSize: 3,
  axisLabelFontSize: 14,
  rightGap: 5,
  showRoller: false,
  xValueParser: void 0,
  delimiter: ",",
  sigma: 2,
  errorBars: false,
  fractions: false,
  wilsonInterval: true,
  // only relevant if fractions is true
  customBars: false,
  fillGraph: false,
  fillAlpha: 0.15,
  connectSeparatedPoints: false,
  stackedGraph: false,
  stackedGraphNaNFill: "all",
  hideOverlayOnMouseOut: true,
  resizable: "no",
  legend: "onmouseover",
  legendFollowOffsetX: 50,
  legendFollowOffsetY: -50,
  stepPlot: false,
  xRangePad: 0,
  yRangePad: null,
  drawAxesAtZero: false,
  // Sizes of the various chart labels.
  titleHeight: 28,
  xLabelHeight: 18,
  yLabelWidth: 18,
  axisLineColor: "black",
  axisLineWidth: 0.3,
  gridLineWidth: 0.3,
  axisLabelWidth: 50,
  gridLineColor: "rgb(128,128,128)",
  interactionModel: dygraph_interaction_model_default.defaultModel,
  animatedZooms: false,
  // (for now)
  animateBackgroundFade: true,
  // Range selector options
  showRangeSelector: false,
  rangeSelectorHeight: 40,
  rangeSelectorPlotStrokeColor: "#808FAB",
  rangeSelectorPlotFillGradientColor: "white",
  rangeSelectorPlotFillColor: "#A7B1C4",
  rangeSelectorBackgroundStrokeColor: "gray",
  rangeSelectorBackgroundLineWidth: 1,
  rangeSelectorPlotLineWidth: 1.5,
  rangeSelectorForegroundStrokeColor: "black",
  rangeSelectorForegroundLineWidth: 1,
  rangeSelectorAlpha: 0.6,
  showInRangeSelector: null,
  // The ordering here ensures that central lines always appear above any
  // fill bars/error bars.
  plotter: [
    dygraph_canvas_default._fillPlotter,
    dygraph_canvas_default._errorPlotter,
    dygraph_canvas_default._linePlotter
  ],
  plugins: [],
  // per-axis options
  axes: {
    x: {
      pixelsPerLabel: 70,
      axisLabelWidth: 60,
      axisLabelFormatter: dateAxisLabelFormatter,
      valueFormatter: dateValueFormatter,
      drawGrid: true,
      drawAxis: true,
      independentTicks: true,
      ticker: dateTicker
    },
    y: {
      axisLabelWidth: 50,
      pixelsPerLabel: 30,
      valueFormatter: numberValueFormatter,
      axisLabelFormatter: numberAxisLabelFormatter,
      drawGrid: true,
      drawAxis: true,
      independentTicks: true,
      ticker: numericTicks
    },
    y2: {
      axisLabelWidth: 50,
      pixelsPerLabel: 30,
      valueFormatter: numberValueFormatter,
      axisLabelFormatter: numberAxisLabelFormatter,
      drawAxis: true,
      // only applies when there are two axes of data.
      drawGrid: false,
      independentTicks: false,
      ticker: numericTicks
    }
  }
};
var dygraph_default_attrs_default = DEFAULT_ATTRS;

// ../../node_modules/dygraphs/src/dygraph-options-reference.js
var OPTIONS_REFERENCE = null;
if (typeof process !== "undefined" && true) {
  OPTIONS_REFERENCE = // <JSON>
  {
    "animateBackgroundFade": {
      "default": "true",
      "labels": ["Overall display"],
      "type": "boolean",
      "description": "Activate an animation effect for a gradual fade."
    },
    "xValueParser": {
      "default": "parseFloat() or Date.parse()*",
      "labels": ["CSV parsing"],
      "type": "function(str) -> number",
      "description": "A function which parses x-values (i.e. the dependent series). Must return a number, even when the values are dates. In this case, millis since epoch are used. This is used primarily for parsing CSV data. *=Dygraphs is slightly more accepting in the dates which it will parse. See code for details."
    },
    "stackedGraph": {
      "default": "false",
      "labels": ["Data Line display"],
      "type": "boolean",
      "description": "If set, stack series on top of one another rather than drawing them independently. The first series specified in the input data will wind up on top of the chart and the last will be on bottom. NaN values are drawn as white areas without a line on top, see stackedGraphNaNFill for details."
    },
    "stackedGraphNaNFill": {
      "default": "all",
      "labels": ["Data Line display"],
      "type": "string",
      "description": 'Controls handling of NaN values inside a stacked graph. NaN values are interpolated/extended for stacking purposes, but the actual point value remains NaN in the legend display. Valid option values are "all" (interpolate internally, repeat leftmost and rightmost value as needed), "inside" (interpolate internally only, use zero outside leftmost and rightmost value), and "none" (treat NaN as zero everywhere).'
    },
    "pointSize": {
      "default": "1",
      "labels": ["Data Line display"],
      "type": "integer",
      "description": 'The size of the dot to draw on each point in pixels (see drawPoints). A dot is always drawn when a point is "isolated", i.e. there is a missing point on either side of it. This also controls the size of those dots.'
    },
    "drawPoints": {
      "default": "false",
      "labels": ["Data Line display"],
      "type": "boolean",
      "description": "Draw a small dot at each point, in addition to a line going through the point. This makes the individual data points easier to see, but can increase visual clutter in the chart. The small dot can be replaced with a custom rendering by supplying a <a href='#drawPointCallback'>drawPointCallback</a>."
    },
    "drawGapEdgePoints": {
      "default": "false",
      "labels": ["Data Line display"],
      "type": "boolean",
      "description": "Draw points at the edges of gaps in the data. This improves visibility of small data segments or other data irregularities."
    },
    "drawPointCallback": {
      "default": "null",
      "labels": ["Data Line display"],
      "type": "function(g, seriesName, canvasContext, cx, cy, color, pointSize, idx)",
      "parameters": [
        ["g", "the reference graph"],
        ["seriesName", "the name of the series"],
        ["canvasContext", "the canvas to draw on"],
        ["cx", "center x coordinate"],
        ["cy", "center y coordinate"],
        ["color", "series color"],
        ["pointSize", "the radius of the image."],
        ["idx", "the row-index of the point in the data."]
      ],
      "description": "Draw a custom item when drawPoints is enabled. Default is a small dot matching the series color. This method should constrain drawing to within pointSize pixels from (cx, cy).  Also see <a href='#drawHighlightPointCallback'>drawHighlightPointCallback</a>"
    },
    "height": {
      "default": "320",
      "labels": ["Overall display"],
      "type": "integer",
      "description": "Height, in pixels, of the chart. If the container div has been explicitly sized, this will be ignored."
    },
    "resizable": {
      "default": "no",
      "labels": ["Overall display"],
      "type": "string",
      "description": 'Whether to add a ResizeObserver to the container div ("passive") and additionally make it resizable ("horizontal", "vertical", "both"). In any case, if the container div has CSS "overflow:visible;" it will be changed to "overflow:hidden;" to make CSS resizing possible. Note that this is distinct from resizing the graph when the window size changes, which is always active; this feature adds user-resizable \u201Chandles\u201D to the container div.'
    },
    "zoomCallback": {
      "default": "null",
      "labels": ["Callbacks"],
      "type": "function(minDate, maxDate, yRanges)",
      "parameters": [
        ["minDate", "milliseconds since epoch"],
        ["maxDate", "milliseconds since epoch."],
        ["yRanges", "is an array of [bottom, top] pairs, one for each y-axis."]
      ],
      "description": "A function to call when the zoom window is changed (either by zooming in or out). When animatedZooms is set, zoomCallback is called once at the end of the transition (it will not be called for intermediate frames)."
    },
    "pointClickCallback": {
      "snippet": "function(e, point){<br>\xA0\xA0alert(point);<br>}",
      "default": "null",
      "labels": ["Callbacks", "Interactive Elements"],
      "type": "function(e, point)",
      "parameters": [
        ["e", "the event object for the click"],
        ["point", "the point that was clicked See <a href='#point_properties'>Point properties</a> for details"]
      ],
      "description": "A function to call when a data point is clicked. and the point that was clicked."
    },
    "color": {
      "default": "(see description)",
      "labels": ["Data Series Colors"],
      "type": "string",
      "example": "red",
      "description": "A per-series color definition. Used in conjunction with, and overrides, the colors option."
    },
    "colors": {
      "default": "(see description)",
      "labels": ["Data Series Colors"],
      "type": "Array of strings",
      "example": "['red', '#00FF00']",
      "description": 'List of colors for the data series. These can be of the form "#AABBCC" or "rgb(255,100,200)" or "yellow", etc. If not specified, equally-spaced points around a color wheel are used. Overridden by the \u201Ccolor\u201D option.'
    },
    "connectSeparatedPoints": {
      "default": "false",
      "labels": ["Data Line display"],
      "type": "boolean",
      "description": "Usually, when Dygraphs encounters a missing value in a data series, it interprets this as a gap and draws it as such. If, instead, the missing values represents an x-value for which only a different series has data, then you\u2019ll want to connect the dots by setting this to true. To explicitly include a gap with this option set, use a value of NaN."
    },
    "highlightCallback": {
      "default": "null",
      "labels": ["Callbacks"],
      "type": "function(event, x, points, row, seriesName)",
      "description": "When set, this callback gets called every time a new point is highlighted.",
      "parameters": [
        ["event", "the JavaScript mousemove event"],
        ["x", "the x-coordinate of the highlighted points"],
        ["points", "an array of highlighted points: <code>[ {name: 'series', yval: y-value}, \u2026 ]</code>"],
        ["row", "integer index of the highlighted row in the data table, starting from 0"],
        ["seriesName", "name of the highlighted series, only present if highlightSeriesOpts is set."]
      ]
    },
    "drawHighlightPointCallback": {
      "default": "null",
      "labels": ["Data Line display"],
      "type": "function(g, seriesName, canvasContext, cx, cy, color, pointSize, idx)",
      "parameters": [
        ["g", "the reference graph"],
        ["seriesName", "the name of the series"],
        ["canvasContext", "the canvas to draw on"],
        ["cx", "center x coordinate"],
        ["cy", "center y coordinate"],
        ["color", "series color"],
        ["pointSize", "the radius of the image."],
        ["idx", "the row-index of the point in the data."]
      ],
      "description": "Draw a custom item when a point is highlighted.  Default is a small dot matching the series color. This method should constrain drawing to within pointSize pixels from (cx, cy) Also see <a href='#drawPointCallback'>drawPointCallback</a>"
    },
    "highlightSeriesOpts": {
      "default": "null",
      "labels": ["Interactive Elements"],
      "type": "Object",
      "description": "When set, the options from this object are applied to the timeseries closest to the mouse pointer for interactive highlighting. See also \u201ChighlightCallback\u201D. Example: highlightSeriesOpts: { strokeWidth: 3 }."
    },
    "highlightSeriesBackgroundAlpha": {
      "default": "0.5",
      "labels": ["Interactive Elements"],
      "type": "float",
      "description": "Fade the background while highlighting series. 1=fully visible background (disable fading), 0=hiddden background (show highlighted series only)."
    },
    "highlightSeriesBackgroundColor": {
      "default": "rgb(255, 255, 255)",
      "labels": ["Interactive Elements"],
      "type": "string",
      "description": "Sets the background color used to fade out the series in conjunction with \u201ChighlightSeriesBackgroundAlpha\u201D."
    },
    "includeZero": {
      "default": "false",
      "labels": ["Axis display"],
      "type": "boolean",
      "description": "Usually, dygraphs will use the range of the data plus some padding to set the range of the y-axis. If this option is set, the y-axis will always include zero, typically as the lowest value. This can be used to avoid exaggerating the variance in the data"
    },
    "rollPeriod": {
      "default": "1",
      "labels": ["Error Bars", "Rolling Averages"],
      "type": "integer &gt;= 1",
      "description": "Number of days over which to average data. Discussed extensively above."
    },
    "unhighlightCallback": {
      "default": "null",
      "labels": ["Callbacks"],
      "type": "function(event)",
      "parameters": [
        ["event", "the mouse event"]
      ],
      "description": "When set, this callback gets called every time the user stops highlighting any point by mousing out of the graph."
    },
    "axisTickSize": {
      "default": "3.0",
      "labels": ["Axis display"],
      "type": "number",
      "description": "The size of the line to display next to each tick mark on x- or y-axes."
    },
    "labelsSeparateLines": {
      "default": "false",
      "labels": ["Legend"],
      "type": "boolean",
      "description": "Put <code>&lt;br/&gt;</code> between lines in the label string. Often used in conjunction with <strong>labelsDiv</strong>."
    },
    "valueFormatter": {
      "default": "Depends on the type of your data.",
      "labels": ["Legend", "Value display/formatting"],
      "type": "function(num_or_millis, opts, seriesName, dygraph, row, col)",
      "description": "Function to provide a custom display format for the values displayed on mouseover. This does not affect the values that appear on tick marks next to the axes. To format those, see axisLabelFormatter. This is usually set on a <a href='per-axis.html'>per-axis</a> basis. .",
      "parameters": [
        ["num_or_millis", "The value to be formatted. This is always a number. For date axes, it\u2019s millis since epoch. You can call new Date(millis) to get a Date object."],
        ["opts", "This is a function you can call to access various options (e.g. opts('labelsKMB')). It returns per-axis values for the option when available."],
        ["seriesName", "The name of the series from which the point came, e.g. 'X', 'Y', 'A', etc."],
        ["dygraph", "The dygraph object for which the formatting is being done"],
        ["row", "The row of the data from which this point comes. g.getValue(row, 0) will return the x-value for this point."],
        ["col", "The column of the data from which this point comes. g.getValue(row, col) will return the original y-value for this point. This can be used to get the full confidence interval for the point, or access un-rolled values for the point."]
      ]
    },
    "annotationMouseOverHandler": {
      "default": "null",
      "labels": ["Annotations"],
      "type": "function(annotation, point, dygraph, event)",
      "description": "If provided, this function is called whenever the user mouses over an annotation."
    },
    "annotationMouseOutHandler": {
      "default": "null",
      "labels": ["Annotations"],
      "type": "function(annotation, point, dygraph, event)",
      "parameters": [
        ["annotation", "the annotation left"],
        ["point", "the point associated with the annotation"],
        ["dygraph", "the reference graph"],
        ["event", "the mouse event"]
      ],
      "description": "If provided, this function is called whenever the user mouses out of an annotation."
    },
    "annotationClickHandler": {
      "default": "null",
      "labels": ["Annotations"],
      "type": "function(annotation, point, dygraph, event)",
      "parameters": [
        ["annotation", "the annotation left"],
        ["point", "the point associated with the annotation"],
        ["dygraph", "the reference graph"],
        ["event", "the mouse event"]
      ],
      "description": "If provided, this function is called whenever the user clicks on an annotation."
    },
    "annotationDblClickHandler": {
      "default": "null",
      "labels": ["Annotations"],
      "type": "function(annotation, point, dygraph, event)",
      "parameters": [
        ["annotation", "the annotation left"],
        ["point", "the point associated with the annotation"],
        ["dygraph", "the reference graph"],
        ["event", "the mouse event"]
      ],
      "description": "If provided, this function is called whenever the user double-clicks on an annotation."
    },
    "drawCallback": {
      "default": "null",
      "labels": ["Callbacks"],
      "type": "function(dygraph, is_initial)",
      "parameters": [
        ["dygraph", "The graph being drawn"],
        ["is_initial", "True if this is the initial draw, false for subsequent draws."]
      ],
      "description": "When set, this callback gets called every time the dygraph is drawn. This includes the initial draw, after zooming and repeatedly while panning."
    },
    "labelsKMG2": {
      "default": "false",
      "labels": ["Value display/formatting"],
      "type": "boolean",
      "description": "Show Ki/Mi/Gi for powers of 1024 on y-axis. If used together with <code>labelsKMB</code> (deprecated), K/M/G are used instead."
    },
    "delimiter": {
      "default": ",",
      "labels": ["CSV parsing"],
      "type": "string",
      "description": "The delimiter to look for when separating fields of a CSV file. Setting this to a tab is not usually necessary, since tab-delimited data is auto-detected."
    },
    "axisLabelFontSize": {
      "default": "14",
      "labels": ["Axis display"],
      "type": "integer",
      "description": "Size of the font (in pixels) to use in the axis labels, both x- and y-axis."
    },
    "underlayCallback": {
      "default": "null",
      "labels": ["Callbacks"],
      "type": "function(context, area, dygraph)",
      "parameters": [
        ["context", "the canvas drawing context on which to draw"],
        ["area", "An object with {x,y,w,h} properties describing the drawing area."],
        ["dygraph", "the reference graph"]
      ],
      "description": "When set, this callback gets called before the chart is drawn. It details on how to use this."
    },
    "width": {
      "default": "480",
      "labels": ["Overall display"],
      "type": "integer",
      "description": "Width, in pixels, of the chart. If the container div has been explicitly sized, this will be ignored."
    },
    "pixelRatio": {
      "default": "(devicePixelRatio / context.backingStoreRatio)",
      "labels": ["Overall display"],
      "type": "float",
      "description": "Overrides the pixel ratio scaling factor for the canvas\u2019 2d context. Ordinarily, this is set to the devicePixelRatio / (context.backingStoreRatio || 1), so on mobile devices, where the devicePixelRatio can be somewhere around 3, performance can be improved by overriding this value to something less precise, like 1, at the expense of resolution."
    },
    "interactionModel": {
      "default": "...",
      "labels": ["Interactive Elements"],
      "type": "Object",
      "description": "TODO(konigsberg): document this"
    },
    "ticker": {
      "default": "Dygraph.dateTicker or Dygraph.numericTicks",
      "labels": ["Axis display"],
      "type": "function(min, max, pixels, opts, dygraph, vals) \u2192 [{v: \u2026, label: \u2026}, \u2026]",
      "parameters": [
        ["min", ""],
        ["max", ""],
        ["pixels", ""],
        ["opts", ""],
        ["dygraph", "the reference graph"],
        ["vals", ""]
      ],
      "description": "This lets you specify an arbitrary function to generate tick marks on an axis. The tick marks are an array of (value, label) pairs. The built-in functions go to great lengths to choose good tick marks so, if you set this option, you\u2019ll most likely want to call one of them and modify the result. See dygraph-tickers.js for an extensive discussion. This is set on a <a href='per-axis.html'>per-axis</a> basis."
    },
    "xAxisHeight": {
      "default": "(null)",
      "labels": ["Axis display"],
      "type": "integer",
      "description": "Height, in pixels, of the x-axis. If not set explicitly, this is computed based on axisLabelFontSize and axisTickSize."
    },
    "showLabelsOnHighlight": {
      "default": "true",
      "labels": ["Interactive Elements", "Legend"],
      "type": "boolean",
      "description": "Whether to show the legend upon mouseover."
    },
    "axis": {
      "default": "(none)",
      "labels": ["Axis display"],
      "type": "string",
      "description": "Set to either 'y1' or 'y2' to assign a series to a y-axis (primary or secondary). Must be set per-series."
    },
    "pixelsPerLabel": {
      "default": "70 (x-axis) or 30 (y-axes)",
      "labels": ["Axis display", "Grid"],
      "type": "integer",
      "description": "Number of pixels to require between each x- and y-label. Larger values will yield a sparser axis with fewer ticks. This is set on a <a href='per-axis.html'>per-axis</a> basis."
    },
    "labelsDiv": {
      "default": "null",
      "labels": ["Legend"],
      "type": "DOM element or string",
      "example": "<code style='font-size: small'>document.getElementById('foo')</code> or <code>'foo'</code>",
      "description": "Show data labels in an external div, rather than on the graph.  This value can either be a div element or a div id."
    },
    "fractions": {
      "default": "false",
      "labels": ["CSV parsing", "Error Bars"],
      "type": "boolean",
      "description": 'When set, attempt to parse each cell in the CSV file as "a/b", where a and b are integers. The ratio will be plotted. This allows computation of Wilson confidence intervals (see below).'
    },
    "logscale": {
      "default": "false",
      "labels": ["Axis display"],
      "type": "boolean",
      "description": "When set for the y-axis or x-axis, the graph shows that axis in log scale. Any values less than or equal to zero are not displayed. Showing log scale with ranges that go below zero will result in an unviewable graph.\n\n Not compatible with showZero. connectSeparatedPoints is ignored. This is ignored for date-based x-axes."
    },
    "strokeWidth": {
      "default": "1.0",
      "labels": ["Data Line display"],
      "type": "float",
      "example": "0.5, 2.0",
      "description": "The width of the lines connecting data points. This can be used to increase the contrast or some graphs."
    },
    "strokePattern": {
      "default": "null",
      "labels": ["Data Line display"],
      "type": "Array of integers",
      "example": "[10, 2, 5, 2]",
      "description": "A custom pattern array where the even index is a draw and odd is a space in pixels. If null then it draws a solid line. The array should have a even length as any odd lengthed array could be expressed as a smaller even length array. This is used to create dashed lines."
    },
    "strokeBorderWidth": {
      "default": "null",
      "labels": ["Data Line display"],
      "type": "float",
      "example": "1.0",
      "description": "Draw a border around graph lines to make crossing lines more easily distinguishable. Useful for graphs with many lines."
    },
    "strokeBorderColor": {
      "default": "white",
      "labels": ["Data Line display"],
      "type": "string",
      "example": "red, #ccffdd",
      "description": "Color for the line border used if strokeBorderWidth is set."
    },
    "wilsonInterval": {
      "default": "true",
      "labels": ["Error Bars"],
      "type": "boolean",
      "description": 'Use in conjunction with the "fractions" option. Instead of plotting +/- N standard deviations, dygraphs will compute a Wilson confidence interval and plot that. This has more reasonable behavior for ratios close to 0 or 1.'
    },
    "fillGraph": {
      "default": "false",
      "labels": ["Data Line display"],
      "type": "boolean",
      "description": "Should the area underneath the graph be filled? This option is not compatible with <tt>customBars</tt> nor <tt>errorBars</tt>. This may be set on a <a href='per-axis.html'>per-series</a> basis."
    },
    "highlightCircleSize": {
      "default": "3",
      "labels": ["Interactive Elements"],
      "type": "integer",
      "description": "The size in pixels of the dot drawn over highlighted points."
    },
    "gridLineColor": {
      "default": "rgb(128,128,128)",
      "labels": ["Grid"],
      "type": "red, blue",
      "description": "The color of the gridlines. This may be set on a per-axis basis to define each axis\u2019 grid separately."
    },
    "gridLinePattern": {
      "default": "null",
      "labels": ["Grid"],
      "type": "Array of integers",
      "example": "[10, 2, 5, 2]",
      "description": "A custom pattern array where the even index is a draw and odd is a space in pixels. If null then it draws a solid line. The array should have a even length as any odd lengthed array could be expressed as a smaller even length array. This is used to create dashed gridlines."
    },
    "visibility": {
      "default": "[true, true, ...]",
      "labels": ["Data Line display"],
      "type": "Array of booleans",
      "description": "Which series should initially be visible? Once the Dygraph has been constructed, you can access and modify the visibility of each series using the <code>visibility</code> and <code>setVisibility</code> methods."
    },
    "valueRange": {
      "default": "Full range of the input is shown",
      "labels": ["Axis display"],
      "type": "Array of two numbers",
      "example": "[10, 110]",
      "description": "Explicitly set the vertical range of the graph to [low, high]. This may be set on a per-axis basis to define each y-axis separately. If either limit is unspecified, it will be calculated automatically (e.g. [null, 30] to automatically calculate just the lower bound)"
    },
    "colorSaturation": {
      "default": "1.0",
      "labels": ["Data Series Colors"],
      "type": "float (0.0 - 1.0)",
      "description": "If <strong>colors</strong> is not specified, saturation of the automatically-generated data series colors."
    },
    "hideOverlayOnMouseOut": {
      "default": "true",
      "labels": ["Interactive Elements", "Legend"],
      "type": "boolean",
      "description": "Whether to hide the legend when the mouse leaves the chart area."
    },
    "legend": {
      "default": "onmouseover",
      "labels": ["Legend"],
      "type": "string",
      "description": 'When to display the legend. By default, it only appears when a user mouses over the chart. Set it to "always" to always display a legend of some sort, "never" to hide it. When set to "follow", legend follows highlighted points.'
    },
    "legendFollowOffsetX": {
      "default": "50",
      "labels": ["Legend"],
      "type": "integer",
      "description": 'Number of pixels to use as horizontal offset from the point for a \u201Cfloating\u201D legend ("follow" mode). This should be positive (to the right) because the legend flips over to the left side if it\u2019s too wide.'
    },
    "legendFollowOffsetY": {
      "default": "-50",
      "labels": ["Legend"],
      "type": "integer",
      "description": 'Number of pixels to use as vertical offset from the point for a \u201Cfloating\u201D legend ("follow" mode).'
    },
    "legendFormatter": {
      "default": "null",
      "labels": ["Legend"],
      "type": "function(data): string or DocumentFragment node",
      "params": [
        ["data", 'An object containing information about the selection (or lack of a selection). This includes formatted values and series information. See <a href="legend-formatter.md"><tt>docs/legend-formatter.md</tt></a> (<a href="https://github.com/danvk/dygraphs/blob/master/docs/legend-formatter.md">online</a>) for sample values.']
      ],
      "description": 'Set this to supply a custom formatter for the legend. See <a href="legend-formatter.md"><tt>docs/legend-formatter.md</tt></a> (<a href="https://github.com/danvk/dygraphs/blob/master/docs/legend-formatter.md">online</a>) and the <a href="tests/legend-formatter.html">legendFormatter demo</a> for usage.'
    },
    "labelsShowZeroValues": {
      "default": "true",
      "labels": ["Legend"],
      "type": "boolean",
      "description": "Show zero value labels in the labelsDiv."
    },
    "stepPlot": {
      "default": "false",
      "labels": ["Data Line display"],
      "type": "boolean",
      "description": "When set, display the graph as a step plot instead of a line plot. This option may either be set for the whole graph or for single series."
    },
    "labelsUTC": {
      "default": "false",
      "labels": ["Value display/formatting", "Axis display"],
      "type": "boolean",
      "description": "Show date/time labels according to UTC (instead of local time)."
    },
    "labelsKMB": {
      "default": "false",
      "labels": ["Value display/formatting"],
      "type": "boolean",
      "description": "Show k/M/B for thousands/millions/billions on y-axis."
    },
    "rightGap": {
      "default": "5",
      "labels": ["Overall display"],
      "type": "integer",
      "description": "Number of pixels to leave blank at the right edge of the Dygraph. This makes it easier to highlight the right-most data point."
    },
    "drawAxesAtZero": {
      "default": "false",
      "labels": ["Axis display"],
      "type": "boolean",
      "description": "When set, draw the X axis at the Y=0 position and the Y axis at the X=0 position if those positions are inside the graph\u2019s visible area. Otherwise, draw the axes at the bottom or left graph edge as usual."
    },
    "xRangePad": {
      "default": "0",
      "labels": ["Axis display"],
      "type": "float",
      "description": "Add the specified amount of extra space (in pixels) around the X-axis value range to ensure points at the edges remain visible."
    },
    "yRangePad": {
      "default": "null",
      "labels": ["Axis display"],
      "type": "float",
      "description": "If set, add the specified amount of extra space (in pixels) around the Y-axis value range to ensure points at the edges remain visible. If unset, use the traditional Y padding algorithm."
    },
    "axisLabelFormatter": {
      "default": "Depends on the data type",
      "labels": ["Axis display"],
      "type": "function(number_or_Date, granularity, opts, dygraph)",
      "parameters": [
        ["number_or_Date", "Either a number (for a numeric axis) or a Date object (for a date axis)"],
        ["granularity", "specifies how fine-grained the axis is. For date axes, this is a reference to the time granularity enumeration, defined in dygraph-tickers.js, e.g. Dygraph.WEEKLY."],
        ["opts", "a function which provides access to various options on the dygraph, e.g. opts('labelsKMB')."],
        ["dygraph", "the referenced graph"]
      ],
      "description": "Function to call to format the tick values that appear along an axis. This is usually set on a <a href='per-axis.html'>per-axis</a> basis."
    },
    "clickCallback": {
      "snippet": "function(e, date_millis){<br>\xA0\xA0alert(new Date(date_millis));<br>}",
      "default": "null",
      "labels": ["Callbacks"],
      "type": "function(e, x, points)",
      "parameters": [
        ["e", "The event object for the click"],
        ["x", "The x value that was clicked (for dates, this is milliseconds since epoch)"],
        ["points", "The closest points along that date. See <a href='#point_properties'>Point properties</a> for details."]
      ],
      "description": "A function to call when the canvas is clicked."
    },
    "labels": {
      "default": '["X", "Y1", "Y2", ...]*',
      "labels": ["Legend"],
      "type": "Array of strings",
      "description": "A distinct name for each data series, including the independent (X) series. For CSV files and DataTable objects, this is determined by context. For raw data, this must be specified. If it is not, default values are supplied and a warning is logged. Make sure no two names are the same!"
    },
    "dateWindow": {
      "default": "Full range of the input is shown",
      "labels": ["Axis display"],
      "type": "Array of two numbers",
      "example": "[<br>\xA0\xA0Date.parse('2006-01-01'),<br>\xA0\xA0(new Date()).valueOf()<br>]",
      "description": "Initially zoom in on a section of the graph. Is of the form [earliest, latest], where earliest/latest are milliseconds since epoch. If the data for the x-axis is numeric, the values in dateWindow must also be numbers."
    },
    "showRoller": {
      "default": "false",
      "labels": ["Interactive Elements", "Rolling Averages"],
      "type": "boolean",
      "description": "If the rolling average period text box should be shown."
    },
    "sigma": {
      "default": "2.0",
      "labels": ["Error Bars"],
      "type": "float",
      "description": "When errorBars is set, shade this many standard deviations above/below each point."
    },
    "customBars": {
      "default": "false",
      "labels": ["CSV parsing", "Error Bars"],
      "type": "boolean",
      "description": 'When set, parse each CSV cell as "low;middle;high". Custom high/low bands will be drawn for each point between low and high, with the series itself going through middle.'
    },
    "colorValue": {
      "default": "1.0",
      "labels": ["Data Series Colors"],
      "type": "float (0.0 - 1.0)",
      "description": "If colors is not specified, value of the data series colors, as in hue/saturation/value. (0.0-1.0, default 0.5)"
    },
    "errorBars": {
      "default": "false",
      "labels": ["CSV parsing", "Error Bars"],
      "type": "boolean",
      "description": "Does the data contain standard deviations? Setting this to true alters the input format (see above)."
    },
    "displayAnnotations": {
      "default": "false",
      "labels": ["Annotations"],
      "type": "boolean",
      "description": "Only applies when Dygraphs is used as a GViz chart. Causes string columns following a data series to be interpreted as annotations on points in that series. This is the same format used by Google\u2019s AnnotatedTimeLine chart."
    },
    "panEdgeFraction": {
      "default": "null",
      "labels": ["Axis display", "Interactive Elements"],
      "type": "float",
      "description": "A value representing the farthest a graph may be panned, in percent of the display. For example, a value of 0.1 means that the graph can only be panned 10% passed the edges of the displayed values. null means no bounds."
    },
    "title": {
      "labels": ["Chart labels"],
      "type": "string",
      "default": "null",
      "description": "Text to display above the chart. You can supply any HTML for this value, not just text. If you wish to style it using CSS, use the \u201Cdygraph-label\u201D or \u201Cdygraph-title\u201D classes."
    },
    "titleHeight": {
      "default": "18",
      "labels": ["Chart labels"],
      "type": "integer",
      "description": "Height of the chart title, in pixels. This also controls the default font size of the title. If you style the title on your own, this controls how much space is set aside above the chart for the title\u2019s div."
    },
    "xlabel": {
      "labels": ["Chart labels"],
      "type": "string",
      "default": "null",
      "description": "Text to display below the chart\u2019s x-axis. You can supply any HTML for this value, not just text. If you wish to style it using CSS, use the \u201Cdygraph-label\u201D or \u201Cdygraph-xlabel\u201D classes."
    },
    "xLabelHeight": {
      "labels": ["Chart labels"],
      "type": "integer",
      "default": "18",
      "description": "Height of the x-axis label, in pixels. This also controls the default font size of the x-axis label. If you style the label on your own, this controls how much space is set aside below the chart for the x-axis label\u2019s div."
    },
    "ylabel": {
      "labels": ["Chart labels"],
      "type": "string",
      "default": "null",
      "description": "Text to display to the left of the chart\u2019s y-axis. You can supply any HTML for this value, not just text. If you wish to style it using CSS, use the \u201Cdygraph-label\u201D or \u201Cdygraph-ylabel\u201D classes. The text will be rotated 90 degrees by default, so CSS rules may behave in unintuitive ways. No additional space is set aside for a y-axis label. If you need more space, increase the width of the y-axis tick labels using the per-axis <tt>axisLabelWidth</tt> option on the y axis. If you need a wider div for the y-axis label, either style it that way with CSS (but remember that it\u2019s rotated, so width is controlled by the \u201Cheight\u201D property) or set the yLabelWidth option."
    },
    "y2label": {
      "labels": ["Chart labels"],
      "type": "string",
      "default": "null",
      "description": "Text to display to the right of the chart\u2019s secondary y-axis. This label is only displayed if a secondary y-axis is present. See <a href='tests/two-axes.html'>this test</a> for an example of how to do this. The comments for the \u201Cylabel\u201D option generally apply here as well. This label gets a \u201Cdygraph-y2label\u201D instead of a \u201Cdygraph-ylabel\u201D class."
    },
    "yLabelWidth": {
      "labels": ["Chart labels"],
      "type": "integer",
      "default": "18",
      "description": "Width of the div which contains the y-axis label. Since the y-axis label appears rotated 90 degrees, this actually affects the height of its div."
    },
    "drawGrid": {
      "default": "true for x and y, false for y2",
      "labels": ["Grid"],
      "type": "boolean",
      "description": "Whether to display gridlines in the chart. This may be set on a per-axis basis to define the visibility of each axis\u2019 grid separately."
    },
    "independentTicks": {
      "default": "true for y, false for y2",
      "labels": ["Axis display", "Grid"],
      "type": "boolean",
      "description": "Only valid for y and y2, has no effect on x: This option defines whether the y axes should align their ticks or if they should be independent. Possible combinations: [1.] y=true, y2=false (default): y is the primary axis and the y2 ticks are aligned to the the ones of y. (only 1 grid) [2.] y=false, y2=true: y2 is the primary axis and the y ticks are aligned to the the ones of y2. (only 1 grid) [3.] y=true, y2=true: Both axis are independent and have their own ticks. (2 grids) [4.] y=false, y2=false: Invalid configuration causes an error."
    },
    "drawAxis": {
      "default": "true for x and y, false for y2",
      "labels": ["Axis display"],
      "type": "boolean",
      "description": "Whether to draw the specified axis. This may be set on a per-axis basis to define the visibility of each axis separately. Setting this to false also prevents axis ticks from being drawn and reclaims the space for the chart grid/lines."
    },
    "gridLineWidth": {
      "default": "0.3",
      "labels": ["Grid"],
      "type": "float",
      "description": "Thickness (in pixels) of the gridlines drawn under the chart. The vertical/horizontal gridlines can be turned off entirely by using the drawGrid option. This may be set on a per-axis basis to define each axis\u2019 grid separately."
    },
    "axisLineWidth": {
      "default": "0.3",
      "labels": ["Axis display"],
      "type": "float",
      "description": "Thickness (in pixels) of the x- and y-axis lines."
    },
    "axisLineColor": {
      "default": "black",
      "labels": ["Axis display"],
      "type": "string",
      "description": "Color of the x- and y-axis lines. Accepts any value which the HTML canvas strokeStyle attribute understands, e.g. 'black' or 'rgb(0, 100, 255)'."
    },
    "fillAlpha": {
      "default": "0.15",
      "labels": ["Error Bars", "Data Series Colors"],
      "type": "float (0.0 - 1.0)",
      "description": "Custom or sigma-based high/low bands for each series are drawn in the same colour as the series, but with partial transparency. This sets the transparency. A value of 0.0 means that the bands will not be drawn, whereas a value of 1.0 means that the bands will be as dark as the line for the series itself. This can be used to produce chart lines whose thickness varies at each point."
    },
    "axisLabelWidth": {
      "default": "50 (y-axis), 60 (x-axis)",
      "labels": ["Axis display", "Chart labels"],
      "type": "integer",
      "description": "Width (in pixels) of the containing divs for x- and y-axis labels. For the y-axis, this also controls the width of the y-axis. Note that for the x-axis, this is independent from pixelsPerLabel, which controls the spacing between labels."
    },
    "sigFigs": {
      "default": "null",
      "labels": ["Value display/formatting"],
      "type": "integer",
      "description": "By default, dygraphs displays numbers with a fixed number of digits after the decimal point. If you\u2019d prefer to have a fixed number of significant figures, set this option to that number of sig figs. A value of 2, for instance, would cause 1 to be display as 1.0 and 1234 to be displayed as 1.23e+3."
    },
    "digitsAfterDecimal": {
      "default": "2",
      "labels": ["Value display/formatting"],
      "type": "integer",
      "description": "Unless it\u2019s run in scientific mode (see the <code>sigFigs</code> option), dygraphs displays numbers with <code>digitsAfterDecimal</code> digits after the decimal point. Trailing zeros are not displayed, so with a value of 2 you\u2019ll get '0', '0.1', '0.12', '123.45' but not '123.456' (it will be rounded to '123.46'). Numbers with absolute value less than 0.1^digitsAfterDecimal (i.e. those which would show up as '0.00') will be displayed in scientific notation."
    },
    "maxNumberWidth": {
      "default": "6",
      "labels": ["Value display/formatting"],
      "type": "integer",
      "description": "When displaying numbers in normal (not scientific) mode, large numbers will be displayed with many trailing zeros (e.g. 100000000 instead of 1e9). This can lead to unwieldy y-axis labels. If there are more than <code>maxNumberWidth</code> digits to the left of the decimal in a number, dygraphs will switch to scientific notation, even when not operating in scientific mode. If you\u2019d like to see all those digits, set this to something large, like 20 or 30."
    },
    "file": {
      "default": "(set when constructed)",
      "labels": ["Data"],
      "type": "string (URL of CSV or CSV), GViz DataTable or 2D Array",
      "description": "Sets the data being displayed in the chart. This can only be set when calling updateOptions; it cannot be set from the constructor. For a full description of valid data formats, see the <a href='data.html'>Data Formats</a> page."
    },
    "timingName": {
      "default": "null",
      "labels": ["Debugging", "Deprecated"],
      "type": "string",
      "description": "Set this option to log timing information. The value of the option will be logged along with the timimg, so that you can distinguish multiple dygraphs on the same page."
    },
    "showRangeSelector": {
      "default": "false",
      "labels": ["Range Selector"],
      "type": "boolean",
      "description": "Show or hide the range selector widget."
    },
    "rangeSelectorHeight": {
      "default": "40",
      "labels": ["Range Selector"],
      "type": "integer",
      "description": "Height, in pixels, of the range selector widget. This option can only be specified at Dygraph creation time."
    },
    "rangeSelectorPlotStrokeColor": {
      "default": "#808FAB",
      "labels": ["Range Selector"],
      "type": "string",
      "description": 'The range selector mini plot stroke color. This can be of the form "#AABBCC" or "rgb(255,100,200)" or "yellow". You can also specify null or "" to turn off stroke.'
    },
    "rangeSelectorPlotFillColor": {
      "default": "#A7B1C4",
      "labels": ["Range Selector"],
      "type": "string",
      "description": 'The range selector mini plot fill color. This can be of the form "#AABBCC" or "rgb(255,100,200)" or "yellow". You can also specify null or "" to turn off fill.'
    },
    "rangeSelectorPlotFillGradientColor": {
      "default": "white",
      "labels": ["Range Selector"],
      "type": "string",
      "description": 'The top color for the range selector mini plot fill color gradient. This can be of the form "#AABBCC" or "rgb(255,100,200)" or "rgba(255,100,200,42)" or "yellow". You can also specify null or "" to disable the gradient and fill with one single color.'
    },
    "rangeSelectorBackgroundStrokeColor": {
      "default": "gray",
      "labels": ["Range Selector"],
      "type": "string",
      "description": 'The color of the lines below and on both sides of the range selector mini plot. This can be of the form "#AABBCC" or "rgb(255,100,200)" or "yellow".'
    },
    "rangeSelectorBackgroundLineWidth": {
      "default": "1",
      "labels": ["Range Selector"],
      "type": "float",
      "description": "The width of the lines below and on both sides of the range selector mini plot."
    },
    "rangeSelectorPlotLineWidth": {
      "default": "1.5",
      "labels": ["Range Selector"],
      "type": "float",
      "description": "The width of the range selector mini plot line."
    },
    "rangeSelectorForegroundStrokeColor": {
      "default": "black",
      "labels": ["Range Selector"],
      "type": "string",
      "description": 'The color of the lines in the interactive layer of the range selector. This can be of the form "#AABBCC" or "rgb(255,100,200)" or "yellow".'
    },
    "rangeSelectorForegroundLineWidth": {
      "default": "1",
      "labels": ["Range Selector"],
      "type": "float",
      "description": "The width the lines in the interactive layer of the range selector."
    },
    "rangeSelectorAlpha": {
      "default": "0.6",
      "labels": ["Range Selector"],
      "type": "float (0.0 - 1.0)",
      "description": "The transparency of the veil that is drawn over the unselected portions of the range selector mini plot. A value of 0 represents full transparency and the unselected portions of the mini plot will appear as normal. A value of 1 represents full opacity and the unselected portions of the mini plot will be hidden."
    },
    "rangeSelectorVeilColour": {
      "default": "null",
      "labels": ["Range Selector"],
      "type": "string",
      "description": 'The fillStyle for the veil of the range selector (e.g. "rgba(240, 240, 240, 0.6)"); if set, the rangeSelectorAlpha option is ignored.'
    },
    "showInRangeSelector": {
      "default": "null",
      "labels": ["Range Selector"],
      "type": "boolean",
      "description": "Mark this series for inclusion in the range selector. The mini plot curve will be an average of all such series. If this is not specified for any series, the default behavior is to average all the visible series. Setting it for one series will result in that series being charted alone in the range selector. Once it\u2019s set for a single series, it needs to be set for all series which should be included (regardless of visibility)."
    },
    "animatedZooms": {
      "default": "false",
      "labels": ["Interactive Elements"],
      "type": "boolean",
      "description": "Set this option to animate the transition between zoom windows. Applies to programmatic and interactive zooms. Note that if you also set a drawCallback, it will be called several times on each zoom. If you set a zoomCallback, it will only be called after the animation is complete."
    },
    "plotter": {
      "default": "[DygraphCanvasRenderer.Plotters.fillPlotter, DygraphCanvasRenderer.Plotters.errorPlotter, DygraphCanvasRenderer.Plotters.linePlotter]",
      "labels": ["Data Line display"],
      "type": "array or function",
      "description": "A function (or array of functions) which plot each data series on the chart. TODO(danvk): more details! May be set per-series."
    },
    "axes": {
      "default": "null",
      "labels": ["Configuration"],
      "type": "Object",
      "description": "Defines per-axis options. Valid keys are 'x', 'y' and 'y2'. Only some options may be set on a per-axis basis. If an option may be set in this way, it will be noted on this page. See also documentation on <a href='per-axis.html'>per-series and per-axis options</a>."
    },
    "series": {
      "default": "null",
      "labels": ["Series"],
      "type": "Object",
      "description": "Defines per-series options. Its keys match the y-axis label names, and the values are dictionaries themselves that contain options specific to that series."
    },
    "plugins": {
      "default": "[]",
      "labels": ["Configuration"],
      "type": "Array of plugins",
      "description": "Defines per-graph plugins. Useful for per-graph customization"
    },
    "dataHandler": {
      "default": "(depends on data)",
      "labels": ["Data"],
      "type": "Dygraph.DataHandler",
      "description": "Custom DataHandler. This is an advanced customisation. See <a href='datahandler-proposal.pdf'><tt>docs/datahandler-proposal.pdf</tt></a>."
    }
  };
  const warn = function warn2(msg) {
    if (window.console)
      window.console.warn(msg);
  };
  const flds = ["type", "default", "description"];
  const valid_cats = (
    // <JSON>
    {
      "Annotations": "",
      "Axis display": "",
      "CSV parsing": "",
      "Callbacks": "",
      "Chart labels": "",
      "Configuration": "",
      "Data Line display": "",
      "Data Series Colors": "",
      "Data": "",
      "Debugging": "",
      "Deprecated": "",
      "Error Bars": "These are actually high/low bands, not error bars; the misnomer is historic.",
      "Grid": "",
      "Interactive Elements": "",
      "Legend": "",
      "Overall display": "",
      "Range Selector": "",
      "Rolling Averages": "",
      "Series": "",
      "Value display/formatting": ""
    }
  );
  for (let k in OPTIONS_REFERENCE) {
    if (!OPTIONS_REFERENCE.hasOwnProperty(k)) continue;
    op = OPTIONS_REFERENCE[k];
    for (let i = 0; i < flds.length; i++) {
      if (!op.hasOwnProperty(flds[i])) {
        warn("Option " + k + ' missing "' + flds[i] + '" property');
      } else if (typeof op[flds[i]] != "string") {
        warn(k + "." + flds[i] + " must be of type string");
      }
    }
    let labels = op.labels;
    if (!Array.isArray(labels)) {
      warn('Option "' + k + '" is missing a "labels": [...] option');
    } else {
      for (let i = 0; i < labels.length; i++) {
        if (!valid_cats.hasOwnProperty(labels[i])) {
          warn('Option "' + k + '" has label "' + labels[i] + '", which is invalid.');
        }
      }
    }
  }
}
var op;
var dygraph_options_reference_default = OPTIONS_REFERENCE;

// ../../node_modules/dygraphs/src/dygraph-options.js
var DygraphOptions = function(dygraph) {
  this.dygraph_ = dygraph;
  this.yAxes_ = [];
  this.xAxis_ = {};
  this.series_ = {};
  this.global_ = this.dygraph_.attrs_;
  this.user_ = this.dygraph_.user_attrs_ || {};
  this.labels_ = [];
  this.highlightSeries_ = this.get("highlightSeriesOpts") || {};
  this.reparseSeries();
};
DygraphOptions.AXIS_STRING_MAPPINGS_ = {
  "y": 0,
  "Y": 0,
  "y1": 0,
  "Y1": 0,
  "y2": 1,
  "Y2": 1
};
DygraphOptions.axisToIndex_ = function(axis) {
  if (typeof axis == "string") {
    if (DygraphOptions.AXIS_STRING_MAPPINGS_.hasOwnProperty(axis)) {
      return DygraphOptions.AXIS_STRING_MAPPINGS_[axis];
    }
    throw "Unknown axis : " + axis;
  }
  if (typeof axis == "number") {
    if (axis === 0 || axis === 1) {
      return axis;
    }
    throw "Dygraphs only supports two y-axes, indexed from 0-1.";
  }
  if (axis) {
    throw "Unknown axis : " + axis;
  }
  return 0;
};
DygraphOptions.prototype.reparseSeries = function() {
  var labels = this.get("labels");
  if (!labels) {
    return;
  }
  this.labels_ = labels.slice(1);
  this.yAxes_ = [{ series: [], options: {} }];
  this.xAxis_ = { options: {} };
  this.series_ = {};
  var seriesDict = this.user_.series || {};
  for (var idx = 0; idx < this.labels_.length; idx++) {
    var seriesName = this.labels_[idx];
    var optionsForSeries = seriesDict[seriesName] || {};
    var yAxis = DygraphOptions.axisToIndex_(optionsForSeries["axis"]);
    this.series_[seriesName] = {
      idx,
      yAxis,
      options: optionsForSeries
    };
    if (!this.yAxes_[yAxis]) {
      this.yAxes_[yAxis] = { series: [seriesName], options: {} };
    } else {
      this.yAxes_[yAxis].series.push(seriesName);
    }
  }
  var axis_opts = this.user_["axes"] || {};
  update(this.yAxes_[0].options, axis_opts["y"] || {});
  if (this.yAxes_.length > 1) {
    update(this.yAxes_[1].options, axis_opts["y2"] || {});
  }
  update(this.xAxis_.options, axis_opts["x"] || {});
  if (typeof process !== "undefined" && true) {
    this.validateOptions_();
  }
};
DygraphOptions.prototype.get = function(name) {
  var result = this.getGlobalUser_(name);
  if (result !== null) {
    return result;
  }
  return this.getGlobalDefault_(name);
};
DygraphOptions.prototype.getGlobalUser_ = function(name) {
  if (this.user_.hasOwnProperty(name)) {
    return this.user_[name];
  }
  return null;
};
DygraphOptions.prototype.getGlobalDefault_ = function(name) {
  if (this.global_.hasOwnProperty(name)) {
    return this.global_[name];
  }
  if (dygraph_default_attrs_default.hasOwnProperty(name)) {
    return dygraph_default_attrs_default[name];
  }
  return null;
};
DygraphOptions.prototype.getForAxis = function(name, axis) {
  var axisIdx;
  var axisString;
  if (typeof axis == "number") {
    axisIdx = axis;
    axisString = axisIdx === 0 ? "y" : "y2";
  } else {
    if (axis == "y1") {
      axis = "y";
    }
    if (axis == "y") {
      axisIdx = 0;
    } else if (axis == "y2") {
      axisIdx = 1;
    } else if (axis == "x") {
      axisIdx = -1;
    } else {
      throw "Unknown axis " + axis;
    }
    axisString = axis;
  }
  var userAxis = axisIdx == -1 ? this.xAxis_ : this.yAxes_[axisIdx];
  if (userAxis) {
    var axisOptions = userAxis.options;
    if (axisOptions.hasOwnProperty(name)) {
      return axisOptions[name];
    }
  }
  if (!(axis === "x" && name === "logscale")) {
    var result = this.getGlobalUser_(name);
    if (result !== null) {
      return result;
    }
  }
  var defaultAxisOptions = dygraph_default_attrs_default.axes[axisString];
  if (defaultAxisOptions.hasOwnProperty(name)) {
    return defaultAxisOptions[name];
  }
  return this.getGlobalDefault_(name);
};
DygraphOptions.prototype.getForSeries = function(name, series) {
  if (series === this.dygraph_.getHighlightSeries()) {
    if (this.highlightSeries_.hasOwnProperty(name)) {
      return this.highlightSeries_[name];
    }
  }
  if (!this.series_.hasOwnProperty(series)) {
    throw "Unknown series: " + series;
  }
  var seriesObj = this.series_[series];
  var seriesOptions = seriesObj["options"];
  if (seriesOptions.hasOwnProperty(name)) {
    return seriesOptions[name];
  }
  return this.getForAxis(name, seriesObj["yAxis"]);
};
DygraphOptions.prototype.numAxes = function() {
  return this.yAxes_.length;
};
DygraphOptions.prototype.axisForSeries = function(series) {
  return this.series_[series].yAxis;
};
DygraphOptions.prototype.axisOptions = function(yAxis) {
  return this.yAxes_[yAxis].options;
};
DygraphOptions.prototype.seriesForAxis = function(yAxis) {
  return this.yAxes_[yAxis].series;
};
DygraphOptions.prototype.seriesNames = function() {
  return this.labels_;
};
if (typeof process !== "undefined" && true) {
  DygraphOptions.prototype.validateOptions_ = function() {
    if (typeof dygraph_options_reference_default === "undefined") {
      throw "Called validateOptions_ in prod build.";
    }
    var that = this;
    var validateOption = function(optionName2) {
      if (!dygraph_options_reference_default[optionName2]) {
        that.warnInvalidOption_(optionName2);
      }
    };
    var optionsDicts = [
      this.xAxis_.options,
      this.yAxes_[0].options,
      this.yAxes_[1] && this.yAxes_[1].options,
      this.global_,
      this.user_,
      this.highlightSeries_
    ];
    var names = this.seriesNames();
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (this.series_.hasOwnProperty(name)) {
        optionsDicts.push(this.series_[name].options);
      }
    }
    for (var i = 0; i < optionsDicts.length; i++) {
      var dict = optionsDicts[i];
      if (!dict) continue;
      for (var optionName in dict) {
        if (dict.hasOwnProperty(optionName)) {
          validateOption(optionName);
        }
      }
    }
  };
  WARNINGS = {};
  DygraphOptions.prototype.warnInvalidOption_ = function(optionName) {
    if (!WARNINGS[optionName]) {
      WARNINGS[optionName] = true;
      var isSeries = this.labels_.indexOf(optionName) >= 0;
      if (isSeries) {
        console.warn("Use new-style per-series options (saw " + optionName + " as top-level options key). See http://blog.dygraphs.com/2012/12/the-new-and-better-way-to-specify.html (The New and Better Way to Specify Series and Axis Options).");
      } else {
        console.warn("Unknown option " + optionName + " (see https://dygraphs.com/options.html for the full list of options)");
      }
      throw "invalid option " + optionName;
    }
  };
  DygraphOptions.resetWarnings_ = function() {
    WARNINGS = {};
  };
}
var WARNINGS;
var dygraph_options_default = DygraphOptions;

// ../../node_modules/dygraphs/src/iframe-tarp.js
function IFrameTarp() {
  this.tarps = [];
}
IFrameTarp.prototype.cover = function() {
  var iframes = document.getElementsByTagName("iframe");
  for (var i = 0; i < iframes.length; i++) {
    var iframe = iframes[i];
    var pos = findPos(iframe), x = pos.x, y = pos.y, width = iframe.offsetWidth, height = iframe.offsetHeight;
    var div = document.createElement("div");
    div.style.position = "absolute";
    div.style.left = x + "px";
    div.style.top = y + "px";
    div.style.width = width + "px";
    div.style.height = height + "px";
    div.style.zIndex = 999;
    document.body.appendChild(div);
    this.tarps.push(div);
  }
};
IFrameTarp.prototype.uncover = function() {
  for (var i = 0; i < this.tarps.length; i++) {
    this.tarps[i].parentNode.removeChild(this.tarps[i]);
  }
  this.tarps = [];
};
var iframe_tarp_default = IFrameTarp;

// ../../node_modules/dygraphs/src/datahandler/datahandler.js
var DygraphDataHandler = function() {
};
var handler = DygraphDataHandler;
handler.X = 0;
handler.Y = 1;
handler.EXTRAS = 2;
handler.prototype.extractSeries = function(rawData, seriesIndex, options) {
};
handler.prototype.seriesToPoints = function(series, setName, boundaryIdStart) {
  var points = [];
  for (var i = 0; i < series.length; ++i) {
    var item = series[i];
    var yraw = item[1];
    var yval = yraw === null ? null : handler.parseFloat(yraw);
    var point = {
      x: NaN,
      y: NaN,
      xval: handler.parseFloat(item[0]),
      yval,
      name: setName,
      // TODO(danvk): is this really necessary?
      idx: i + boundaryIdStart,
      canvasx: NaN,
      // add these so we do not alter the structure later, which slows Chrome
      canvasy: NaN
    };
    points.push(point);
  }
  this.onPointsCreated_(series, points);
  return points;
};
handler.prototype.onPointsCreated_ = function(series, points) {
};
handler.prototype.rollingAverage = function(series, rollPeriod, options, seriesIndex) {
};
handler.prototype.getExtremeYValues = function(series, dateWindow, stepPlot) {
};
handler.prototype.onLineEvaluated = function(points, axis, logscale) {
};
handler.parseFloat = function(val) {
  if (val === null) {
    return NaN;
  }
  return val;
};
var datahandler_default = DygraphDataHandler;

// ../../node_modules/dygraphs/src/datahandler/default.js
var DefaultHandler = function() {
};
DefaultHandler.prototype = new datahandler_default();
DefaultHandler.prototype.extractSeries = function(rawData, i, options) {
  var series = [];
  const seriesLabel = options.get("labels")[i];
  const logScale = options.getForSeries("logscale", seriesLabel);
  for (var j = 0; j < rawData.length; j++) {
    var x = rawData[j][0];
    var point = rawData[j][i];
    if (logScale) {
      if (point <= 0) {
        point = null;
      }
    }
    series.push([x, point]);
  }
  return series;
};
DefaultHandler.prototype.rollingAverage = function(originalData, rollPeriod, options, i) {
  rollPeriod = Math.min(rollPeriod, originalData.length);
  var rollingData = [];
  var i, j, y, sum, num_ok;
  if (rollPeriod == 1) {
    return originalData;
  }
  for (i = 0; i < originalData.length; i++) {
    sum = 0;
    num_ok = 0;
    for (j = Math.max(0, i - rollPeriod + 1); j < i + 1; j++) {
      y = originalData[j][1];
      if (y === null || isNaN(y))
        continue;
      num_ok++;
      sum += originalData[j][1];
    }
    if (num_ok) {
      rollingData[i] = [originalData[i][0], sum / num_ok];
    } else {
      rollingData[i] = [originalData[i][0], null];
    }
  }
  return rollingData;
};
DefaultHandler.prototype.getExtremeYValues = function getExtremeYValues(series, dateWindow, stepPlot) {
  var minY = null, maxY = null, y;
  var firstIdx = 0, lastIdx = series.length - 1;
  for (var j = firstIdx; j <= lastIdx; j++) {
    y = series[j][1];
    if (y === null || isNaN(y))
      continue;
    if (maxY === null || y > maxY) {
      maxY = y;
    }
    if (minY === null || y < minY) {
      minY = y;
    }
  }
  return [minY, maxY];
};
var default_default = DefaultHandler;

// ../../node_modules/dygraphs/src/datahandler/bars.js
var BarsHandler = function() {
  datahandler_default.call(this);
};
BarsHandler.prototype = new datahandler_default();
BarsHandler.prototype.extractSeries = function(rawData, seriesIndex, options) {
};
BarsHandler.prototype.rollingAverage = function(series, rollPeriod, options, seriesIndex) {
};
BarsHandler.prototype.onPointsCreated_ = function(series, points) {
  for (var i = 0; i < series.length; ++i) {
    var item = series[i];
    var point = points[i];
    point.y_top = NaN;
    point.y_bottom = NaN;
    point.yval_minus = datahandler_default.parseFloat(item[2][0]);
    point.yval_plus = datahandler_default.parseFloat(item[2][1]);
  }
};
BarsHandler.prototype.getExtremeYValues = function(series, dateWindow, stepPlot) {
  var minY = null, maxY = null, y;
  var firstIdx = 0;
  var lastIdx = series.length - 1;
  for (var j = firstIdx; j <= lastIdx; j++) {
    y = series[j][1];
    if (y === null || isNaN(y)) continue;
    var low = series[j][2][0];
    var high = series[j][2][1];
    if (low > y) low = y;
    if (high < y) high = y;
    if (maxY === null || high > maxY) maxY = high;
    if (minY === null || low < minY) minY = low;
  }
  return [minY, maxY];
};
BarsHandler.prototype.onLineEvaluated = function(points, axis, logscale) {
  var point;
  for (var j = 0; j < points.length; j++) {
    point = points[j];
    point.y_top = dygraph_layout_default.calcYNormal_(axis, point.yval_minus, logscale);
    point.y_bottom = dygraph_layout_default.calcYNormal_(axis, point.yval_plus, logscale);
  }
};
var bars_default = BarsHandler;

// ../../node_modules/dygraphs/src/datahandler/bars-error.js
var ErrorBarsHandler = function() {
};
ErrorBarsHandler.prototype = new bars_default();
ErrorBarsHandler.prototype.extractSeries = function(rawData, i, options) {
  var series = [];
  var x, y, variance, point;
  const seriesLabel = options.get("labels")[i];
  const logScale = options.getForSeries("logscale", seriesLabel);
  const sigma = options.getForSeries("sigma", seriesLabel);
  for (var j = 0; j < rawData.length; j++) {
    x = rawData[j][0];
    point = rawData[j][i];
    if (logScale && point !== null) {
      if (point[0] <= 0 || point[0] - sigma * point[1] <= 0) {
        point = null;
      }
    }
    if (point !== null) {
      y = point[0];
      if (y !== null && !isNaN(y)) {
        variance = sigma * point[1];
        series.push([x, y, [y - variance, y + variance, point[1]]]);
      } else {
        series.push([x, y, [y, y, y]]);
      }
    } else {
      series.push([x, null, [null, null, null]]);
    }
  }
  return series;
};
ErrorBarsHandler.prototype.rollingAverage = function(originalData, rollPeriod, options, i) {
  rollPeriod = Math.min(rollPeriod, originalData.length);
  var rollingData = [];
  const seriesLabel = options.get("labels")[i];
  const sigma = options.getForSeries("sigma", seriesLabel);
  var i, j, y, v, sum, num_ok, stddev, variance, value;
  for (i = 0; i < originalData.length; i++) {
    sum = 0;
    variance = 0;
    num_ok = 0;
    for (j = Math.max(0, i - rollPeriod + 1); j < i + 1; j++) {
      y = originalData[j][1];
      if (y === null || isNaN(y))
        continue;
      num_ok++;
      sum += y;
      variance += Math.pow(originalData[j][2][2], 2);
    }
    if (num_ok) {
      stddev = Math.sqrt(variance) / num_ok;
      value = sum / num_ok;
      rollingData[i] = [
        originalData[i][0],
        value,
        [value - sigma * stddev, value + sigma * stddev]
      ];
    } else {
      v = rollPeriod == 1 ? originalData[i][1] : null;
      rollingData[i] = [originalData[i][0], v, [v, v]];
    }
  }
  return rollingData;
};
var bars_error_default = ErrorBarsHandler;

// ../../node_modules/dygraphs/src/datahandler/bars-custom.js
var CustomBarsHandler = function() {
};
CustomBarsHandler.prototype = new bars_default();
CustomBarsHandler.prototype.extractSeries = function(rawData, i, options) {
  var series = [];
  var x, y, point;
  const seriesLabel = options.get("labels")[i];
  const logScale = options.getForSeries("logscale", seriesLabel);
  for (var j = 0; j < rawData.length; j++) {
    x = rawData[j][0];
    point = rawData[j][i];
    if (logScale && point !== null) {
      if (point[0] <= 0 || point[1] <= 0 || point[2] <= 0) {
        point = null;
      }
    }
    if (point !== null) {
      y = point[1];
      if (y !== null && !isNaN(y)) {
        series.push([x, y, [point[0], point[2]]]);
      } else {
        series.push([x, y, [y, y]]);
      }
    } else {
      series.push([x, null, [null, null]]);
    }
  }
  return series;
};
CustomBarsHandler.prototype.rollingAverage = function(originalData, rollPeriod, options, i) {
  rollPeriod = Math.min(rollPeriod, originalData.length);
  var rollingData = [];
  var y, low, high, mid, count, i, extremes;
  low = 0;
  mid = 0;
  high = 0;
  count = 0;
  for (i = 0; i < originalData.length; i++) {
    y = originalData[i][1];
    extremes = originalData[i][2];
    rollingData[i] = originalData[i];
    if (y !== null && !isNaN(y)) {
      low += extremes[0];
      mid += y;
      high += extremes[1];
      count += 1;
    }
    if (i - rollPeriod >= 0) {
      var prev = originalData[i - rollPeriod];
      if (prev[1] !== null && !isNaN(prev[1])) {
        low -= prev[2][0];
        mid -= prev[1];
        high -= prev[2][1];
        count -= 1;
      }
    }
    if (count) {
      rollingData[i] = [
        originalData[i][0],
        1 * mid / count,
        [
          1 * low / count,
          1 * high / count
        ]
      ];
    } else {
      rollingData[i] = [originalData[i][0], null, [null, null]];
    }
  }
  return rollingData;
};
var bars_custom_default = CustomBarsHandler;

// ../../node_modules/dygraphs/src/datahandler/default-fractions.js
var DefaultFractionHandler = function() {
};
DefaultFractionHandler.prototype = new default_default();
DefaultFractionHandler.prototype.extractSeries = function(rawData, i, options) {
  var series = [];
  var x, y, point, num, den, value;
  var mult = 100;
  const seriesLabel = options.get("labels")[i];
  const logScale = options.getForSeries("logscale", seriesLabel);
  for (var j = 0; j < rawData.length; j++) {
    x = rawData[j][0];
    point = rawData[j][i];
    if (logScale && point !== null) {
      if (point[0] <= 0 || point[1] <= 0) {
        point = null;
      }
    }
    if (point !== null) {
      num = point[0];
      den = point[1];
      if (num !== null && !isNaN(num)) {
        value = den ? num / den : 0;
        y = mult * value;
        series.push([x, y, [num, den]]);
      } else {
        series.push([x, num, [num, den]]);
      }
    } else {
      series.push([x, null, [null, null]]);
    }
  }
  return series;
};
DefaultFractionHandler.prototype.rollingAverage = function(originalData, rollPeriod, options, i) {
  rollPeriod = Math.min(rollPeriod, originalData.length);
  var rollingData = [];
  var i;
  var num = 0;
  var den = 0;
  var mult = 100;
  for (i = 0; i < originalData.length; i++) {
    num += originalData[i][2][0];
    den += originalData[i][2][1];
    if (i - rollPeriod >= 0) {
      num -= originalData[i - rollPeriod][2][0];
      den -= originalData[i - rollPeriod][2][1];
    }
    var date = originalData[i][0];
    var value = den ? num / den : 0;
    rollingData[i] = [date, mult * value];
  }
  return rollingData;
};
var default_fractions_default = DefaultFractionHandler;

// ../../node_modules/dygraphs/src/datahandler/bars-fractions.js
var FractionsBarsHandler = function() {
};
FractionsBarsHandler.prototype = new bars_default();
FractionsBarsHandler.prototype.extractSeries = function(rawData, i, options) {
  var series = [];
  var x, y, point, num, den, value, stddev, variance;
  var mult = 100;
  const seriesLabel = options.get("labels")[i];
  const logScale = options.getForSeries("logscale", seriesLabel);
  const sigma = options.getForSeries("sigma", seriesLabel);
  for (var j = 0; j < rawData.length; j++) {
    x = rawData[j][0];
    point = rawData[j][i];
    if (logScale && point !== null) {
      if (point[0] <= 0 || point[1] <= 0) {
        point = null;
      }
    }
    if (point !== null) {
      num = point[0];
      den = point[1];
      if (num !== null && !isNaN(num)) {
        value = den ? num / den : 0;
        stddev = den ? sigma * Math.sqrt(value * (1 - value) / den) : 1;
        variance = mult * stddev;
        y = mult * value;
        series.push([x, y, [y - variance, y + variance, num, den]]);
      } else {
        series.push([x, num, [num, num, num, den]]);
      }
    } else {
      series.push([x, null, [null, null, null, null]]);
    }
  }
  return series;
};
FractionsBarsHandler.prototype.rollingAverage = function(originalData, rollPeriod, options, i) {
  rollPeriod = Math.min(rollPeriod, originalData.length);
  var rollingData = [];
  const seriesLabel = options.get("labels")[i];
  const sigma = options.getForSeries("sigma", seriesLabel);
  const wilsonInterval = options.getForSeries("wilsonInterval", seriesLabel);
  var low, high, i, stddev;
  var num = 0;
  var den = 0;
  var mult = 100;
  for (i = 0; i < originalData.length; i++) {
    num += originalData[i][2][2];
    den += originalData[i][2][3];
    if (i - rollPeriod >= 0) {
      num -= originalData[i - rollPeriod][2][2];
      den -= originalData[i - rollPeriod][2][3];
    }
    var date = originalData[i][0];
    var value = den ? num / den : 0;
    if (wilsonInterval) {
      if (den) {
        var p = value < 0 ? 0 : value, n = den;
        var pm = sigma * Math.sqrt(p * (1 - p) / n + sigma * sigma / (4 * n * n));
        var denom = 1 + sigma * sigma / den;
        low = (p + sigma * sigma / (2 * den) - pm) / denom;
        high = (p + sigma * sigma / (2 * den) + pm) / denom;
        rollingData[i] = [
          date,
          p * mult,
          [low * mult, high * mult]
        ];
      } else {
        rollingData[i] = [date, 0, [0, 0]];
      }
    } else {
      stddev = den ? sigma * Math.sqrt(value * (1 - value) / den) : 1;
      rollingData[i] = [
        date,
        mult * value,
        [mult * (value - stddev), mult * (value + stddev)]
      ];
    }
  }
  return rollingData;
};
var bars_fractions_default = FractionsBarsHandler;

// ../../node_modules/dygraphs/src/plugins/annotations.js
var annotations = function() {
  this.annotations_ = [];
};
annotations.prototype.toString = function() {
  return "Annotations Plugin";
};
annotations.prototype.activate = function(g) {
  return {
    clearChart: this.clearChart,
    didDrawChart: this.didDrawChart
  };
};
annotations.prototype.detachLabels = function() {
  for (var i = 0; i < this.annotations_.length; i++) {
    var a = this.annotations_[i];
    if (a.parentNode) a.parentNode.removeChild(a);
    this.annotations_[i] = null;
  }
  this.annotations_ = [];
};
annotations.prototype.clearChart = function(e) {
  this.detachLabels();
};
annotations.prototype.didDrawChart = function(e) {
  var g = e.dygraph;
  var points = g.layout_.annotated_points;
  if (!points || points.length === 0) return;
  var containerDiv = e.canvas.parentNode;
  var bindEvt = function(eventName, classEventName, pt) {
    return function(annotation_event) {
      var a2 = pt.annotation;
      if (a2.hasOwnProperty(eventName)) {
        a2[eventName](a2, pt, g, annotation_event);
      } else if (g.getOption(classEventName)) {
        g.getOption(classEventName)(a2, pt, g, annotation_event);
      }
    };
  };
  var area = e.dygraph.getArea();
  var xToUsedHeight = {};
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    if (p.canvasx < area.x || p.canvasx > area.x + area.w || p.canvasy < area.y || p.canvasy > area.y + area.h) {
      continue;
    }
    var a = p.annotation;
    var tick_height = 6;
    if (a.hasOwnProperty("tickHeight")) {
      tick_height = a.tickHeight;
    }
    var div = document.createElement("div");
    div.style["fontSize"] = g.getOption("axisLabelFontSize") + "px";
    var className = "dygraph-annotation";
    if (!a.hasOwnProperty("icon")) {
      className += " dygraphDefaultAnnotation dygraph-default-annotation";
    }
    if (a.hasOwnProperty("cssClass")) {
      className += " " + a.cssClass;
    }
    div.className = className;
    var width = a.hasOwnProperty("width") ? a.width : 16;
    var height = a.hasOwnProperty("height") ? a.height : 16;
    if (a.hasOwnProperty("icon")) {
      var img = document.createElement("img");
      img.src = a.icon;
      img.width = width;
      img.height = height;
      div.appendChild(img);
    } else if (p.annotation.hasOwnProperty("shortText")) {
      div.appendChild(document.createTextNode(p.annotation.shortText));
    }
    var left = p.canvasx - width / 2;
    div.style.left = left + "px";
    var divTop = 0;
    if (a.attachAtBottom) {
      var y = area.y + area.h - height - tick_height;
      if (xToUsedHeight[left]) {
        y -= xToUsedHeight[left];
      } else {
        xToUsedHeight[left] = 0;
      }
      xToUsedHeight[left] += tick_height + height;
      divTop = y;
    } else {
      divTop = p.canvasy - height - tick_height;
    }
    div.style.top = divTop + "px";
    div.style.width = width + "px";
    div.style.height = height + "px";
    div.title = p.annotation.text;
    div.style.color = g.colorsMap_[p.name];
    div.style.borderColor = g.colorsMap_[p.name];
    a.div = div;
    g.addAndTrackEvent(
      div,
      "click",
      bindEvt("clickHandler", "annotationClickHandler", p, this)
    );
    g.addAndTrackEvent(
      div,
      "mouseover",
      bindEvt("mouseOverHandler", "annotationMouseOverHandler", p, this)
    );
    g.addAndTrackEvent(
      div,
      "mouseout",
      bindEvt("mouseOutHandler", "annotationMouseOutHandler", p, this)
    );
    g.addAndTrackEvent(
      div,
      "dblclick",
      bindEvt("dblClickHandler", "annotationDblClickHandler", p, this)
    );
    containerDiv.appendChild(div);
    this.annotations_.push(div);
    var ctx = e.drawingContext;
    ctx.save();
    ctx.strokeStyle = a.hasOwnProperty("tickColor") ? a.tickColor : g.colorsMap_[p.name];
    ctx.lineWidth = a.hasOwnProperty("tickWidth") ? a.tickWidth : g.getOption("strokeWidth");
    ctx.beginPath();
    if (!a.attachAtBottom) {
      ctx.moveTo(p.canvasx, p.canvasy);
      ctx.lineTo(p.canvasx, p.canvasy - 2 - tick_height);
    } else {
      var y = divTop + height;
      ctx.moveTo(p.canvasx, y);
      ctx.lineTo(p.canvasx, y + tick_height);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
};
annotations.prototype.destroy = function() {
  this.detachLabels();
};
var annotations_default = annotations;

// ../../node_modules/dygraphs/src/plugins/axes.js
var axes = function() {
  this.xlabels_ = [];
  this.ylabels_ = [];
};
axes.prototype.toString = function() {
  return "Axes Plugin";
};
axes.prototype.activate = function(g) {
  return {
    layout: this.layout,
    clearChart: this.clearChart,
    willDrawChart: this.willDrawChart
  };
};
axes.prototype.layout = function(e) {
  var g = e.dygraph;
  if (g.getOptionForAxis("drawAxis", "y")) {
    var w = g.getOptionForAxis("axisLabelWidth", "y") + 2 * g.getOptionForAxis("axisTickSize", "y");
    e.reserveSpaceLeft(w);
  }
  if (g.getOptionForAxis("drawAxis", "x")) {
    var h;
    if (g.getOption("xAxisHeight")) {
      h = g.getOption("xAxisHeight");
    } else {
      h = g.getOptionForAxis("axisLabelFontSize", "x") + 2 * g.getOptionForAxis("axisTickSize", "x");
    }
    e.reserveSpaceBottom(h);
  }
  if (g.numAxes() == 2) {
    if (g.getOptionForAxis("drawAxis", "y2")) {
      var w = g.getOptionForAxis("axisLabelWidth", "y2") + 2 * g.getOptionForAxis("axisTickSize", "y2");
      e.reserveSpaceRight(w);
    }
  } else if (g.numAxes() > 2) {
    g.error("Only two y-axes are supported at this time. (Trying to use " + g.numAxes() + ")");
  }
};
axes.prototype.detachLabels = function() {
  function removeArray(ary) {
    for (var i = 0; i < ary.length; i++) {
      var el = ary[i];
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  }
  removeArray(this.xlabels_);
  removeArray(this.ylabels_);
  this.xlabels_ = [];
  this.ylabels_ = [];
};
axes.prototype.clearChart = function(e) {
  this.detachLabels();
};
axes.prototype.willDrawChart = function(e) {
  var g = e.dygraph;
  if (!g.getOptionForAxis("drawAxis", "x") && !g.getOptionForAxis("drawAxis", "y") && !g.getOptionForAxis("drawAxis", "y2")) {
    return;
  }
  function halfUp(x2) {
    return Math.round(x2) + 0.5;
  }
  function halfDown(y2) {
    return Math.round(y2) - 0.5;
  }
  var context = e.drawingContext;
  var containerDiv = e.canvas.parentNode;
  var canvasWidth = g.width_;
  var canvasHeight = g.height_;
  var label, x, y, tick, i;
  var makeLabelStyle = function(axis) {
    return {
      position: "absolute",
      fontSize: g.getOptionForAxis("axisLabelFontSize", axis) + "px",
      width: g.getOptionForAxis("axisLabelWidth", axis) + "px"
    };
  };
  var labelStyles = {
    x: makeLabelStyle("x"),
    y: makeLabelStyle("y"),
    y2: makeLabelStyle("y2")
  };
  var makeDiv = function(txt, axis, prec_axis) {
    var div = document.createElement("div");
    var labelStyle = labelStyles[prec_axis == "y2" ? "y2" : axis];
    update(div.style, labelStyle);
    var inner_div = document.createElement("div");
    inner_div.className = "dygraph-axis-label dygraph-axis-label-" + axis + (prec_axis ? " dygraph-axis-label-" + prec_axis : "");
    inner_div.innerHTML = txt;
    div.appendChild(inner_div);
    return div;
  };
  context.save();
  var layout = g.layout_;
  var area = e.dygraph.plotter_.area;
  var makeOptionGetter = function(axis) {
    return function(option) {
      return g.getOptionForAxis(option, axis);
    };
  };
  const that = this;
  if (g.getOptionForAxis("drawAxis", "y") || g.numAxes() == 2 && g.getOptionForAxis("drawAxis", "y2")) {
    if (layout.yticks && layout.yticks.length > 0) {
      var num_axes = g.numAxes();
      var getOptions = [makeOptionGetter("y"), makeOptionGetter("y2")];
      layout.yticks.forEach(function(tick2) {
        if (tick2.label === void 0) return;
        x = area.x;
        var sgn = 1;
        var prec_axis = "y1";
        var getAxisOption2 = getOptions[0];
        if (tick2.axis == 1) {
          x = area.x + area.w;
          sgn = -1;
          prec_axis = "y2";
          getAxisOption2 = getOptions[1];
        }
        if (!getAxisOption2("drawAxis")) return;
        var fontSize = getAxisOption2("axisLabelFontSize");
        y = area.y + tick2.pos * area.h;
        label = makeDiv(tick2.label, "y", num_axes == 2 ? prec_axis : null);
        var top = y - fontSize / 2;
        if (top < 0) top = 0;
        if (top + fontSize + 3 > canvasHeight) {
          label.style.bottom = "0";
        } else {
          label.style.top = Math.min(top, canvasHeight - 2 * fontSize) + "px";
        }
        if (tick2.axis === 0) {
          label.style.left = area.x - getAxisOption2("axisLabelWidth") - getAxisOption2("axisTickSize") + "px";
          label.style.textAlign = "right";
        } else if (tick2.axis == 1) {
          label.style.left = area.x + area.w + getAxisOption2("axisTickSize") + "px";
          label.style.textAlign = "left";
        }
        label.style.width = getAxisOption2("axisLabelWidth") + "px";
        containerDiv.appendChild(label);
        that.ylabels_.push(label);
      });
    }
    var axisX;
    if (g.getOption("drawAxesAtZero")) {
      var r = g.toPercentXCoord(0);
      if (r > 1 || r < 0 || isNaN(r)) r = 0;
      axisX = halfUp(area.x + r * area.w);
    } else {
      axisX = halfUp(area.x);
    }
    context.strokeStyle = g.getOptionForAxis("axisLineColor", "y");
    context.lineWidth = g.getOptionForAxis("axisLineWidth", "y");
    context.beginPath();
    context.moveTo(axisX, halfDown(area.y));
    context.lineTo(axisX, halfDown(area.y + area.h));
    context.closePath();
    context.stroke();
    if (g.numAxes() == 2 && g.getOptionForAxis("drawAxis", "y2")) {
      context.strokeStyle = g.getOptionForAxis("axisLineColor", "y2");
      context.lineWidth = g.getOptionForAxis("axisLineWidth", "y2");
      context.beginPath();
      context.moveTo(halfDown(area.x + area.w), halfDown(area.y));
      context.lineTo(halfDown(area.x + area.w), halfDown(area.y + area.h));
      context.closePath();
      context.stroke();
    }
  }
  if (g.getOptionForAxis("drawAxis", "x")) {
    if (layout.xticks) {
      var getAxisOption = makeOptionGetter("x");
      layout.xticks.forEach(function(tick2) {
        if (tick2.label === void 0) return;
        x = area.x + tick2.pos * area.w;
        y = area.y + area.h;
        label = makeDiv(tick2.label, "x");
        label.style.textAlign = "center";
        label.style.top = y + getAxisOption("axisTickSize") + "px";
        var left = x - getAxisOption("axisLabelWidth") / 2;
        if (left + getAxisOption("axisLabelWidth") > canvasWidth) {
          left = canvasWidth - getAxisOption("axisLabelWidth");
          label.style.textAlign = "right";
        }
        if (left < 0) {
          left = 0;
          label.style.textAlign = "left";
        }
        label.style.left = left + "px";
        label.style.width = getAxisOption("axisLabelWidth") + "px";
        containerDiv.appendChild(label);
        that.xlabels_.push(label);
      });
    }
    context.strokeStyle = g.getOptionForAxis("axisLineColor", "x");
    context.lineWidth = g.getOptionForAxis("axisLineWidth", "x");
    context.beginPath();
    var axisY;
    if (g.getOption("drawAxesAtZero")) {
      var r = g.toPercentYCoord(0, 0);
      if (r > 1 || r < 0) r = 1;
      axisY = halfDown(area.y + r * area.h);
    } else {
      axisY = halfDown(area.y + area.h);
    }
    context.moveTo(halfUp(area.x), axisY);
    context.lineTo(halfUp(area.x + area.w), axisY);
    context.closePath();
    context.stroke();
  }
  context.restore();
};
var axes_default = axes;

// ../../node_modules/dygraphs/src/plugins/chart-labels.js
var chart_labels = function() {
  this.title_div_ = null;
  this.xlabel_div_ = null;
  this.ylabel_div_ = null;
  this.y2label_div_ = null;
};
chart_labels.prototype.toString = function() {
  return "ChartLabels Plugin";
};
chart_labels.prototype.activate = function(g) {
  return {
    layout: this.layout,
    // clearChart: this.clearChart,
    didDrawChart: this.didDrawChart
  };
};
var createDivInRect = function(r) {
  var div = document.createElement("div");
  div.style.position = "absolute";
  div.style.left = r.x + "px";
  div.style.top = r.y + "px";
  div.style.width = r.w + "px";
  div.style.height = r.h + "px";
  return div;
};
chart_labels.prototype.detachLabels_ = function() {
  var els = [
    this.title_div_,
    this.xlabel_div_,
    this.ylabel_div_,
    this.y2label_div_
  ];
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (!el) continue;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
  this.title_div_ = null;
  this.xlabel_div_ = null;
  this.ylabel_div_ = null;
  this.y2label_div_ = null;
};
var createRotatedDiv = function(g, box, axis, classes, html) {
  var div = document.createElement("div");
  div.style.position = "absolute";
  if (axis == 1) {
    div.style.left = "0px";
  } else {
    div.style.left = box.x + "px";
  }
  div.style.top = box.y + "px";
  div.style.width = box.w + "px";
  div.style.height = box.h + "px";
  div.style.fontSize = g.getOption("yLabelWidth") - 2 + "px";
  var inner_div = document.createElement("div");
  inner_div.style.position = "absolute";
  inner_div.style.width = box.h + "px";
  inner_div.style.height = box.w + "px";
  inner_div.style.top = box.h / 2 - box.w / 2 + "px";
  inner_div.style.left = box.w / 2 - box.h / 2 + "px";
  inner_div.className = "dygraph-label-rotate-" + (axis == 1 ? "right" : "left");
  var class_div = document.createElement("div");
  class_div.className = classes;
  class_div.innerHTML = html;
  inner_div.appendChild(class_div);
  div.appendChild(inner_div);
  return div;
};
chart_labels.prototype.layout = function(e) {
  this.detachLabels_();
  var g = e.dygraph;
  var div = e.chart_div;
  if (g.getOption("title")) {
    var title_rect = e.reserveSpaceTop(g.getOption("titleHeight"));
    this.title_div_ = createDivInRect(title_rect);
    this.title_div_.style.fontSize = g.getOption("titleHeight") - 8 + "px";
    var class_div = document.createElement("div");
    class_div.className = "dygraph-label dygraph-title";
    class_div.innerHTML = g.getOption("title");
    this.title_div_.appendChild(class_div);
    div.appendChild(this.title_div_);
  }
  if (g.getOption("xlabel")) {
    var x_rect = e.reserveSpaceBottom(g.getOption("xLabelHeight"));
    this.xlabel_div_ = createDivInRect(x_rect);
    this.xlabel_div_.style.fontSize = g.getOption("xLabelHeight") - 2 + "px";
    var class_div = document.createElement("div");
    class_div.className = "dygraph-label dygraph-xlabel";
    class_div.innerHTML = g.getOption("xlabel");
    this.xlabel_div_.appendChild(class_div);
    div.appendChild(this.xlabel_div_);
  }
  if (g.getOption("ylabel")) {
    var y_rect = e.reserveSpaceLeft(0);
    this.ylabel_div_ = createRotatedDiv(
      g,
      y_rect,
      1,
      // primary (left) y-axis
      "dygraph-label dygraph-ylabel",
      g.getOption("ylabel")
    );
    div.appendChild(this.ylabel_div_);
  }
  if (g.getOption("y2label") && g.numAxes() == 2) {
    var y2_rect = e.reserveSpaceRight(0);
    this.y2label_div_ = createRotatedDiv(
      g,
      y2_rect,
      2,
      // secondary (right) y-axis
      "dygraph-label dygraph-y2label",
      g.getOption("y2label")
    );
    div.appendChild(this.y2label_div_);
  }
};
chart_labels.prototype.didDrawChart = function(e) {
  var g = e.dygraph;
  if (this.title_div_) {
    this.title_div_.children[0].innerHTML = g.getOption("title");
  }
  if (this.xlabel_div_) {
    this.xlabel_div_.children[0].innerHTML = g.getOption("xlabel");
  }
  if (this.ylabel_div_) {
    this.ylabel_div_.children[0].children[0].innerHTML = g.getOption("ylabel");
  }
  if (this.y2label_div_) {
    this.y2label_div_.children[0].children[0].innerHTML = g.getOption("y2label");
  }
};
chart_labels.prototype.clearChart = function() {
};
chart_labels.prototype.destroy = function() {
  this.detachLabels_();
};
var chart_labels_default = chart_labels;

// ../../node_modules/dygraphs/src/plugins/grid.js
var grid = function() {
};
grid.prototype.toString = function() {
  return "Gridline Plugin";
};
grid.prototype.activate = function(g) {
  return {
    willDrawChart: this.willDrawChart
  };
};
grid.prototype.willDrawChart = function(e) {
  var g = e.dygraph;
  var ctx = e.drawingContext;
  var layout = g.layout_;
  var area = e.dygraph.plotter_.area;
  function halfUp(x2) {
    return Math.round(x2) + 0.5;
  }
  function halfDown(y2) {
    return Math.round(y2) - 0.5;
  }
  var x, y, i, ticks;
  if (g.getOptionForAxis("drawGrid", "y")) {
    var axes2 = ["y", "y2"];
    var strokeStyles = [], lineWidths = [], drawGrid = [], stroking = [], strokePattern = [];
    for (var i = 0; i < axes2.length; i++) {
      drawGrid[i] = g.getOptionForAxis("drawGrid", axes2[i]);
      if (drawGrid[i]) {
        strokeStyles[i] = g.getOptionForAxis("gridLineColor", axes2[i]);
        lineWidths[i] = g.getOptionForAxis("gridLineWidth", axes2[i]);
        strokePattern[i] = g.getOptionForAxis("gridLinePattern", axes2[i]);
        stroking[i] = strokePattern[i] && strokePattern[i].length >= 2;
      }
    }
    ticks = layout.yticks;
    ctx.save();
    ticks.forEach((tick) => {
      if (!tick.has_tick) return;
      var axis = tick.axis;
      if (drawGrid[axis]) {
        ctx.save();
        if (stroking[axis]) {
          if (ctx.setLineDash) ctx.setLineDash(strokePattern[axis]);
        }
        ctx.strokeStyle = strokeStyles[axis];
        ctx.lineWidth = lineWidths[axis];
        x = halfUp(area.x);
        y = halfDown(area.y + tick.pos * area.h);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + area.w, y);
        ctx.stroke();
        ctx.restore();
      }
    });
    ctx.restore();
  }
  if (g.getOptionForAxis("drawGrid", "x")) {
    ticks = layout.xticks;
    ctx.save();
    var strokePattern = g.getOptionForAxis("gridLinePattern", "x");
    var stroking = strokePattern && strokePattern.length >= 2;
    if (stroking) {
      if (ctx.setLineDash) ctx.setLineDash(strokePattern);
    }
    ctx.strokeStyle = g.getOptionForAxis("gridLineColor", "x");
    ctx.lineWidth = g.getOptionForAxis("gridLineWidth", "x");
    ticks.forEach((tick) => {
      if (!tick.has_tick) return;
      x = halfUp(area.x + tick.pos * area.w);
      y = halfDown(area.y + area.h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, area.y);
      ctx.stroke();
    });
    if (stroking) {
      if (ctx.setLineDash) ctx.setLineDash([]);
    }
    ctx.restore();
  }
};
grid.prototype.destroy = function() {
};
var grid_default = grid;

// ../../node_modules/dygraphs/src/plugins/legend.js
var Legend = function() {
  this.legend_div_ = null;
  this.is_generated_div_ = false;
};
Legend.prototype.toString = function() {
  return "Legend Plugin";
};
Legend.prototype.activate = function(g) {
  var div;
  var userLabelsDiv = g.getOption("labelsDiv");
  if (userLabelsDiv && null !== userLabelsDiv) {
    if (typeof userLabelsDiv == "string" || userLabelsDiv instanceof String) {
      div = document.getElementById(userLabelsDiv);
    } else {
      div = userLabelsDiv;
    }
  } else {
    div = document.createElement("div");
    div.className = "dygraph-legend";
    g.graphDiv.appendChild(div);
    this.is_generated_div_ = true;
  }
  this.legend_div_ = div;
  this.one_em_width_ = 10;
  return {
    select: this.select,
    deselect: this.deselect,
    // TODO(danvk): rethink the name "predraw" before we commit to it in any API.
    predraw: this.predraw,
    didDrawChart: this.didDrawChart
  };
};
var calculateEmWidthInDiv = function(div) {
  var sizeSpan = document.createElement("span");
  sizeSpan.setAttribute("style", "margin: 0; padding: 0 0 0 1em; border: 0;");
  div.appendChild(sizeSpan);
  var oneEmWidth = sizeSpan.offsetWidth;
  div.removeChild(sizeSpan);
  return oneEmWidth;
};
var escapeHTML = function(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&#34;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};
Legend.prototype.select = function(e) {
  var xValue = e.selectedX;
  var points = e.selectedPoints;
  var row = e.selectedRow;
  var legendMode = e.dygraph.getOption("legend");
  if (legendMode === "never") {
    this.legend_div_.style.display = "none";
    return;
  }
  var html = Legend.generateLegendHTML(e.dygraph, xValue, points, this.one_em_width_, row);
  if (html instanceof Node && html.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    this.legend_div_.innerHTML = "";
    this.legend_div_.appendChild(html);
  } else
    this.legend_div_.innerHTML = html;
  this.legend_div_.style.display = "";
  if (legendMode === "follow") {
    var area = e.dygraph.plotter_.area;
    var labelsDivWidth = this.legend_div_.offsetWidth;
    var yAxisLabelWidth = e.dygraph.getOptionForAxis("axisLabelWidth", "y");
    var highlightSeries = e.dygraph.getHighlightSeries();
    var point;
    if (highlightSeries) {
      point = points.find((p) => p.name === highlightSeries);
      if (!point)
        point = points[0];
    } else
      point = points[0];
    const followOffsetX = e.dygraph.getNumericOption("legendFollowOffsetX");
    const followOffsetY = e.dygraph.getNumericOption("legendFollowOffsetY");
    var leftLegend = point.x * area.w + followOffsetX;
    var topLegend = point.y * area.h + followOffsetY;
    if (leftLegend + labelsDivWidth + 1 > area.w) {
      leftLegend = leftLegend - 2 * followOffsetX - labelsDivWidth - (yAxisLabelWidth - area.x);
    }
    this.legend_div_.style.left = yAxisLabelWidth + leftLegend + "px";
    this.legend_div_.style.top = topLegend + "px";
  } else if (legendMode === "onmouseover" && this.is_generated_div_) {
    var area = e.dygraph.plotter_.area;
    var labelsDivWidth = this.legend_div_.offsetWidth;
    this.legend_div_.style.left = area.x + area.w - labelsDivWidth - 1 + "px";
    this.legend_div_.style.top = area.y + "px";
  }
};
Legend.prototype.deselect = function(e) {
  var legendMode = e.dygraph.getOption("legend");
  if (legendMode !== "always") {
    this.legend_div_.style.display = "none";
  }
  var oneEmWidth = calculateEmWidthInDiv(this.legend_div_);
  this.one_em_width_ = oneEmWidth;
  var html = Legend.generateLegendHTML(e.dygraph, void 0, void 0, oneEmWidth, null);
  if (html instanceof Node && html.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    this.legend_div_.innerHTML = "";
    this.legend_div_.appendChild(html);
  } else
    this.legend_div_.innerHTML = html;
};
Legend.prototype.didDrawChart = function(e) {
  this.deselect(e);
};
Legend.prototype.predraw = function(e) {
  if (!this.is_generated_div_) return;
  e.dygraph.graphDiv.appendChild(this.legend_div_);
  var area = e.dygraph.plotter_.area;
  var labelsDivWidth = this.legend_div_.offsetWidth;
  this.legend_div_.style.left = area.x + area.w - labelsDivWidth - 1 + "px";
  this.legend_div_.style.top = area.y + "px";
};
Legend.prototype.destroy = function() {
  this.legend_div_ = null;
};
Legend.generateLegendHTML = function(g, x, sel_points, oneEmWidth, row) {
  var data = {
    dygraph: g,
    x,
    i: row,
    series: []
  };
  var labelToSeries = {};
  var labels = g.getLabels();
  if (labels) {
    for (var i = 1; i < labels.length; i++) {
      var series = g.getPropertiesForSeries(labels[i]);
      var strokePattern = g.getOption("strokePattern", labels[i]);
      var seriesData = {
        dashHTML: generateLegendDashHTML(strokePattern, series.color, oneEmWidth),
        label: labels[i],
        labelHTML: escapeHTML(labels[i]),
        isVisible: series.visible,
        color: series.color
      };
      data.series.push(seriesData);
      labelToSeries[labels[i]] = seriesData;
    }
  }
  if (typeof x !== "undefined") {
    var xOptView = g.optionsViewForAxis_("x");
    var xvf = xOptView("valueFormatter");
    data.xHTML = xvf.call(g, x, xOptView, labels[0], g, row, 0);
    var yOptViews = [];
    var num_axes = g.numAxes();
    for (var i = 0; i < num_axes; i++) {
      yOptViews[i] = g.optionsViewForAxis_("y" + (i ? 1 + i : ""));
    }
    var showZeros = g.getOption("labelsShowZeroValues");
    var highlightSeries = g.getHighlightSeries();
    for (i = 0; i < sel_points.length; i++) {
      var pt = sel_points[i];
      var seriesData = labelToSeries[pt.name];
      seriesData.y = pt.yval;
      if (pt.yval === 0 && !showZeros || isNaN(pt.canvasy)) {
        seriesData.isVisible = false;
        continue;
      }
      var series = g.getPropertiesForSeries(pt.name);
      var yOptView = yOptViews[series.axis - 1];
      var fmtFunc = yOptView("valueFormatter");
      var yHTML = fmtFunc.call(g, pt.yval, yOptView, pt.name, g, row, labels.indexOf(pt.name));
      update(seriesData, { yHTML });
      if (pt.name == highlightSeries) {
        seriesData.isHighlighted = true;
      }
    }
  }
  var formatter = g.getOption("legendFormatter") || Legend.defaultFormatter;
  return formatter.call(g, data);
};
Legend.defaultFormatter = function(data) {
  var g = data.dygraph;
  if (g.getOption("showLabelsOnHighlight") !== true) return "";
  var sepLines = g.getOption("labelsSeparateLines");
  var html;
  if (typeof data.x === "undefined") {
    if (g.getOption("legend") != "always") {
      return "";
    }
    html = "";
    for (var i = 0; i < data.series.length; i++) {
      var series = data.series[i];
      if (!series.isVisible) continue;
      if (html !== "") html += sepLines ? "<br />" : " ";
      html += `<span style='font-weight: bold; color: ${series.color};'>${series.dashHTML} ${series.labelHTML}</span>`;
    }
    return html;
  }
  html = data.xHTML + ":";
  for (var i = 0; i < data.series.length; i++) {
    var series = data.series[i];
    if (!series.y && !series.yHTML) continue;
    if (!series.isVisible) continue;
    if (sepLines) html += "<br>";
    var cls = series.isHighlighted ? ' class="highlight"' : "";
    html += `<span${cls}> <b><span style='color: ${series.color};'>${series.labelHTML}</span></b>:&#160;${series.yHTML}</span>`;
  }
  return html;
};
function generateLegendDashHTML(strokePattern, color, oneEmWidth) {
  if (!strokePattern || strokePattern.length <= 1) {
    return `<div class="dygraph-legend-line" style="border-bottom-color: ${color};"></div>`;
  }
  var i, j, paddingLeft, marginRight;
  var strokePixelLength = 0, segmentLoop = 0;
  var normalizedPattern = [];
  var loop;
  for (i = 0; i <= strokePattern.length; i++) {
    strokePixelLength += strokePattern[i % strokePattern.length];
  }
  loop = Math.floor(oneEmWidth / (strokePixelLength - strokePattern[0]));
  if (loop > 1) {
    for (i = 0; i < strokePattern.length; i++) {
      normalizedPattern[i] = strokePattern[i] / oneEmWidth;
    }
    segmentLoop = normalizedPattern.length;
  } else {
    loop = 1;
    for (i = 0; i < strokePattern.length; i++) {
      normalizedPattern[i] = strokePattern[i] / strokePixelLength;
    }
    segmentLoop = normalizedPattern.length + 1;
  }
  var dash = "";
  for (j = 0; j < loop; j++) {
    for (i = 0; i < segmentLoop; i += 2) {
      paddingLeft = normalizedPattern[i % normalizedPattern.length];
      if (i < strokePattern.length) {
        marginRight = normalizedPattern[(i + 1) % normalizedPattern.length];
      } else {
        marginRight = 0;
      }
      dash += `<div class="dygraph-legend-dash" style="margin-right: ${marginRight}em; padding-left: ${paddingLeft}em;"></div>`;
    }
  }
  return dash;
}
var legend_default = Legend;

// ../../node_modules/dygraphs/src/plugins/range-selector.js
var rangeSelector = function() {
  this.hasTouchInterface_ = typeof TouchEvent != "undefined";
  this.isMobileDevice_ = /mobile|android/gi.test(navigator.appVersion);
  this.interfaceCreated_ = false;
};
rangeSelector.prototype.toString = function() {
  return "RangeSelector Plugin";
};
rangeSelector.prototype.activate = function(dygraph) {
  this.dygraph_ = dygraph;
  if (this.getOption_("showRangeSelector")) {
    this.createInterface_();
  }
  return {
    layout: this.reserveSpace_,
    predraw: this.renderStaticLayer_,
    didDrawChart: this.renderInteractiveLayer_
  };
};
rangeSelector.prototype.destroy = function() {
  this.bgcanvas_ = null;
  this.fgcanvas_ = null;
  this.leftZoomHandle_ = null;
  this.rightZoomHandle_ = null;
};
rangeSelector.prototype.getOption_ = function(name, opt_series) {
  return this.dygraph_.getOption(name, opt_series);
};
rangeSelector.prototype.setDefaultOption_ = function(name, value) {
  this.dygraph_.attrs_[name] = value;
};
rangeSelector.prototype.createInterface_ = function() {
  this.createCanvases_();
  this.createZoomHandles_();
  this.initInteraction_();
  if (this.getOption_("animatedZooms")) {
    console.warn("Animated zooms and range selector are not compatible; disabling animatedZooms.");
    this.dygraph_.updateOptions({ animatedZooms: false }, true);
  }
  this.interfaceCreated_ = true;
  this.addToGraph_();
};
rangeSelector.prototype.addToGraph_ = function() {
  var graphDiv = this.graphDiv_ = this.dygraph_.graphDiv;
  graphDiv.appendChild(this.bgcanvas_);
  graphDiv.appendChild(this.fgcanvas_);
  graphDiv.appendChild(this.leftZoomHandle_);
  graphDiv.appendChild(this.rightZoomHandle_);
};
rangeSelector.prototype.removeFromGraph_ = function() {
  var graphDiv = this.graphDiv_;
  graphDiv.removeChild(this.bgcanvas_);
  graphDiv.removeChild(this.fgcanvas_);
  graphDiv.removeChild(this.leftZoomHandle_);
  graphDiv.removeChild(this.rightZoomHandle_);
  this.graphDiv_ = null;
};
rangeSelector.prototype.reserveSpace_ = function(e) {
  if (this.getOption_("showRangeSelector")) {
    e.reserveSpaceBottom(this.getOption_("rangeSelectorHeight") + 4);
  }
};
rangeSelector.prototype.renderStaticLayer_ = function() {
  if (!this.updateVisibility_()) {
    return;
  }
  this.resize_();
  this.drawStaticLayer_();
};
rangeSelector.prototype.renderInteractiveLayer_ = function() {
  if (!this.updateVisibility_() || this.isChangingRange_) {
    return;
  }
  this.placeZoomHandles_();
  this.drawInteractiveLayer_();
};
rangeSelector.prototype.updateVisibility_ = function() {
  var enabled = this.getOption_("showRangeSelector");
  if (enabled) {
    if (!this.interfaceCreated_) {
      this.createInterface_();
    } else if (!this.graphDiv_ || !this.graphDiv_.parentNode) {
      this.addToGraph_();
    }
  } else if (this.graphDiv_) {
    this.removeFromGraph_();
    var dygraph = this.dygraph_;
    setTimeout(function() {
      dygraph.width_ = 0;
      dygraph.resize();
    }, 1);
  }
  return enabled;
};
rangeSelector.prototype.resize_ = function() {
  function setElementRect(canvas, context, rect, pixelRatioOption2) {
    var canvasScale = pixelRatioOption2 || getContextPixelRatio(context);
    canvas.style.top = rect.y + "px";
    canvas.style.left = rect.x + "px";
    canvas.width = rect.w * canvasScale;
    canvas.height = rect.h * canvasScale;
    canvas.style.width = rect.w + "px";
    canvas.style.height = rect.h + "px";
    if (canvasScale != 1) {
      context.scale(canvasScale, canvasScale);
    }
  }
  var plotArea = this.dygraph_.layout_.getPlotArea();
  var xAxisLabelHeight = 0;
  if (this.dygraph_.getOptionForAxis("drawAxis", "x")) {
    xAxisLabelHeight = this.getOption_("xAxisHeight") || this.getOption_("axisLabelFontSize") + 2 * this.getOption_("axisTickSize");
  }
  this.canvasRect_ = {
    x: plotArea.x,
    y: plotArea.y + plotArea.h + xAxisLabelHeight + 4,
    w: plotArea.w,
    h: this.getOption_("rangeSelectorHeight")
  };
  var pixelRatioOption = this.dygraph_.getNumericOption("pixelRatio");
  setElementRect(this.bgcanvas_, this.bgcanvas_ctx_, this.canvasRect_, pixelRatioOption);
  setElementRect(this.fgcanvas_, this.fgcanvas_ctx_, this.canvasRect_, pixelRatioOption);
};
rangeSelector.prototype.createCanvases_ = function() {
  this.bgcanvas_ = createCanvas();
  this.bgcanvas_.className = "dygraph-rangesel-bgcanvas";
  this.bgcanvas_.style.position = "absolute";
  this.bgcanvas_.style.zIndex = 9;
  this.bgcanvas_ctx_ = getContext(this.bgcanvas_);
  this.fgcanvas_ = createCanvas();
  this.fgcanvas_.className = "dygraph-rangesel-fgcanvas";
  this.fgcanvas_.style.position = "absolute";
  this.fgcanvas_.style.zIndex = 9;
  this.fgcanvas_.style.cursor = "default";
  this.fgcanvas_ctx_ = getContext(this.fgcanvas_);
};
rangeSelector.prototype.createZoomHandles_ = function() {
  var img = new Image();
  img.className = "dygraph-rangesel-zoomhandle";
  img.style.position = "absolute";
  img.style.zIndex = 10;
  img.style.visibility = "hidden";
  img.style.cursor = "col-resize";
  img.width = 9;
  img.height = 16;
  img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAQCAYAAADESFVDAAAAAXNSR0IArs4c6QAAAAZiS0dEANAAzwDP4Z7KegAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAAd0SU1FB9sHGw0cMqdt1UwAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAAAaElEQVQoz+3SsRFAQBCF4Z9WJM8KCDVwownl6YXsTmCUsyKGkZzcl7zkz3YLkypgAnreFmDEpHkIwVOMfpdi9CEEN2nGpFdwD03yEqDtOgCaun7sqSTDH32I1pQA2Pb9sZecAxc5r3IAb21d6878xsAAAAAASUVORK5CYII=";
  if (this.isMobileDevice_) {
    img.width *= 2;
    img.height *= 2;
  }
  this.leftZoomHandle_ = img;
  this.rightZoomHandle_ = img.cloneNode(false);
};
rangeSelector.prototype.initInteraction_ = function() {
  var self = this;
  var topElem = document;
  var clientXLast = 0;
  var handle = null;
  var isZooming = false;
  var isPanning = false;
  var dynamic = !this.isMobileDevice_;
  var tarp = new iframe_tarp_default();
  var toXDataWindow, onZoomStart, onZoom, onZoomEnd, doZoom, isMouseInPanZone, onPanStart, onPan, onPanEnd, doPan, onCanvasHover;
  var onZoomHandleTouchEvent, onCanvasTouchEvent, addTouchEvents;
  toXDataWindow = function(zoomHandleStatus) {
    var xDataLimits = self.dygraph_.xAxisExtremes();
    var fact = (xDataLimits[1] - xDataLimits[0]) / self.canvasRect_.w;
    var xDataMin = xDataLimits[0] + (zoomHandleStatus.leftHandlePos - self.canvasRect_.x) * fact;
    var xDataMax = xDataLimits[0] + (zoomHandleStatus.rightHandlePos - self.canvasRect_.x) * fact;
    return [xDataMin, xDataMax];
  };
  onZoomStart = function(e) {
    cancelEvent(e);
    isZooming = true;
    clientXLast = e.clientX;
    handle = e.target ? e.target : e.srcElement;
    if (e.type === "mousedown" || e.type === "dragstart") {
      addEvent(topElem, "mousemove", onZoom);
      addEvent(topElem, "mouseup", onZoomEnd);
    }
    self.fgcanvas_.style.cursor = "col-resize";
    tarp.cover();
    return true;
  };
  onZoom = function(e) {
    if (!isZooming) {
      return false;
    }
    cancelEvent(e);
    var delX = e.clientX - clientXLast;
    if (Math.abs(delX) < 4) {
      return true;
    }
    clientXLast = e.clientX;
    var zoomHandleStatus = self.getZoomHandleStatus_();
    var newPos;
    if (handle == self.leftZoomHandle_) {
      newPos = zoomHandleStatus.leftHandlePos + delX;
      newPos = Math.min(newPos, zoomHandleStatus.rightHandlePos - handle.width - 3);
      newPos = Math.max(newPos, self.canvasRect_.x);
    } else {
      newPos = zoomHandleStatus.rightHandlePos + delX;
      newPos = Math.min(newPos, self.canvasRect_.x + self.canvasRect_.w);
      newPos = Math.max(newPos, zoomHandleStatus.leftHandlePos + handle.width + 3);
    }
    var halfHandleWidth = handle.width / 2;
    handle.style.left = newPos - halfHandleWidth + "px";
    self.drawInteractiveLayer_();
    if (dynamic) {
      doZoom();
    }
    return true;
  };
  onZoomEnd = function(e) {
    if (!isZooming) {
      return false;
    }
    isZooming = false;
    tarp.uncover();
    removeEvent(topElem, "mousemove", onZoom);
    removeEvent(topElem, "mouseup", onZoomEnd);
    self.fgcanvas_.style.cursor = "default";
    if (!dynamic) {
      doZoom();
    }
    return true;
  };
  doZoom = function() {
    try {
      var zoomHandleStatus = self.getZoomHandleStatus_();
      self.isChangingRange_ = true;
      if (!zoomHandleStatus.isZoomed) {
        self.dygraph_.resetZoom();
      } else {
        var xDataWindow = toXDataWindow(zoomHandleStatus);
        self.dygraph_.doZoomXDates_(xDataWindow[0], xDataWindow[1]);
      }
    } finally {
      self.isChangingRange_ = false;
    }
  };
  isMouseInPanZone = function(e) {
    var rect = self.leftZoomHandle_.getBoundingClientRect();
    var leftHandleClientX = rect.left + rect.width / 2;
    rect = self.rightZoomHandle_.getBoundingClientRect();
    var rightHandleClientX = rect.left + rect.width / 2;
    return e.clientX > leftHandleClientX && e.clientX < rightHandleClientX;
  };
  onPanStart = function(e) {
    if (!isPanning && isMouseInPanZone(e) && self.getZoomHandleStatus_().isZoomed) {
      cancelEvent(e);
      isPanning = true;
      clientXLast = e.clientX;
      if (e.type === "mousedown") {
        addEvent(topElem, "mousemove", onPan);
        addEvent(topElem, "mouseup", onPanEnd);
      }
      return true;
    }
    return false;
  };
  onPan = function(e) {
    if (!isPanning) {
      return false;
    }
    cancelEvent(e);
    var delX = e.clientX - clientXLast;
    if (Math.abs(delX) < 4) {
      return true;
    }
    clientXLast = e.clientX;
    var zoomHandleStatus = self.getZoomHandleStatus_();
    var leftHandlePos = zoomHandleStatus.leftHandlePos;
    var rightHandlePos = zoomHandleStatus.rightHandlePos;
    var rangeSize = rightHandlePos - leftHandlePos;
    if (leftHandlePos + delX <= self.canvasRect_.x) {
      leftHandlePos = self.canvasRect_.x;
      rightHandlePos = leftHandlePos + rangeSize;
    } else if (rightHandlePos + delX >= self.canvasRect_.x + self.canvasRect_.w) {
      rightHandlePos = self.canvasRect_.x + self.canvasRect_.w;
      leftHandlePos = rightHandlePos - rangeSize;
    } else {
      leftHandlePos += delX;
      rightHandlePos += delX;
    }
    var halfHandleWidth = self.leftZoomHandle_.width / 2;
    self.leftZoomHandle_.style.left = leftHandlePos - halfHandleWidth + "px";
    self.rightZoomHandle_.style.left = rightHandlePos - halfHandleWidth + "px";
    self.drawInteractiveLayer_();
    if (dynamic) {
      doPan();
    }
    return true;
  };
  onPanEnd = function(e) {
    if (!isPanning) {
      return false;
    }
    isPanning = false;
    removeEvent(topElem, "mousemove", onPan);
    removeEvent(topElem, "mouseup", onPanEnd);
    if (!dynamic) {
      doPan();
    }
    return true;
  };
  doPan = function() {
    try {
      self.isChangingRange_ = true;
      self.dygraph_.dateWindow_ = toXDataWindow(self.getZoomHandleStatus_());
      self.dygraph_.drawGraph_(false);
    } finally {
      self.isChangingRange_ = false;
    }
  };
  onCanvasHover = function(e) {
    if (isZooming || isPanning) {
      return;
    }
    var cursor = isMouseInPanZone(e) ? "move" : "default";
    if (cursor != self.fgcanvas_.style.cursor) {
      self.fgcanvas_.style.cursor = cursor;
    }
  };
  onZoomHandleTouchEvent = function(e) {
    if (e.type == "touchstart" && e.targetTouches.length == 1) {
      if (onZoomStart(e.targetTouches[0])) {
        cancelEvent(e);
      }
    } else if (e.type == "touchmove" && e.targetTouches.length == 1) {
      if (onZoom(e.targetTouches[0])) {
        cancelEvent(e);
      }
    } else {
      onZoomEnd(e);
    }
  };
  onCanvasTouchEvent = function(e) {
    if (e.type == "touchstart" && e.targetTouches.length == 1) {
      if (onPanStart(e.targetTouches[0])) {
        cancelEvent(e);
      }
    } else if (e.type == "touchmove" && e.targetTouches.length == 1) {
      if (onPan(e.targetTouches[0])) {
        cancelEvent(e);
      }
    } else {
      onPanEnd(e);
    }
  };
  addTouchEvents = function(elem, fn) {
    var types = ["touchstart", "touchend", "touchmove", "touchcancel"];
    for (var i = 0; i < types.length; i++) {
      self.dygraph_.addAndTrackEvent(elem, types[i], fn);
    }
  };
  this.setDefaultOption_("interactionModel", dygraph_interaction_model_default.dragIsPanInteractionModel);
  this.setDefaultOption_("panEdgeFraction", 1e-4);
  var dragStartEvent = window.opera ? "mousedown" : "dragstart";
  this.dygraph_.addAndTrackEvent(this.leftZoomHandle_, dragStartEvent, onZoomStart);
  this.dygraph_.addAndTrackEvent(this.rightZoomHandle_, dragStartEvent, onZoomStart);
  this.dygraph_.addAndTrackEvent(this.fgcanvas_, "mousedown", onPanStart);
  this.dygraph_.addAndTrackEvent(this.fgcanvas_, "mousemove", onCanvasHover);
  if (this.hasTouchInterface_) {
    addTouchEvents(this.leftZoomHandle_, onZoomHandleTouchEvent);
    addTouchEvents(this.rightZoomHandle_, onZoomHandleTouchEvent);
    addTouchEvents(this.fgcanvas_, onCanvasTouchEvent);
  }
};
rangeSelector.prototype.drawStaticLayer_ = function() {
  var ctx = this.bgcanvas_ctx_;
  ctx.clearRect(0, 0, this.canvasRect_.w, this.canvasRect_.h);
  try {
    this.drawMiniPlot_();
  } catch (ex) {
    console.warn(ex);
  }
  var margin = 0.5;
  this.bgcanvas_ctx_.lineWidth = this.getOption_("rangeSelectorBackgroundLineWidth");
  ctx.strokeStyle = this.getOption_("rangeSelectorBackgroundStrokeColor");
  ctx.beginPath();
  ctx.moveTo(margin, margin);
  ctx.lineTo(margin, this.canvasRect_.h - margin);
  ctx.lineTo(this.canvasRect_.w - margin, this.canvasRect_.h - margin);
  ctx.lineTo(this.canvasRect_.w - margin, margin);
  ctx.stroke();
};
rangeSelector.prototype.drawMiniPlot_ = function() {
  var fillStyle = this.getOption_("rangeSelectorPlotFillColor");
  var fillGradientStyle = this.getOption_("rangeSelectorPlotFillGradientColor");
  var strokeStyle = this.getOption_("rangeSelectorPlotStrokeColor");
  if (!fillStyle && !strokeStyle) {
    return;
  }
  var stepPlot = this.getOption_("stepPlot");
  var combinedSeriesData = this.computeCombinedSeriesAndLimits_();
  var yRange = combinedSeriesData.yMax - combinedSeriesData.yMin;
  var ctx = this.bgcanvas_ctx_;
  var margin = 0.5;
  var xExtremes = this.dygraph_.xAxisExtremes();
  var xRange = Math.max(xExtremes[1] - xExtremes[0], 1e-30);
  var xFact = (this.canvasRect_.w - margin) / xRange;
  var yFact = (this.canvasRect_.h - margin) / yRange;
  var canvasWidth = this.canvasRect_.w - margin;
  var canvasHeight = this.canvasRect_.h - margin;
  var prevX = null, prevY = null;
  ctx.beginPath();
  ctx.moveTo(margin, canvasHeight);
  for (var i = 0; i < combinedSeriesData.data.length; i++) {
    var dataPoint = combinedSeriesData.data[i];
    var x = dataPoint[0] !== null ? (dataPoint[0] - xExtremes[0]) * xFact : NaN;
    var y = dataPoint[1] !== null ? canvasHeight - (dataPoint[1] - combinedSeriesData.yMin) * yFact : NaN;
    if (!stepPlot && prevX !== null && Math.round(x) == Math.round(prevX)) {
      continue;
    }
    if (isFinite(x) && isFinite(y)) {
      if (prevX === null) {
        ctx.lineTo(x, canvasHeight);
      } else if (stepPlot) {
        ctx.lineTo(x, prevY);
      }
      ctx.lineTo(x, y);
      prevX = x;
      prevY = y;
    } else {
      if (prevX !== null) {
        if (stepPlot) {
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, canvasHeight);
        } else {
          ctx.lineTo(prevX, canvasHeight);
        }
      }
      prevX = prevY = null;
    }
  }
  ctx.lineTo(canvasWidth, canvasHeight);
  ctx.closePath();
  if (fillStyle) {
    var lingrad = this.bgcanvas_ctx_.createLinearGradient(0, 0, 0, canvasHeight);
    if (fillGradientStyle) {
      lingrad.addColorStop(0, fillGradientStyle);
    }
    lingrad.addColorStop(1, fillStyle);
    this.bgcanvas_ctx_.fillStyle = lingrad;
    ctx.fill();
  }
  if (strokeStyle) {
    this.bgcanvas_ctx_.strokeStyle = strokeStyle;
    this.bgcanvas_ctx_.lineWidth = this.getOption_("rangeSelectorPlotLineWidth");
    ctx.stroke();
  }
};
rangeSelector.prototype.computeCombinedSeriesAndLimits_ = function() {
  var g = this.dygraph_;
  var logscale = this.getOption_("logscale");
  var i;
  var numColumns = g.numColumns();
  var labels = g.getLabels();
  var includeSeries = new Array(numColumns);
  var anySet = false;
  var visibility = g.visibility();
  var inclusion = [];
  for (i = 1; i < numColumns; i++) {
    var include = this.getOption_("showInRangeSelector", labels[i]);
    inclusion.push(include);
    if (include !== null) anySet = true;
  }
  if (anySet) {
    for (i = 1; i < numColumns; i++) {
      includeSeries[i] = inclusion[i - 1];
    }
  } else {
    for (i = 1; i < numColumns; i++) {
      includeSeries[i] = visibility[i - 1];
    }
  }
  var rolledSeries = [];
  var dataHandler = g.dataHandler_;
  var options = g.attributes_;
  for (i = 1; i < g.numColumns(); i++) {
    if (!includeSeries[i]) continue;
    var series = dataHandler.extractSeries(g.rawData_, i, options);
    if (g.rollPeriod() > 1) {
      series = dataHandler.rollingAverage(series, g.rollPeriod(), options, i);
    }
    rolledSeries.push(series);
  }
  var combinedSeries = [];
  for (i = 0; i < rolledSeries[0].length; i++) {
    var sum = 0;
    var count = 0;
    for (var j = 0; j < rolledSeries.length; j++) {
      var y = rolledSeries[j][i][1];
      if (y === null || isNaN(y)) continue;
      count++;
      sum += y;
    }
    combinedSeries.push([rolledSeries[0][i][0], sum / count]);
  }
  var yMin = Number.MAX_VALUE;
  var yMax = -Number.MAX_VALUE;
  for (i = 0; i < combinedSeries.length; i++) {
    var yVal = combinedSeries[i][1];
    if (yVal !== null && isFinite(yVal) && (!logscale || yVal > 0)) {
      yMin = Math.min(yMin, yVal);
      yMax = Math.max(yMax, yVal);
    }
  }
  var extraPercent = 0.25;
  if (logscale) {
    yMax = log10(yMax);
    yMax += yMax * extraPercent;
    yMin = log10(yMin);
    for (i = 0; i < combinedSeries.length; i++) {
      combinedSeries[i][1] = log10(combinedSeries[i][1]);
    }
  } else {
    var yExtra;
    var yRange = yMax - yMin;
    if (yRange <= Number.MIN_VALUE) {
      yExtra = yMax * extraPercent;
    } else {
      yExtra = yRange * extraPercent;
    }
    yMax += yExtra;
    yMin -= yExtra;
  }
  return { data: combinedSeries, yMin, yMax };
};
rangeSelector.prototype.placeZoomHandles_ = function() {
  var xExtremes = this.dygraph_.xAxisExtremes();
  var xWindowLimits = this.dygraph_.xAxisRange();
  var xRange = xExtremes[1] - xExtremes[0];
  var leftPercent = Math.max(0, (xWindowLimits[0] - xExtremes[0]) / xRange);
  var rightPercent = Math.max(0, (xExtremes[1] - xWindowLimits[1]) / xRange);
  var leftCoord = this.canvasRect_.x + this.canvasRect_.w * leftPercent;
  var rightCoord = this.canvasRect_.x + this.canvasRect_.w * (1 - rightPercent);
  var handleTop = Math.max(this.canvasRect_.y, this.canvasRect_.y + (this.canvasRect_.h - this.leftZoomHandle_.height) / 2);
  var halfHandleWidth = this.leftZoomHandle_.width / 2;
  this.leftZoomHandle_.style.left = leftCoord - halfHandleWidth + "px";
  this.leftZoomHandle_.style.top = handleTop + "px";
  this.rightZoomHandle_.style.left = rightCoord - halfHandleWidth + "px";
  this.rightZoomHandle_.style.top = this.leftZoomHandle_.style.top;
  this.leftZoomHandle_.style.visibility = "visible";
  this.rightZoomHandle_.style.visibility = "visible";
};
rangeSelector.prototype.drawInteractiveLayer_ = function() {
  var ctx = this.fgcanvas_ctx_;
  ctx.clearRect(0, 0, this.canvasRect_.w, this.canvasRect_.h);
  var margin = 1;
  var width = this.canvasRect_.w - margin;
  var height = this.canvasRect_.h - margin;
  var zoomHandleStatus = this.getZoomHandleStatus_();
  ctx.strokeStyle = this.getOption_("rangeSelectorForegroundStrokeColor");
  ctx.lineWidth = this.getOption_("rangeSelectorForegroundLineWidth");
  if (!zoomHandleStatus.isZoomed) {
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(margin, height);
    ctx.lineTo(width, height);
    ctx.lineTo(width, margin);
    ctx.stroke();
  } else {
    var leftHandleCanvasPos = Math.max(margin, zoomHandleStatus.leftHandlePos - this.canvasRect_.x);
    var rightHandleCanvasPos = Math.min(width, zoomHandleStatus.rightHandlePos - this.canvasRect_.x);
    const veilColour = this.getOption_("rangeSelectorVeilColour");
    ctx.fillStyle = veilColour ? veilColour : "rgba(240, 240, 240, " + this.getOption_("rangeSelectorAlpha").toString() + ")";
    ctx.fillRect(0, 0, leftHandleCanvasPos, this.canvasRect_.h);
    ctx.fillRect(rightHandleCanvasPos, 0, this.canvasRect_.w - rightHandleCanvasPos, this.canvasRect_.h);
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(leftHandleCanvasPos, margin);
    ctx.lineTo(leftHandleCanvasPos, height);
    ctx.lineTo(rightHandleCanvasPos, height);
    ctx.lineTo(rightHandleCanvasPos, margin);
    ctx.lineTo(width, margin);
    ctx.stroke();
  }
};
rangeSelector.prototype.getZoomHandleStatus_ = function() {
  var halfHandleWidth = this.leftZoomHandle_.width / 2;
  var leftHandlePos = parseFloat(this.leftZoomHandle_.style.left) + halfHandleWidth;
  var rightHandlePos = parseFloat(this.rightZoomHandle_.style.left) + halfHandleWidth;
  return {
    leftHandlePos,
    rightHandlePos,
    isZoomed: leftHandlePos - 1 > this.canvasRect_.x || rightHandlePos + 1 < this.canvasRect_.x + this.canvasRect_.w
  };
};
var range_selector_default = rangeSelector;

// ../../node_modules/dygraphs/src/dygraph-gviz.js
var GVizChart = function(container) {
  this.container = container;
};
GVizChart.prototype.draw = function(data, options) {
  this.container.innerHTML = "";
  if (typeof this.date_graph != "undefined") {
    this.date_graph.destroy();
  }
  this.date_graph = new dygraph_default(this.container, data, options);
};
GVizChart.prototype.setSelection = function(selection_array) {
  var row = false;
  if (selection_array.length) {
    row = selection_array[0].row;
  }
  this.date_graph.setSelection(row);
};
GVizChart.prototype.getSelection = function() {
  var selection = [];
  var row = this.date_graph.getSelection();
  if (row < 0) return selection;
  var points = this.date_graph.layout_.points;
  for (var setIdx = 0; setIdx < points.length; ++setIdx) {
    selection.push({ row, column: setIdx + 1 });
  }
  return selection;
};
var dygraph_gviz_default = GVizChart;

// ../../node_modules/dygraphs/src/dygraph.js
var Dygraph = function Dygraph2(div, data, opts) {
  this.__init__(div, data, opts);
};
Dygraph.NAME = "Dygraph";
Dygraph.VERSION = "2.2.1";
var _addrequire = {};
Dygraph._require = function require2(what) {
  return what in _addrequire ? _addrequire[what] : Dygraph._require._b(what);
};
Dygraph._require._b = null;
Dygraph._require.add = function add(what, towhat) {
  _addrequire[what] = towhat;
};
Dygraph.DEFAULT_ROLL_PERIOD = 1;
Dygraph.DEFAULT_WIDTH = 480;
Dygraph.DEFAULT_HEIGHT = 320;
Dygraph.ANIMATION_STEPS = 12;
Dygraph.ANIMATION_DURATION = 200;
Dygraph.Plotters = dygraph_canvas_default._Plotters;
Dygraph.addedAnnotationCSS = false;
Dygraph.prototype.__init__ = function(div, file, attrs) {
  this.is_initial_draw_ = true;
  this.readyFns_ = [];
  if (attrs === null || attrs === void 0) {
    attrs = {};
  }
  attrs = Dygraph.copyUserAttrs_(attrs);
  if (typeof div == "string") {
    div = document.getElementById(div);
  }
  if (!div) {
    throw new Error("Constructing dygraph with a non-existent div!");
  }
  this.maindiv_ = div;
  this.file_ = file;
  this.rollPeriod_ = attrs.rollPeriod || Dygraph.DEFAULT_ROLL_PERIOD;
  this.previousVerticalX_ = -1;
  this.fractions_ = attrs.fractions || false;
  this.dateWindow_ = attrs.dateWindow || null;
  this.annotations_ = [];
  div.innerHTML = "";
  const resolved = window.getComputedStyle(div, null);
  if (resolved.paddingLeft !== "0px" || resolved.paddingRight !== "0px" || resolved.paddingTop !== "0px" || resolved.paddingBottom !== "0px")
    console.error("Main div contains padding; graph will misbehave");
  if (div.style.width === "" && attrs.width) {
    div.style.width = attrs.width + "px";
  }
  if (div.style.height === "" && attrs.height) {
    div.style.height = attrs.height + "px";
  }
  if (div.style.height === "" && div.clientHeight === 0) {
    div.style.height = Dygraph.DEFAULT_HEIGHT + "px";
    if (div.style.width === "") {
      div.style.width = Dygraph.DEFAULT_WIDTH + "px";
    }
  }
  this.width_ = div.clientWidth || attrs.width || 0;
  this.height_ = div.clientHeight || attrs.height || 0;
  if (attrs.stackedGraph) {
    attrs.fillGraph = true;
  }
  this.user_attrs_ = {};
  update(this.user_attrs_, attrs);
  this.attrs_ = {};
  updateDeep(this.attrs_, dygraph_default_attrs_default);
  this.boundaryIds_ = [];
  this.setIndexByName_ = {};
  this.datasetIndex_ = [];
  this.registeredEvents_ = [];
  this.eventListeners_ = {};
  this.attributes_ = new dygraph_options_default(this);
  this.createInterface_();
  this.plugins_ = [];
  var plugins = Dygraph.PLUGINS.concat(this.getOption("plugins"));
  for (var i = 0; i < plugins.length; i++) {
    var Plugin = plugins[i];
    var pluginInstance;
    if (typeof Plugin.activate !== "undefined") {
      pluginInstance = Plugin;
    } else {
      pluginInstance = new Plugin();
    }
    var pluginDict = {
      plugin: pluginInstance,
      events: {},
      options: {},
      pluginOptions: {}
    };
    var handlers = pluginInstance.activate(this);
    for (var eventName in handlers) {
      if (!handlers.hasOwnProperty(eventName)) continue;
      pluginDict.events[eventName] = handlers[eventName];
    }
    this.plugins_.push(pluginDict);
  }
  for (var i = 0; i < this.plugins_.length; i++) {
    var plugin_dict = this.plugins_[i];
    for (var eventName in plugin_dict.events) {
      if (!plugin_dict.events.hasOwnProperty(eventName)) continue;
      var callback = plugin_dict.events[eventName];
      var pair = [plugin_dict.plugin, callback];
      if (!(eventName in this.eventListeners_)) {
        this.eventListeners_[eventName] = [pair];
      } else {
        this.eventListeners_[eventName].push(pair);
      }
    }
  }
  this.createDragInterface_();
  this.start_();
};
Dygraph.prototype.cascadeEvents_ = function(name, extra_props) {
  if (!(name in this.eventListeners_)) return false;
  var e = {
    dygraph: this,
    cancelable: false,
    defaultPrevented: false,
    preventDefault: function() {
      if (!e.cancelable) throw "Cannot call preventDefault on non-cancelable event.";
      e.defaultPrevented = true;
    },
    propagationStopped: false,
    stopPropagation: function() {
      e.propagationStopped = true;
    }
  };
  update(e, extra_props);
  var callback_plugin_pairs = this.eventListeners_[name];
  if (callback_plugin_pairs) {
    for (var i = callback_plugin_pairs.length - 1; i >= 0; i--) {
      var plugin = callback_plugin_pairs[i][0];
      var callback = callback_plugin_pairs[i][1];
      callback.call(plugin, e);
      if (e.propagationStopped) break;
    }
  }
  return e.defaultPrevented;
};
Dygraph.prototype.getPluginInstance_ = function(type) {
  for (var i = 0; i < this.plugins_.length; i++) {
    var p = this.plugins_[i];
    if (p.plugin instanceof type) {
      return p.plugin;
    }
  }
  return null;
};
Dygraph.prototype.isZoomed = function(axis) {
  const isZoomedX = !!this.dateWindow_;
  if (axis === "x") return isZoomedX;
  const isZoomedY = this.axes_.map((axis2) => !!axis2.valueRange).indexOf(true) >= 0;
  if (axis === null || axis === void 0) {
    return isZoomedX || isZoomedY;
  }
  if (axis === "y") return isZoomedY;
  throw new Error(`axis parameter is [${axis}] must be null, 'x' or 'y'.`);
};
Dygraph.prototype.toString = function() {
  var maindiv = this.maindiv_;
  var id = maindiv && maindiv.id ? maindiv.id : maindiv;
  return "[Dygraph " + id + "]";
};
Dygraph.prototype.attr_ = function(name, seriesName) {
  if (typeof process !== "undefined" && true) {
    if (typeof dygraph_options_reference_default === "undefined") {
      console.error("Must include options reference JS for testing");
    } else if (!dygraph_options_reference_default.hasOwnProperty(name)) {
      console.error("Dygraphs is using property " + name + ", which has no entry in the Dygraphs.OPTIONS_REFERENCE listing.");
      dygraph_options_reference_default[name] = true;
    }
  }
  return seriesName ? this.attributes_.getForSeries(name, seriesName) : this.attributes_.get(name);
};
Dygraph.prototype.getOption = function(name, opt_seriesName) {
  return this.attr_(name, opt_seriesName);
};
Dygraph.prototype.getNumericOption = function(name, opt_seriesName) {
  return (
    /** @type{number} */
    this.getOption(name, opt_seriesName)
  );
};
Dygraph.prototype.getStringOption = function(name, opt_seriesName) {
  return (
    /** @type{string} */
    this.getOption(name, opt_seriesName)
  );
};
Dygraph.prototype.getBooleanOption = function(name, opt_seriesName) {
  return (
    /** @type{boolean} */
    this.getOption(name, opt_seriesName)
  );
};
Dygraph.prototype.getFunctionOption = function(name, opt_seriesName) {
  return (
    /** @type{function(...)} */
    this.getOption(name, opt_seriesName)
  );
};
Dygraph.prototype.getOptionForAxis = function(name, axis) {
  return this.attributes_.getForAxis(name, axis);
};
Dygraph.prototype.optionsViewForAxis_ = function(axis) {
  var self = this;
  return function(opt) {
    var axis_opts = self.user_attrs_.axes;
    if (axis_opts && axis_opts[axis] && axis_opts[axis].hasOwnProperty(opt)) {
      return axis_opts[axis][opt];
    }
    if (axis === "x" && opt === "logscale") {
      return false;
    }
    if (typeof self.user_attrs_[opt] != "undefined") {
      return self.user_attrs_[opt];
    }
    axis_opts = self.attrs_.axes;
    if (axis_opts && axis_opts[axis] && axis_opts[axis].hasOwnProperty(opt)) {
      return axis_opts[axis][opt];
    }
    if (axis == "y" && self.axes_[0].hasOwnProperty(opt)) {
      return self.axes_[0][opt];
    } else if (axis == "y2" && self.axes_[1].hasOwnProperty(opt)) {
      return self.axes_[1][opt];
    }
    return self.attr_(opt);
  };
};
Dygraph.prototype.rollPeriod = function() {
  return this.rollPeriod_;
};
Dygraph.prototype.xAxisRange = function() {
  return this.dateWindow_ ? this.dateWindow_ : this.xAxisExtremes();
};
Dygraph.prototype.xAxisExtremes = function() {
  var pad = this.getNumericOption("xRangePad") / this.plotter_.area.w;
  if (this.numRows() === 0) {
    return [0 - pad, 1 + pad];
  }
  var left = this.rawData_[0][0];
  var right = this.rawData_[this.rawData_.length - 1][0];
  if (pad) {
    var range = right - left;
    left -= range * pad;
    right += range * pad;
  }
  return [left, right];
};
Dygraph.prototype.yAxisExtremes = function() {
  const packed = this.gatherDatasets_(this.rolledSeries_, null);
  const { extremes } = packed;
  const saveAxes = this.axes_;
  this.computeYAxisRanges_(extremes);
  const newAxes = this.axes_;
  this.axes_ = saveAxes;
  return newAxes.map((axis) => axis.extremeRange);
};
Dygraph.prototype.yAxisRange = function(idx) {
  if (typeof idx == "undefined") idx = 0;
  if (idx < 0 || idx >= this.axes_.length) {
    return null;
  }
  var axis = this.axes_[idx];
  return [axis.computedValueRange[0], axis.computedValueRange[1]];
};
Dygraph.prototype.yAxisRanges = function() {
  var ret = [];
  for (var i = 0; i < this.axes_.length; i++) {
    ret.push(this.yAxisRange(i));
  }
  return ret;
};
Dygraph.prototype.toDomCoords = function(x, y, axis) {
  return [this.toDomXCoord(x), this.toDomYCoord(y, axis)];
};
Dygraph.prototype.toDomXCoord = function(x) {
  if (x === null) {
    return null;
  }
  var area = this.plotter_.area;
  var xRange = this.xAxisRange();
  return area.x + (x - xRange[0]) / (xRange[1] - xRange[0]) * area.w;
};
Dygraph.prototype.toDomYCoord = function(y, axis) {
  var pct = this.toPercentYCoord(y, axis);
  if (pct === null) {
    return null;
  }
  var area = this.plotter_.area;
  return area.y + pct * area.h;
};
Dygraph.prototype.toDataCoords = function(x, y, axis) {
  return [this.toDataXCoord(x), this.toDataYCoord(y, axis)];
};
Dygraph.prototype.toDataXCoord = function(x) {
  if (x === null) {
    return null;
  }
  var area = this.plotter_.area;
  var xRange = this.xAxisRange();
  if (!this.attributes_.getForAxis("logscale", "x")) {
    return xRange[0] + (x - area.x) / area.w * (xRange[1] - xRange[0]);
  } else {
    var pct = (x - area.x) / area.w;
    return logRangeFraction(xRange[0], xRange[1], pct);
  }
};
Dygraph.prototype.toDataYCoord = function(y, axis) {
  if (y === null) {
    return null;
  }
  var area = this.plotter_.area;
  var yRange = this.yAxisRange(axis);
  if (typeof axis == "undefined") axis = 0;
  if (!this.attributes_.getForAxis("logscale", axis)) {
    return yRange[0] + (area.y + area.h - y) / area.h * (yRange[1] - yRange[0]);
  } else {
    var pct = (y - area.y) / area.h;
    return logRangeFraction(yRange[1], yRange[0], pct);
  }
};
Dygraph.prototype.toPercentYCoord = function(y, axis) {
  if (y === null) {
    return null;
  }
  if (typeof axis == "undefined") axis = 0;
  var yRange = this.yAxisRange(axis);
  var pct;
  var logscale = this.attributes_.getForAxis("logscale", axis);
  if (logscale) {
    var logr0 = log10(yRange[0]);
    var logr1 = log10(yRange[1]);
    pct = (logr1 - log10(y)) / (logr1 - logr0);
  } else {
    pct = (yRange[1] - y) / (yRange[1] - yRange[0]);
  }
  return pct;
};
Dygraph.prototype.toPercentXCoord = function(x) {
  if (x === null) {
    return null;
  }
  var xRange = this.xAxisRange();
  var pct;
  var logscale = this.attributes_.getForAxis("logscale", "x");
  if (logscale === true) {
    var logr0 = log10(xRange[0]);
    var logr1 = log10(xRange[1]);
    pct = (log10(x) - logr0) / (logr1 - logr0);
  } else {
    pct = (x - xRange[0]) / (xRange[1] - xRange[0]);
  }
  return pct;
};
Dygraph.prototype.numColumns = function() {
  if (!this.rawData_) return 0;
  return this.rawData_[0] ? this.rawData_[0].length : this.attr_("labels").length;
};
Dygraph.prototype.numRows = function() {
  if (!this.rawData_) return 0;
  return this.rawData_.length;
};
Dygraph.prototype.getValue = function(row, col) {
  if (row < 0 || row >= this.rawData_.length) return null;
  if (col < 0 || col >= this.rawData_[row].length) return null;
  return this.rawData_[row][col];
};
Dygraph.prototype.createInterface_ = function() {
  var enclosing = this.maindiv_;
  this.graphDiv = document.createElement("div");
  this.graphDiv.style.textAlign = "left";
  this.graphDiv.style.position = "relative";
  enclosing.appendChild(this.graphDiv);
  this.canvas_ = createCanvas();
  this.canvas_.style.position = "absolute";
  this.canvas_.style.top = 0;
  this.canvas_.style.left = 0;
  this.hidden_ = this.createPlotKitCanvas_(this.canvas_);
  this.canvas_ctx_ = getContext(this.canvas_);
  this.hidden_ctx_ = getContext(this.hidden_);
  this.resizeElements_();
  this.graphDiv.appendChild(this.hidden_);
  this.graphDiv.appendChild(this.canvas_);
  this.mouseEventElement_ = this.createMouseEventElement_();
  this.layout_ = new dygraph_layout_default(this);
  var dygraph = this;
  this.mouseMoveHandler_ = function(e) {
    dygraph.mouseMove_(e);
  };
  this.mouseOutHandler_ = function(e) {
    var target = e.target || e.fromElement;
    var relatedTarget = e.relatedTarget || e.toElement;
    if (isNodeContainedBy(target, dygraph.graphDiv) && !isNodeContainedBy(relatedTarget, dygraph.graphDiv)) {
      dygraph.mouseOut_(e);
    }
  };
  this.addAndTrackEvent(window, "mouseout", this.mouseOutHandler_);
  this.addAndTrackEvent(this.mouseEventElement_, "mousemove", this.mouseMoveHandler_);
  if (!this.resizeHandler_) {
    this.resizeHandler_ = function(e) {
      dygraph.resize();
    };
    this.addAndTrackEvent(window, "resize", this.resizeHandler_);
    this.resizeObserver_ = null;
    var resizeMode = this.getStringOption("resizable");
    if (typeof ResizeObserver === "undefined" && resizeMode !== "no") {
      console.error("ResizeObserver unavailable; ignoring resizable property");
      resizeMode = "no";
    }
    if (resizeMode === "horizontal" || resizeMode === "vertical" || resizeMode === "both") {
      enclosing.style.resize = resizeMode;
    } else if (resizeMode !== "passive") {
      resizeMode = "no";
    }
    if (resizeMode !== "no") {
      const maindivOverflow = window.getComputedStyle(enclosing).overflow;
      if (window.getComputedStyle(enclosing).overflow === "visible")
        enclosing.style.overflow = "hidden";
      this.resizeObserver_ = new ResizeObserver(this.resizeHandler_);
      this.resizeObserver_.observe(enclosing);
    }
  }
};
Dygraph.prototype.resizeElements_ = function() {
  this.graphDiv.style.width = this.width_ + "px";
  this.graphDiv.style.height = this.height_ + "px";
  var pixelRatioOption = this.getNumericOption("pixelRatio");
  var canvasScale = pixelRatioOption || getContextPixelRatio(this.canvas_ctx_);
  this.canvas_.width = this.width_ * canvasScale;
  this.canvas_.height = this.height_ * canvasScale;
  this.canvas_.style.width = this.width_ + "px";
  this.canvas_.style.height = this.height_ + "px";
  if (canvasScale !== 1) {
    this.canvas_ctx_.scale(canvasScale, canvasScale);
  }
  var hiddenScale = pixelRatioOption || getContextPixelRatio(this.hidden_ctx_);
  this.hidden_.width = this.width_ * hiddenScale;
  this.hidden_.height = this.height_ * hiddenScale;
  this.hidden_.style.width = this.width_ + "px";
  this.hidden_.style.height = this.height_ + "px";
  if (hiddenScale !== 1) {
    this.hidden_ctx_.scale(hiddenScale, hiddenScale);
  }
};
Dygraph.prototype.destroy = function() {
  this.canvas_ctx_.restore();
  this.hidden_ctx_.restore();
  for (var i = this.plugins_.length - 1; i >= 0; i--) {
    var p = this.plugins_.pop();
    if (p.plugin.destroy) p.plugin.destroy();
  }
  var removeRecursive = function(node) {
    while (node.hasChildNodes()) {
      removeRecursive(node.firstChild);
      node.removeChild(node.firstChild);
    }
  };
  this.removeTrackedEvents_();
  removeEvent(window, "mouseout", this.mouseOutHandler_);
  removeEvent(this.mouseEventElement_, "mousemove", this.mouseMoveHandler_);
  if (this.resizeObserver_) {
    this.resizeObserver_.disconnect();
    this.resizeObserver_ = null;
  }
  removeEvent(window, "resize", this.resizeHandler_);
  this.resizeHandler_ = null;
  removeRecursive(this.maindiv_);
  var nullOut = function nullOut2(obj) {
    for (var n in obj) {
      if (typeof obj[n] === "object") {
        obj[n] = null;
      }
    }
  };
  nullOut(this.layout_);
  nullOut(this.plotter_);
  nullOut(this);
};
Dygraph.prototype.createPlotKitCanvas_ = function(canvas) {
  var h = createCanvas();
  h.style.position = "absolute";
  h.style.top = canvas.style.top;
  h.style.left = canvas.style.left;
  h.width = this.width_;
  h.height = this.height_;
  h.style.width = this.width_ + "px";
  h.style.height = this.height_ + "px";
  return h;
};
Dygraph.prototype.createMouseEventElement_ = function() {
  return this.canvas_;
};
Dygraph.prototype.setColors_ = function() {
  var labels = this.getLabels();
  var num = labels.length - 1;
  this.colors_ = [];
  this.colorsMap_ = {};
  var sat = this.getNumericOption("colorSaturation") || 1;
  var val = this.getNumericOption("colorValue") || 0.5;
  var half = Math.ceil(num / 2);
  var colors = this.getOption("colors");
  var visibility = this.visibility();
  for (var i = 0; i < num; i++) {
    if (!visibility[i]) {
      continue;
    }
    var label = labels[i + 1];
    var colorStr = this.attributes_.getForSeries("color", label);
    if (!colorStr) {
      if (colors) {
        colorStr = colors[i % colors.length];
      } else {
        var idx = i % 2 ? half + (i + 1) / 2 : Math.ceil((i + 1) / 2);
        var hue = 1 * idx / (1 + num);
        colorStr = hsvToRGB(hue, sat, val);
      }
    }
    this.colors_.push(colorStr);
    this.colorsMap_[label] = colorStr;
  }
};
Dygraph.prototype.getColors = function() {
  return this.colors_;
};
Dygraph.prototype.getPropertiesForSeries = function(series_name) {
  var idx = -1;
  var labels = this.getLabels();
  for (var i = 1; i < labels.length; i++) {
    if (labels[i] == series_name) {
      idx = i;
      break;
    }
  }
  if (idx == -1) return null;
  return {
    name: series_name,
    column: idx,
    visible: this.visibility()[idx - 1],
    color: this.colorsMap_[series_name],
    axis: 1 + this.attributes_.axisForSeries(series_name)
  };
};
Dygraph.prototype.createRollInterface_ = function() {
  var roller = this.roller_;
  if (!roller) {
    this.roller_ = roller = document.createElement("input");
    roller.type = "text";
    roller.style.display = "none";
    roller.className = "dygraph-roller";
    this.graphDiv.appendChild(roller);
  }
  var display = this.getBooleanOption("showRoller") ? "block" : "none";
  var area = this.getArea();
  var textAttr = {
    "top": area.y + area.h - 25 + "px",
    "left": area.x + 1 + "px",
    "display": display
  };
  roller.size = "2";
  roller.value = this.rollPeriod_;
  update(roller.style, textAttr);
  const that = this;
  roller.onchange = function onchange() {
    return that.adjustRoll(roller.value);
  };
};
Dygraph.prototype.createDragInterface_ = function() {
  var context = {
    // Tracks whether the mouse is down right now
    isZooming: false,
    isPanning: false,
    // is this drag part of a pan?
    is2DPan: false,
    // if so, is that pan 1- or 2-dimensional?
    dragStartX: null,
    // pixel coordinates
    dragStartY: null,
    // pixel coordinates
    dragEndX: null,
    // pixel coordinates
    dragEndY: null,
    // pixel coordinates
    dragDirection: null,
    prevEndX: null,
    // pixel coordinates
    prevEndY: null,
    // pixel coordinates
    prevDragDirection: null,
    cancelNextDblclick: false,
    // see comment in dygraph-interaction-model.js
    // The value on the left side of the graph when a pan operation starts.
    initialLeftmostDate: null,
    // The number of units each pixel spans. (This won't be valid for log
    // scales)
    xUnitsPerPixel: null,
    // TODO(danvk): update this comment
    // The range in second/value units that the viewport encompasses during a
    // panning operation.
    dateRange: null,
    // Top-left corner of the canvas, in DOM coords
    // TODO(konigsberg): Rename topLeftCanvasX, topLeftCanvasY.
    px: 0,
    py: 0,
    // Values for use with panEdgeFraction, which limit how far outside the
    // graph's data boundaries it can be panned.
    boundedDates: null,
    // [minDate, maxDate]
    boundedValues: null,
    // [[minValue, maxValue] ...]
    // We cover iframes during mouse interactions. See comments in
    // dygraph-utils.js for more info on why this is a good idea.
    tarp: new iframe_tarp_default(),
    // contextB is the same thing as this context object but renamed.
    initializeMouseDown: function(event, g, contextB) {
      if (event.preventDefault) {
        event.preventDefault();
      } else {
        event.returnValue = false;
        event.cancelBubble = true;
      }
      var canvasPos = findPos(g.canvas_);
      contextB.px = canvasPos.x;
      contextB.py = canvasPos.y;
      contextB.dragStartX = dragGetX_(event, contextB);
      contextB.dragStartY = dragGetY_(event, contextB);
      contextB.cancelNextDblclick = false;
      contextB.tarp.cover();
    },
    destroy: function() {
      var context2 = this;
      if (context2.isZooming || context2.isPanning) {
        context2.isZooming = false;
        context2.dragStartX = null;
        context2.dragStartY = null;
      }
      if (context2.isPanning) {
        context2.isPanning = false;
        context2.draggingDate = null;
        context2.dateRange = null;
        for (var i = 0; i < self.axes_.length; i++) {
          delete self.axes_[i].draggingValue;
          delete self.axes_[i].dragValueRange;
        }
      }
      context2.tarp.uncover();
    }
  };
  var interactionModel = this.getOption("interactionModel");
  var self = this;
  var bindHandler = function(handler2) {
    return function(event) {
      handler2(event, self, context);
    };
  };
  for (var eventName in interactionModel) {
    if (!interactionModel.hasOwnProperty(eventName)) continue;
    this.addAndTrackEvent(
      this.mouseEventElement_,
      eventName,
      bindHandler(interactionModel[eventName])
    );
  }
  if (!interactionModel.willDestroyContextMyself) {
    var mouseUpHandler = function(event) {
      context.destroy();
    };
    this.addAndTrackEvent(document, "mouseup", mouseUpHandler);
  }
};
Dygraph.prototype.drawZoomRect_ = function(direction, startX, endX, startY, endY, prevDirection, prevEndX, prevEndY) {
  var ctx = this.canvas_ctx_;
  if (prevDirection == HORIZONTAL) {
    ctx.clearRect(
      Math.min(startX, prevEndX),
      this.layout_.getPlotArea().y,
      Math.abs(startX - prevEndX),
      this.layout_.getPlotArea().h
    );
  } else if (prevDirection == VERTICAL) {
    ctx.clearRect(
      this.layout_.getPlotArea().x,
      Math.min(startY, prevEndY),
      this.layout_.getPlotArea().w,
      Math.abs(startY - prevEndY)
    );
  }
  if (direction == HORIZONTAL) {
    if (endX && startX) {
      ctx.fillStyle = "rgba(128,128,128,0.33)";
      ctx.fillRect(
        Math.min(startX, endX),
        this.layout_.getPlotArea().y,
        Math.abs(endX - startX),
        this.layout_.getPlotArea().h
      );
    }
  } else if (direction == VERTICAL) {
    if (endY && startY) {
      ctx.fillStyle = "rgba(128,128,128,0.33)";
      ctx.fillRect(
        this.layout_.getPlotArea().x,
        Math.min(startY, endY),
        this.layout_.getPlotArea().w,
        Math.abs(endY - startY)
      );
    }
  }
};
Dygraph.prototype.clearZoomRect_ = function() {
  this.currentZoomRectArgs_ = null;
  this.canvas_ctx_.clearRect(0, 0, this.width_, this.height_);
};
Dygraph.prototype.doZoomX_ = function(lowX, highX) {
  this.currentZoomRectArgs_ = null;
  var minDate = this.toDataXCoord(lowX);
  var maxDate = this.toDataXCoord(highX);
  this.doZoomXDates_(minDate, maxDate);
};
Dygraph.prototype.doZoomXDates_ = function(minDate, maxDate) {
  var old_window = this.xAxisRange();
  var new_window = [minDate, maxDate];
  const zoomCallback = this.getFunctionOption("zoomCallback");
  const that = this;
  this.doAnimatedZoom(old_window, new_window, null, null, function animatedZoomCallback() {
    if (zoomCallback) {
      zoomCallback.call(that, minDate, maxDate, that.yAxisRanges());
    }
  });
};
Dygraph.prototype.doZoomY_ = function(lowY, highY) {
  this.currentZoomRectArgs_ = null;
  var oldValueRanges = this.yAxisRanges();
  var newValueRanges = [];
  for (var i = 0; i < this.axes_.length; i++) {
    var hi = this.toDataYCoord(lowY, i);
    var low = this.toDataYCoord(highY, i);
    newValueRanges.push([low, hi]);
  }
  const zoomCallback = this.getFunctionOption("zoomCallback");
  const that = this;
  this.doAnimatedZoom(null, null, oldValueRanges, newValueRanges, function animatedZoomCallback() {
    if (zoomCallback) {
      const [minX, maxX] = that.xAxisRange();
      zoomCallback.call(that, minX, maxX, that.yAxisRanges());
    }
  });
};
Dygraph.zoomAnimationFunction = function(frame, numFrames) {
  var k = 1.5;
  return (1 - Math.pow(k, -frame)) / (1 - Math.pow(k, -numFrames));
};
Dygraph.prototype.resetZoom = function() {
  const dirtyX = this.isZoomed("x");
  const dirtyY = this.isZoomed("y");
  const dirty = dirtyX || dirtyY;
  this.clearSelection();
  if (!dirty) return;
  const [minDate, maxDate] = this.xAxisExtremes();
  const animatedZooms = this.getBooleanOption("animatedZooms");
  const zoomCallback = this.getFunctionOption("zoomCallback");
  if (!animatedZooms) {
    this.dateWindow_ = null;
    this.axes_.forEach((axis) => {
      if (axis.valueRange) delete axis.valueRange;
    });
    this.drawGraph_();
    if (zoomCallback) {
      zoomCallback.call(this, minDate, maxDate, this.yAxisRanges());
    }
    return;
  }
  var oldWindow = null, newWindow = null, oldValueRanges = null, newValueRanges = null;
  if (dirtyX) {
    oldWindow = this.xAxisRange();
    newWindow = [minDate, maxDate];
  }
  if (dirtyY) {
    oldValueRanges = this.yAxisRanges();
    newValueRanges = this.yAxisExtremes();
  }
  const that = this;
  this.doAnimatedZoom(
    oldWindow,
    newWindow,
    oldValueRanges,
    newValueRanges,
    function animatedZoomCallback() {
      that.dateWindow_ = null;
      that.axes_.forEach((axis) => {
        if (axis.valueRange) delete axis.valueRange;
      });
      if (zoomCallback) {
        zoomCallback.call(that, minDate, maxDate, that.yAxisRanges());
      }
    }
  );
};
Dygraph.prototype.doAnimatedZoom = function(oldXRange, newXRange, oldYRanges, newYRanges, callback) {
  var steps = this.getBooleanOption("animatedZooms") ? Dygraph.ANIMATION_STEPS : 1;
  var windows = [];
  var valueRanges = [];
  var step, frac;
  if (oldXRange !== null && newXRange !== null) {
    for (step = 1; step <= steps; step++) {
      frac = Dygraph.zoomAnimationFunction(step, steps);
      windows[step - 1] = [
        oldXRange[0] * (1 - frac) + frac * newXRange[0],
        oldXRange[1] * (1 - frac) + frac * newXRange[1]
      ];
    }
  }
  if (oldYRanges !== null && newYRanges !== null) {
    for (step = 1; step <= steps; step++) {
      frac = Dygraph.zoomAnimationFunction(step, steps);
      var thisRange = [];
      for (var j = 0; j < this.axes_.length; j++) {
        thisRange.push([
          oldYRanges[j][0] * (1 - frac) + frac * newYRanges[j][0],
          oldYRanges[j][1] * (1 - frac) + frac * newYRanges[j][1]
        ]);
      }
      valueRanges[step - 1] = thisRange;
    }
  }
  const that = this;
  repeatAndCleanup(function(step2) {
    if (valueRanges.length) {
      for (var i = 0; i < that.axes_.length; i++) {
        var w = valueRanges[step2][i];
        that.axes_[i].valueRange = [w[0], w[1]];
      }
    }
    if (windows.length) {
      that.dateWindow_ = windows[step2];
    }
    that.drawGraph_();
  }, steps, Dygraph.ANIMATION_DURATION / steps, callback);
};
Dygraph.prototype.getArea = function() {
  return this.plotter_.area;
};
Dygraph.prototype.eventToDomCoords = function(event) {
  if (event.offsetX && event.offsetY) {
    return [event.offsetX, event.offsetY];
  } else {
    var eventElementPos = findPos(this.mouseEventElement_);
    var canvasx = pageX(event) - eventElementPos.x;
    var canvasy = pageY(event) - eventElementPos.y;
    return [canvasx, canvasy];
  }
};
Dygraph.prototype.findClosestRow = function(domX) {
  var minDistX = Infinity;
  var closestRow = -1;
  var sets = this.layout_.points;
  for (var i = 0; i < sets.length; i++) {
    var points = sets[i];
    var len = points.length;
    for (var j = 0; j < len; j++) {
      var point = points[j];
      if (!isValidPoint(point, true)) continue;
      var dist = Math.abs(point.canvasx - domX);
      if (dist < minDistX) {
        minDistX = dist;
        closestRow = point.idx;
      }
    }
  }
  return closestRow;
};
Dygraph.prototype.findClosestPoint = function(domX, domY) {
  var minDist = Infinity;
  var dist, dx, dy, point, closestPoint, closestSeries, closestRow;
  for (var setIdx = this.layout_.points.length - 1; setIdx >= 0; --setIdx) {
    var points = this.layout_.points[setIdx];
    for (var i = 0; i < points.length; ++i) {
      point = points[i];
      if (!isValidPoint(point)) continue;
      dx = point.canvasx - domX;
      dy = point.canvasy - domY;
      dist = dx * dx + dy * dy;
      if (dist < minDist) {
        minDist = dist;
        closestPoint = point;
        closestSeries = setIdx;
        closestRow = point.idx;
      }
    }
  }
  var name = this.layout_.setNames[closestSeries];
  return {
    row: closestRow,
    seriesName: name,
    point: closestPoint
  };
};
Dygraph.prototype.findStackedPoint = function(domX, domY) {
  var row = this.findClosestRow(domX);
  var closestPoint, closestSeries;
  for (var setIdx = 0; setIdx < this.layout_.points.length; ++setIdx) {
    var boundary = this.getLeftBoundary_(setIdx);
    var rowIdx = row - boundary;
    var points = this.layout_.points[setIdx];
    if (rowIdx >= points.length) continue;
    var p1 = points[rowIdx];
    if (!isValidPoint(p1)) continue;
    var py = p1.canvasy;
    if (domX > p1.canvasx && rowIdx + 1 < points.length) {
      var p2 = points[rowIdx + 1];
      if (isValidPoint(p2)) {
        var dx = p2.canvasx - p1.canvasx;
        if (dx > 0) {
          var r = (domX - p1.canvasx) / dx;
          py += r * (p2.canvasy - p1.canvasy);
        }
      }
    } else if (domX < p1.canvasx && rowIdx > 0) {
      var p0 = points[rowIdx - 1];
      if (isValidPoint(p0)) {
        var dx = p1.canvasx - p0.canvasx;
        if (dx > 0) {
          var r = (p1.canvasx - domX) / dx;
          py += r * (p0.canvasy - p1.canvasy);
        }
      }
    }
    if (setIdx === 0 || py < domY) {
      closestPoint = p1;
      closestSeries = setIdx;
    }
  }
  var name = this.layout_.setNames[closestSeries];
  return {
    row,
    seriesName: name,
    point: closestPoint
  };
};
Dygraph.prototype.mouseMove_ = function(event) {
  var points = this.layout_.points;
  if (points === void 0 || points === null) return;
  var canvasCoords = this.eventToDomCoords(event);
  var canvasx = canvasCoords[0];
  var canvasy = canvasCoords[1];
  var highlightSeriesOpts = this.getOption("highlightSeriesOpts");
  var selectionChanged = false;
  if (highlightSeriesOpts && !this.isSeriesLocked()) {
    var closest;
    if (this.getBooleanOption("stackedGraph")) {
      closest = this.findStackedPoint(canvasx, canvasy);
    } else {
      closest = this.findClosestPoint(canvasx, canvasy);
    }
    selectionChanged = this.setSelection(closest.row, closest.seriesName);
  } else {
    var idx = this.findClosestRow(canvasx);
    selectionChanged = this.setSelection(idx);
  }
  var callback = this.getFunctionOption("highlightCallback");
  if (callback && selectionChanged) {
    callback.call(
      this,
      event,
      this.lastx_,
      this.selPoints_,
      this.lastRow_,
      this.highlightSet_
    );
  }
};
Dygraph.prototype.getLeftBoundary_ = function(setIdx) {
  if (this.boundaryIds_[setIdx]) {
    return this.boundaryIds_[setIdx][0];
  } else {
    for (var i = 0; i < this.boundaryIds_.length; i++) {
      if (this.boundaryIds_[i] !== void 0) {
        return this.boundaryIds_[i][0];
      }
    }
    return 0;
  }
};
Dygraph.prototype.animateSelection_ = function(direction) {
  var totalSteps = 10;
  var millis = 30;
  if (this.fadeLevel === void 0) this.fadeLevel = 0;
  if (this.animateId === void 0) this.animateId = 0;
  var start = this.fadeLevel;
  var steps = direction < 0 ? start : totalSteps - start;
  if (steps <= 0) {
    if (this.fadeLevel) {
      this.updateSelection_(1);
    }
    return;
  }
  var thisId = ++this.animateId;
  var that = this;
  var cleanupIfClearing = function() {
    if (that.fadeLevel !== 0 && direction < 0) {
      that.fadeLevel = 0;
      that.clearSelection();
    }
  };
  repeatAndCleanup(
    function(n) {
      if (that.animateId != thisId) return;
      that.fadeLevel += direction;
      if (that.fadeLevel === 0) {
        that.clearSelection();
      } else {
        that.updateSelection_(that.fadeLevel / totalSteps);
      }
    },
    steps,
    millis,
    cleanupIfClearing
  );
};
Dygraph.prototype.updateSelection_ = function(opt_animFraction) {
  this.cascadeEvents_("select", {
    selectedRow: this.lastRow_ === -1 ? void 0 : this.lastRow_,
    selectedX: this.lastx_ === null ? void 0 : this.lastx_,
    selectedPoints: this.selPoints_
  });
  var i;
  var ctx = this.canvas_ctx_;
  if (this.getOption("highlightSeriesOpts")) {
    ctx.clearRect(0, 0, this.width_, this.height_);
    var alpha = 1 - this.getNumericOption("highlightSeriesBackgroundAlpha");
    var backgroundColor = toRGB_(this.getOption("highlightSeriesBackgroundColor"));
    if (alpha) {
      var animateBackgroundFade = this.getBooleanOption("animateBackgroundFade");
      if (animateBackgroundFade) {
        if (opt_animFraction === void 0) {
          this.animateSelection_(1);
          return;
        }
        alpha *= opt_animFraction;
      }
      ctx.fillStyle = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + alpha + ")";
      ctx.fillRect(0, 0, this.width_, this.height_);
    }
    this.plotter_._renderLineChart(this.highlightSet_, ctx);
  } else if (this.previousVerticalX_ >= 0) {
    var maxCircleSize = 0;
    var labels = this.attr_("labels");
    for (i = 1; i < labels.length; i++) {
      var r = this.getNumericOption("highlightCircleSize", labels[i]);
      if (r > maxCircleSize) maxCircleSize = r;
    }
    var px = this.previousVerticalX_;
    ctx.clearRect(
      px - maxCircleSize - 1,
      0,
      2 * maxCircleSize + 2,
      this.height_
    );
  }
  if (this.selPoints_.length > 0) {
    var canvasx = this.selPoints_[0].canvasx;
    ctx.save();
    for (i = 0; i < this.selPoints_.length; i++) {
      var pt = this.selPoints_[i];
      if (isNaN(pt.canvasy)) continue;
      var circleSize = this.getNumericOption("highlightCircleSize", pt.name);
      var callback = this.getFunctionOption("drawHighlightPointCallback", pt.name);
      var color = this.plotter_.colors[pt.name];
      if (!callback) {
        callback = Circles.DEFAULT;
      }
      ctx.lineWidth = this.getNumericOption("strokeWidth", pt.name);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      callback.call(
        this,
        this,
        pt.name,
        ctx,
        canvasx,
        pt.canvasy,
        color,
        circleSize,
        pt.idx
      );
    }
    ctx.restore();
    this.previousVerticalX_ = canvasx;
  }
};
Dygraph.prototype.setSelection = function setSelection(row, opt_seriesName, opt_locked, opt_trigger_highlight_callback) {
  this.selPoints_ = [];
  var changed = false;
  if (row !== false && row >= 0) {
    if (row != this.lastRow_) changed = true;
    this.lastRow_ = row;
    for (var setIdx = 0; setIdx < this.layout_.points.length; ++setIdx) {
      var points = this.layout_.points[setIdx];
      var setRow = row - this.getLeftBoundary_(setIdx);
      if (setRow >= 0 && setRow < points.length && points[setRow].idx == row) {
        var point = points[setRow];
        if (point.yval !== null) this.selPoints_.push(point);
      } else {
        for (var pointIdx = 0; pointIdx < points.length; ++pointIdx) {
          var point = points[pointIdx];
          if (point.idx == row) {
            if (point.yval !== null) {
              this.selPoints_.push(point);
            }
            break;
          }
        }
      }
    }
  } else {
    if (this.lastRow_ >= 0) changed = true;
    this.lastRow_ = -1;
  }
  if (this.selPoints_.length) {
    this.lastx_ = this.selPoints_[0].xval;
  } else {
    this.lastx_ = null;
  }
  if (opt_seriesName !== void 0) {
    if (this.highlightSet_ !== opt_seriesName) changed = true;
    this.highlightSet_ = opt_seriesName;
  }
  if (opt_locked !== void 0) {
    this.lockedSet_ = opt_locked;
  }
  if (changed) {
    this.updateSelection_(void 0);
    if (opt_trigger_highlight_callback) {
      var callback = this.getFunctionOption("highlightCallback");
      if (callback) {
        var event = {};
        callback.call(
          this,
          event,
          this.lastx_,
          this.selPoints_,
          this.lastRow_,
          this.highlightSet_
        );
      }
    }
  }
  return changed;
};
Dygraph.prototype.mouseOut_ = function(event) {
  if (this.getFunctionOption("unhighlightCallback")) {
    this.getFunctionOption("unhighlightCallback").call(this, event);
  }
  if (this.getBooleanOption("hideOverlayOnMouseOut") && !this.lockedSet_) {
    this.clearSelection();
  }
};
Dygraph.prototype.clearSelection = function() {
  this.cascadeEvents_("deselect", {});
  this.lockedSet_ = false;
  if (this.fadeLevel) {
    this.animateSelection_(-1);
    return;
  }
  this.canvas_ctx_.clearRect(0, 0, this.width_, this.height_);
  this.fadeLevel = 0;
  this.selPoints_ = [];
  this.lastx_ = null;
  this.lastRow_ = -1;
  this.highlightSet_ = null;
};
Dygraph.prototype.getSelection = function() {
  if (!this.selPoints_ || this.selPoints_.length < 1) {
    return -1;
  }
  for (var setIdx = 0; setIdx < this.layout_.points.length; setIdx++) {
    var points = this.layout_.points[setIdx];
    for (var row = 0; row < points.length; row++) {
      if (points[row].x == this.selPoints_[0].x) {
        return points[row].idx;
      }
    }
  }
  return -1;
};
Dygraph.prototype.getHighlightSeries = function() {
  return this.highlightSet_;
};
Dygraph.prototype.isSeriesLocked = function() {
  return this.lockedSet_;
};
Dygraph.prototype.loadedEvent_ = function(data) {
  this.rawData_ = this.parseCSV_(data);
  this.cascadeDataDidUpdateEvent_();
  this.predraw_();
};
Dygraph.prototype.addXTicks_ = function() {
  var range;
  if (this.dateWindow_) {
    range = [this.dateWindow_[0], this.dateWindow_[1]];
  } else {
    range = this.xAxisExtremes();
  }
  var xAxisOptionsView = this.optionsViewForAxis_("x");
  var xTicks = xAxisOptionsView("ticker")(
    range[0],
    range[1],
    this.plotter_.area.w,
    // TODO(danvk): should be area.width
    xAxisOptionsView,
    this
  );
  this.layout_.setXTicks(xTicks);
};
Dygraph.prototype.getHandlerClass_ = function() {
  var handlerClass;
  if (this.attr_("dataHandler")) {
    handlerClass = this.attr_("dataHandler");
  } else if (this.fractions_) {
    if (this.getBooleanOption("errorBars")) {
      handlerClass = bars_fractions_default;
    } else {
      handlerClass = default_fractions_default;
    }
  } else if (this.getBooleanOption("customBars")) {
    handlerClass = bars_custom_default;
  } else if (this.getBooleanOption("errorBars")) {
    handlerClass = bars_error_default;
  } else {
    handlerClass = default_default;
  }
  return handlerClass;
};
Dygraph.prototype.predraw_ = function() {
  var start = /* @__PURE__ */ new Date();
  this.dataHandler_ = new (this.getHandlerClass_())();
  this.layout_.computePlotArea();
  this.computeYAxes_();
  if (!this.is_initial_draw_) {
    this.canvas_ctx_.restore();
    this.hidden_ctx_.restore();
  }
  this.canvas_ctx_.save();
  this.hidden_ctx_.save();
  this.plotter_ = new dygraph_canvas_default(
    this,
    this.hidden_,
    this.hidden_ctx_,
    this.layout_
  );
  this.createRollInterface_();
  this.cascadeEvents_("predraw");
  this.rolledSeries_ = [null];
  for (var i = 1; i < this.numColumns(); i++) {
    var series = this.dataHandler_.extractSeries(this.rawData_, i, this.attributes_);
    if (this.rollPeriod_ > 1) {
      series = this.dataHandler_.rollingAverage(series, this.rollPeriod_, this.attributes_, i);
    }
    this.rolledSeries_.push(series);
  }
  this.drawGraph_();
  var end = /* @__PURE__ */ new Date();
  this.drawingTimeMs_ = end - start;
};
Dygraph.PointType = void 0;
Dygraph.stackPoints_ = function(points, cumulativeYval, seriesExtremes, fillMethod) {
  var lastXval = null;
  var prevPoint = null;
  var nextPoint = null;
  var nextPointIdx = -1;
  var updateNextPoint = function(idx) {
    if (nextPointIdx >= idx) return;
    for (var j = idx; j < points.length; ++j) {
      nextPoint = null;
      if (!isNaN(points[j].yval) && points[j].yval !== null) {
        nextPointIdx = j;
        nextPoint = points[j];
        break;
      }
    }
  };
  for (var i = 0; i < points.length; ++i) {
    var point = points[i];
    var xval = point.xval;
    if (cumulativeYval[xval] === void 0) {
      cumulativeYval[xval] = 0;
    }
    var actualYval = point.yval;
    if (isNaN(actualYval) || actualYval === null) {
      if (fillMethod == "none") {
        actualYval = 0;
      } else {
        updateNextPoint(i);
        if (prevPoint && nextPoint && fillMethod != "none") {
          actualYval = prevPoint.yval + (nextPoint.yval - prevPoint.yval) * ((xval - prevPoint.xval) / (nextPoint.xval - prevPoint.xval));
        } else if (prevPoint && fillMethod == "all") {
          actualYval = prevPoint.yval;
        } else if (nextPoint && fillMethod == "all") {
          actualYval = nextPoint.yval;
        } else {
          actualYval = 0;
        }
      }
    } else {
      prevPoint = point;
    }
    var stackedYval = cumulativeYval[xval];
    if (lastXval != xval) {
      stackedYval += actualYval;
      cumulativeYval[xval] = stackedYval;
    }
    lastXval = xval;
    point.yval_stacked = stackedYval;
    if (stackedYval > seriesExtremes[1]) {
      seriesExtremes[1] = stackedYval;
    }
    if (stackedYval < seriesExtremes[0]) {
      seriesExtremes[0] = stackedYval;
    }
  }
};
Dygraph.prototype.gatherDatasets_ = function(rolledSeries, dateWindow) {
  var boundaryIds = [];
  var points = [];
  var cumulativeYval = [];
  var extremes = {};
  var seriesIdx, sampleIdx;
  var firstIdx, lastIdx;
  var axisIdx;
  var num_series = rolledSeries.length - 1;
  var series;
  for (seriesIdx = num_series; seriesIdx >= 1; seriesIdx--) {
    if (!this.visibility()[seriesIdx - 1]) continue;
    if (dateWindow) {
      series = rolledSeries[seriesIdx];
      var low = dateWindow[0];
      var high = dateWindow[1];
      firstIdx = null;
      lastIdx = null;
      for (sampleIdx = 0; sampleIdx < series.length; sampleIdx++) {
        if (series[sampleIdx][0] >= low && firstIdx === null) {
          firstIdx = sampleIdx;
        }
        if (series[sampleIdx][0] <= high) {
          lastIdx = sampleIdx;
        }
      }
      if (firstIdx === null) firstIdx = 0;
      var correctedFirstIdx = firstIdx;
      var isInvalidValue = true;
      while (isInvalidValue && correctedFirstIdx > 0) {
        correctedFirstIdx--;
        isInvalidValue = series[correctedFirstIdx][1] === null;
      }
      if (lastIdx === null) lastIdx = series.length - 1;
      var correctedLastIdx = lastIdx;
      isInvalidValue = true;
      while (isInvalidValue && correctedLastIdx < series.length - 1) {
        correctedLastIdx++;
        isInvalidValue = series[correctedLastIdx][1] === null;
      }
      if (correctedFirstIdx !== firstIdx) {
        firstIdx = correctedFirstIdx;
      }
      if (correctedLastIdx !== lastIdx) {
        lastIdx = correctedLastIdx;
      }
      boundaryIds[seriesIdx - 1] = [firstIdx, lastIdx];
      series = series.slice(firstIdx, lastIdx + 1);
    } else {
      series = rolledSeries[seriesIdx];
      boundaryIds[seriesIdx - 1] = [0, series.length - 1];
    }
    var seriesName = this.attr_("labels")[seriesIdx];
    var seriesExtremes = this.dataHandler_.getExtremeYValues(
      series,
      dateWindow,
      this.getBooleanOption("stepPlot", seriesName)
    );
    var seriesPoints = this.dataHandler_.seriesToPoints(
      series,
      seriesName,
      boundaryIds[seriesIdx - 1][0]
    );
    if (this.getBooleanOption("stackedGraph")) {
      axisIdx = this.attributes_.axisForSeries(seriesName);
      if (cumulativeYval[axisIdx] === void 0) {
        cumulativeYval[axisIdx] = [];
      }
      Dygraph.stackPoints_(
        seriesPoints,
        cumulativeYval[axisIdx],
        seriesExtremes,
        this.getBooleanOption("stackedGraphNaNFill")
      );
    }
    extremes[seriesName] = seriesExtremes;
    points[seriesIdx] = seriesPoints;
  }
  return { points, extremes, boundaryIds };
};
Dygraph.prototype.drawGraph_ = function() {
  var start = /* @__PURE__ */ new Date();
  var is_initial_draw = this.is_initial_draw_;
  this.is_initial_draw_ = false;
  this.layout_.removeAllDatasets();
  this.setColors_();
  this.attrs_.pointSize = 0.5 * this.getNumericOption("highlightCircleSize");
  var packed = this.gatherDatasets_(this.rolledSeries_, this.dateWindow_);
  var points = packed.points;
  var extremes = packed.extremes;
  this.boundaryIds_ = packed.boundaryIds;
  this.setIndexByName_ = {};
  var labels = this.attr_("labels");
  var dataIdx = 0;
  for (var i = 1; i < points.length; i++) {
    if (!this.visibility()[i - 1]) continue;
    this.layout_.addDataset(labels[i], points[i]);
    this.datasetIndex_[i] = dataIdx++;
  }
  for (var i = 0; i < labels.length; i++) {
    this.setIndexByName_[labels[i]] = i;
  }
  this.computeYAxisRanges_(extremes);
  this.layout_.setYAxes(this.axes_);
  this.addXTicks_();
  this.layout_.evaluate();
  this.renderGraph_(is_initial_draw);
  if (this.getStringOption("timingName")) {
    var end = /* @__PURE__ */ new Date();
    console.log(this.getStringOption("timingName") + " - drawGraph: " + (end - start) + "ms");
  }
};
Dygraph.prototype.renderGraph_ = function(is_initial_draw) {
  this.cascadeEvents_("clearChart");
  this.plotter_.clear();
  const underlayCallback = this.getFunctionOption("underlayCallback");
  if (underlayCallback) {
    underlayCallback.call(
      this,
      this.hidden_ctx_,
      this.layout_.getPlotArea(),
      this,
      this
    );
  }
  var e = {
    canvas: this.hidden_,
    drawingContext: this.hidden_ctx_
  };
  this.cascadeEvents_("willDrawChart", e);
  this.plotter_.render();
  this.cascadeEvents_("didDrawChart", e);
  this.lastRow_ = -1;
  this.canvas_.getContext("2d").clearRect(0, 0, this.width_, this.height_);
  const drawCallback = this.getFunctionOption("drawCallback");
  if (drawCallback !== null) {
    drawCallback.call(this, this, is_initial_draw);
  }
  if (is_initial_draw) {
    this.readyFired_ = true;
    while (this.readyFns_.length > 0) {
      var fn = this.readyFns_.pop();
      fn(this);
    }
  }
};
Dygraph.prototype.computeYAxes_ = function() {
  var axis, index, opts, v;
  this.axes_ = [];
  for (axis = 0; axis < this.attributes_.numAxes(); axis++) {
    opts = { g: this };
    update(opts, this.attributes_.axisOptions(axis));
    this.axes_[axis] = opts;
  }
  for (axis = 0; axis < this.axes_.length; axis++) {
    if (axis === 0) {
      opts = this.optionsViewForAxis_("y" + (axis ? "2" : ""));
      v = opts("valueRange");
      if (v) this.axes_[axis].valueRange = v;
    } else {
      var axes2 = this.user_attrs_.axes;
      if (axes2 && axes2.y2) {
        v = axes2.y2.valueRange;
        if (v) this.axes_[axis].valueRange = v;
      }
    }
  }
};
Dygraph.prototype.numAxes = function() {
  return this.attributes_.numAxes();
};
Dygraph.prototype.axisPropertiesForSeries = function(series) {
  return this.axes_[this.attributes_.axisForSeries(series)];
};
Dygraph.prototype.computeYAxisRanges_ = function(extremes) {
  var isNullUndefinedOrNaN = function(num) {
    return isNaN(parseFloat(num));
  };
  var numAxes = this.attributes_.numAxes();
  var ypadCompat, span, series, ypad;
  var p_axis;
  for (var i = 0; i < numAxes; i++) {
    var axis = this.axes_[i];
    var logscale = this.attributes_.getForAxis("logscale", i);
    var includeZero = this.attributes_.getForAxis("includeZero", i);
    var independentTicks = this.attributes_.getForAxis("independentTicks", i);
    series = this.attributes_.seriesForAxis(i);
    ypadCompat = true;
    ypad = 0.1;
    const yRangePad = this.getNumericOption("yRangePad");
    if (yRangePad !== null) {
      ypadCompat = false;
      ypad = yRangePad / this.plotter_.area.h;
    }
    if (series.length === 0) {
      axis.extremeRange = [0, 1];
    } else {
      var minY = Infinity;
      var maxY = -Infinity;
      var extremeMinY, extremeMaxY;
      for (var j = 0; j < series.length; j++) {
        if (!extremes.hasOwnProperty(series[j])) continue;
        extremeMinY = extremes[series[j]][0];
        if (extremeMinY !== null) {
          minY = Math.min(extremeMinY, minY);
        }
        extremeMaxY = extremes[series[j]][1];
        if (extremeMaxY !== null) {
          maxY = Math.max(extremeMaxY, maxY);
        }
      }
      if (includeZero && !logscale) {
        if (minY > 0) minY = 0;
        if (maxY < 0) maxY = 0;
      }
      if (minY == Infinity) minY = 0;
      if (maxY == -Infinity) maxY = 1;
      span = maxY - minY;
      if (span === 0) {
        if (maxY !== 0) {
          span = Math.abs(maxY);
        } else {
          maxY = 1;
          span = 1;
        }
      }
      var maxAxisY = maxY, minAxisY = minY;
      if (ypadCompat) {
        if (logscale) {
          maxAxisY = maxY + ypad * span;
          minAxisY = minY;
        } else {
          maxAxisY = maxY + ypad * span;
          minAxisY = minY - ypad * span;
          if (minAxisY < 0 && minY >= 0) minAxisY = 0;
          if (maxAxisY > 0 && maxY <= 0) maxAxisY = 0;
        }
      }
      axis.extremeRange = [minAxisY, maxAxisY];
    }
    if (axis.valueRange) {
      var y0 = isNullUndefinedOrNaN(axis.valueRange[0]) ? axis.extremeRange[0] : axis.valueRange[0];
      var y1 = isNullUndefinedOrNaN(axis.valueRange[1]) ? axis.extremeRange[1] : axis.valueRange[1];
      axis.computedValueRange = [y0, y1];
    } else {
      axis.computedValueRange = axis.extremeRange;
    }
    if (!ypadCompat) {
      y0 = axis.computedValueRange[0];
      y1 = axis.computedValueRange[1];
      if (y0 === y1) {
        if (y0 === 0) {
          y1 = 1;
        } else {
          var delta = Math.abs(y0 / 10);
          y0 -= delta;
          y1 += delta;
        }
      }
      if (logscale) {
        var y0pct = ypad / (2 * ypad - 1);
        var y1pct = (ypad - 1) / (2 * ypad - 1);
        axis.computedValueRange[0] = logRangeFraction(y0, y1, y0pct);
        axis.computedValueRange[1] = logRangeFraction(y0, y1, y1pct);
      } else {
        span = y1 - y0;
        axis.computedValueRange[0] = y0 - span * ypad;
        axis.computedValueRange[1] = y1 + span * ypad;
      }
    }
    if (independentTicks) {
      axis.independentTicks = independentTicks;
      var opts = this.optionsViewForAxis_("y" + (i ? "2" : ""));
      var ticker = opts("ticker");
      axis.ticks = ticker(
        axis.computedValueRange[0],
        axis.computedValueRange[1],
        this.plotter_.area.h,
        opts,
        this
      );
      if (!p_axis) p_axis = axis;
    }
  }
  if (p_axis === void 0) {
    throw 'Configuration Error: At least one axis has to have the "independentTicks" option activated.';
  }
  for (var i = 0; i < numAxes; i++) {
    var axis = this.axes_[i];
    if (!axis.independentTicks) {
      var opts = this.optionsViewForAxis_("y" + (i ? "2" : ""));
      var ticker = opts("ticker");
      var p_ticks = p_axis.ticks;
      var p_scale = p_axis.computedValueRange[1] - p_axis.computedValueRange[0];
      var scale = axis.computedValueRange[1] - axis.computedValueRange[0];
      var tick_values = [];
      for (var k = 0; k < p_ticks.length; k++) {
        var y_frac = (p_ticks[k].v - p_axis.computedValueRange[0]) / p_scale;
        var y_val = axis.computedValueRange[0] + y_frac * scale;
        tick_values.push(y_val);
      }
      axis.ticks = ticker(
        axis.computedValueRange[0],
        axis.computedValueRange[1],
        this.plotter_.area.h,
        opts,
        this,
        tick_values
      );
    }
  }
};
Dygraph.prototype.detectTypeFromString_ = function(str) {
  var isDate = false;
  var dashPos = str.indexOf("-");
  if (dashPos > 0 && (str[dashPos - 1] != "e" && str[dashPos - 1] != "E") || str.indexOf("/") >= 0 || isNaN(parseFloat(str))) {
    isDate = true;
  }
  this.setXAxisOptions_(isDate);
};
Dygraph.prototype.setXAxisOptions_ = function(isDate) {
  if (isDate) {
    this.attrs_.xValueParser = dateParser;
    this.attrs_.axes.x.valueFormatter = dateValueFormatter;
    this.attrs_.axes.x.ticker = dateTicker;
    this.attrs_.axes.x.axisLabelFormatter = dateAxisLabelFormatter;
  } else {
    this.attrs_.xValueParser = function(x) {
      return parseFloat(x);
    };
    this.attrs_.axes.x.valueFormatter = function(x) {
      return x;
    };
    this.attrs_.axes.x.ticker = numericTicks;
    this.attrs_.axes.x.axisLabelFormatter = this.attrs_.axes.x.valueFormatter;
  }
};
Dygraph.prototype.parseCSV_ = function(data) {
  var ret = [];
  var line_delimiter = detectLineDelimiter(data);
  var lines = data.split(line_delimiter || "\n");
  var vals, j;
  var delim = this.getStringOption("delimiter");
  if (lines[0].indexOf(delim) == -1 && lines[0].indexOf("	") >= 0) {
    delim = "	";
  }
  var start = 0;
  if (!("labels" in this.user_attrs_)) {
    start = 1;
    this.attrs_.labels = lines[0].split(delim);
    this.attributes_.reparseSeries();
  }
  var line_no = 0;
  var xParser;
  var defaultParserSet = false;
  var expectedCols = this.attr_("labels").length;
  var outOfOrder = false;
  for (var i = start; i < lines.length; i++) {
    var line = lines[i];
    line_no = i;
    if (line.length === 0) continue;
    if (line[0] == "#") continue;
    var inFields = line.split(delim);
    if (inFields.length < 2) continue;
    var fields = [];
    if (!defaultParserSet) {
      this.detectTypeFromString_(inFields[0]);
      xParser = this.getFunctionOption("xValueParser");
      defaultParserSet = true;
    }
    fields[0] = xParser(inFields[0], this);
    if (this.fractions_) {
      for (j = 1; j < inFields.length; j++) {
        vals = inFields[j].split("/");
        if (vals.length != 2) {
          console.error(`Expected fractional "num/den" values in CSV data but found a value '` + inFields[j] + "' on line " + (1 + i) + " ('" + line + "') which is not of this form.");
          fields[j] = [0, 0];
        } else {
          fields[j] = [
            parseFloat_(vals[0], i, line),
            parseFloat_(vals[1], i, line)
          ];
        }
      }
    } else if (this.getBooleanOption("errorBars")) {
      if (inFields.length % 2 != 1) {
        console.error("Expected alternating (value, stdev.) pairs in CSV data but line " + (1 + i) + " has an odd number of values (" + (inFields.length - 1) + "): '" + line + "'");
      }
      for (j = 1; j < inFields.length; j += 2) {
        fields[(j + 1) / 2] = [
          parseFloat_(inFields[j], i, line),
          parseFloat_(inFields[j + 1], i, line)
        ];
      }
    } else if (this.getBooleanOption("customBars")) {
      for (j = 1; j < inFields.length; j++) {
        var val = inFields[j];
        if (/^ *$/.test(val)) {
          fields[j] = [null, null, null];
        } else {
          vals = val.split(";");
          if (vals.length == 3) {
            fields[j] = [
              parseFloat_(vals[0], i, line),
              parseFloat_(vals[1], i, line),
              parseFloat_(vals[2], i, line)
            ];
          } else {
            console.warn('When using customBars, values must be either blank or "low;center;high" tuples (got "' + val + '" on line ' + (1 + i) + ")");
          }
        }
      }
    } else {
      for (j = 1; j < inFields.length; j++) {
        fields[j] = parseFloat_(inFields[j], i, line);
      }
    }
    if (ret.length > 0 && fields[0] < ret[ret.length - 1][0]) {
      outOfOrder = true;
    }
    if (fields.length != expectedCols) {
      console.error("Number of columns in line " + i + " (" + fields.length + ") does not agree with number of labels (" + expectedCols + ") " + line);
    }
    if (i === 0 && this.attr_("labels")) {
      var all_null = true;
      for (j = 0; all_null && j < fields.length; j++) {
        if (fields[j]) all_null = false;
      }
      if (all_null) {
        console.warn("The dygraphs 'labels' option is set, but the first row of CSV data ('" + line + "') appears to also contain labels. Will drop the CSV labels and use the option labels.");
        continue;
      }
    }
    ret.push(fields);
  }
  if (outOfOrder) {
    console.warn("CSV is out of order; order it correctly to speed loading.");
    ret.sort(function(a, b) {
      return a[0] - b[0];
    });
  }
  return ret;
};
function validateNativeFormat(data) {
  const firstRow = data[0];
  const firstX = firstRow[0];
  if (typeof firstX !== "number" && !isDateLike(firstX)) {
    throw new Error(`Expected number or date but got ${typeof firstX}: ${firstX}.`);
  }
  for (let i = 1; i < firstRow.length; i++) {
    const val = firstRow[i];
    if (val === null || val === void 0) continue;
    if (typeof val === "number") continue;
    if (isArrayLike(val)) continue;
    throw new Error(`Expected number or array but got ${typeof val}: ${val}.`);
  }
}
Dygraph.prototype.parseArray_ = function(data) {
  if (data.length === 0) {
    data = [[0]];
  }
  if (data[0].length === 0) {
    console.error("Data set cannot contain an empty row");
    return null;
  }
  validateNativeFormat(data);
  var i;
  if (this.attr_("labels") === null) {
    console.warn("Using default labels. Set labels explicitly via 'labels' in the options parameter");
    this.attrs_.labels = ["X"];
    for (i = 1; i < data[0].length; i++) {
      this.attrs_.labels.push("Y" + i);
    }
    this.attributes_.reparseSeries();
  } else {
    var num_labels = this.attr_("labels");
    if (num_labels.length != data[0].length) {
      console.error("Mismatch between number of labels (" + num_labels + ") and number of columns in array (" + data[0].length + ")");
      return null;
    }
  }
  if (isDateLike(data[0][0])) {
    this.attrs_.axes.x.valueFormatter = dateValueFormatter;
    this.attrs_.axes.x.ticker = dateTicker;
    this.attrs_.axes.x.axisLabelFormatter = dateAxisLabelFormatter;
    var parsedData = clone(data);
    for (i = 0; i < data.length; i++) {
      if (parsedData[i].length === 0) {
        console.error("Row " + (1 + i) + " of data is empty");
        return null;
      }
      if (parsedData[i][0] === null || typeof parsedData[i][0].getTime != "function" || isNaN(parsedData[i][0].getTime())) {
        console.error("x value in row " + (1 + i) + " is not a Date");
        return null;
      }
      parsedData[i][0] = parsedData[i][0].getTime();
    }
    return parsedData;
  } else {
    this.attrs_.axes.x.valueFormatter = function(x) {
      return x;
    };
    this.attrs_.axes.x.ticker = numericTicks;
    this.attrs_.axes.x.axisLabelFormatter = numberAxisLabelFormatter;
    return data;
  }
};
Dygraph.prototype.parseDataTable_ = function(data) {
  var shortTextForAnnotationNum = function(num) {
    var shortText = String.fromCharCode(65 + num % 26);
    num = Math.floor(num / 26);
    while (num > 0) {
      shortText = String.fromCharCode(65 + (num - 1) % 26) + shortText.toLowerCase();
      num = Math.floor((num - 1) / 26);
    }
    return shortText;
  };
  var cols = data.getNumberOfColumns();
  var rows = data.getNumberOfRows();
  var indepType = data.getColumnType(0);
  if (indepType == "date" || indepType == "datetime") {
    this.attrs_.xValueParser = dateParser;
    this.attrs_.axes.x.valueFormatter = dateValueFormatter;
    this.attrs_.axes.x.ticker = dateTicker;
    this.attrs_.axes.x.axisLabelFormatter = dateAxisLabelFormatter;
  } else if (indepType == "number") {
    this.attrs_.xValueParser = function(x) {
      return parseFloat(x);
    };
    this.attrs_.axes.x.valueFormatter = function(x) {
      return x;
    };
    this.attrs_.axes.x.ticker = numericTicks;
    this.attrs_.axes.x.axisLabelFormatter = this.attrs_.axes.x.valueFormatter;
  } else {
    throw new Error(
      "only 'date', 'datetime' and 'number' types are supported for column 1 of DataTable input (Got '" + indepType + "')"
    );
  }
  var colIdx = [];
  var annotationCols = {};
  var hasAnnotations = false;
  var i, j;
  for (i = 1; i < cols; i++) {
    var type = data.getColumnType(i);
    if (type == "number") {
      colIdx.push(i);
    } else if (type == "string" && this.getBooleanOption("displayAnnotations")) {
      var dataIdx = colIdx[colIdx.length - 1];
      if (!annotationCols.hasOwnProperty(dataIdx)) {
        annotationCols[dataIdx] = [i];
      } else {
        annotationCols[dataIdx].push(i);
      }
      hasAnnotations = true;
    } else {
      throw new Error(
        "Only 'number' is supported as a dependent type with Gviz. 'string' is only supported if displayAnnotations is true"
      );
    }
  }
  var labels = [data.getColumnLabel(0)];
  for (i = 0; i < colIdx.length; i++) {
    labels.push(data.getColumnLabel(colIdx[i]));
    if (this.getBooleanOption("errorBars")) i += 1;
  }
  this.attrs_.labels = labels;
  cols = labels.length;
  var ret = [];
  var outOfOrder = false;
  var annotations2 = [];
  for (i = 0; i < rows; i++) {
    var row = [];
    if (typeof data.getValue(i, 0) === "undefined" || data.getValue(i, 0) === null) {
      console.warn("Ignoring row " + i + " of DataTable because of undefined or null first column.");
      continue;
    }
    if (indepType == "date" || indepType == "datetime") {
      row.push(data.getValue(i, 0).getTime());
    } else {
      row.push(data.getValue(i, 0));
    }
    if (!this.getBooleanOption("errorBars")) {
      for (j = 0; j < colIdx.length; j++) {
        var col = colIdx[j];
        row.push(data.getValue(i, col));
        if (hasAnnotations && annotationCols.hasOwnProperty(col) && data.getValue(i, annotationCols[col][0]) !== null) {
          var ann = {};
          ann.series = data.getColumnLabel(col);
          ann.xval = row[0];
          ann.shortText = shortTextForAnnotationNum(annotations2.length);
          ann.text = "";
          for (var k = 0; k < annotationCols[col].length; k++) {
            if (k) ann.text += "\n";
            ann.text += data.getValue(i, annotationCols[col][k]);
          }
          annotations2.push(ann);
        }
      }
      for (j = 0; j < row.length; j++) {
        if (!isFinite(row[j])) row[j] = null;
      }
    } else {
      for (j = 0; j < cols - 1; j++) {
        row.push([data.getValue(i, 1 + 2 * j), data.getValue(i, 2 + 2 * j)]);
      }
    }
    if (ret.length > 0 && row[0] < ret[ret.length - 1][0]) {
      outOfOrder = true;
    }
    ret.push(row);
  }
  if (outOfOrder) {
    console.warn("DataTable is out of order; order it correctly to speed loading.");
    ret.sort(function(a, b) {
      return a[0] - b[0];
    });
  }
  this.rawData_ = ret;
  if (annotations2.length > 0) {
    this.setAnnotations(annotations2, true);
  }
  this.attributes_.reparseSeries();
};
Dygraph.prototype.cascadeDataDidUpdateEvent_ = function() {
  this.cascadeEvents_("dataDidUpdate", {});
};
Dygraph.prototype.start_ = function() {
  var data = this.file_;
  if (typeof data == "function") {
    data = data();
  }
  const datatype = typeArrayLike(data);
  if (datatype == "array") {
    this.rawData_ = this.parseArray_(data);
    this.cascadeDataDidUpdateEvent_();
    this.predraw_();
  } else if (datatype == "object" && typeof data.getColumnRange == "function") {
    this.parseDataTable_(data);
    this.cascadeDataDidUpdateEvent_();
    this.predraw_();
  } else if (datatype == "string") {
    var line_delimiter = detectLineDelimiter(data);
    if (line_delimiter) {
      this.loadedEvent_(data);
    } else {
      var req;
      if (window.XMLHttpRequest) {
        req = new XMLHttpRequest();
      } else {
        req = new ActiveXObject("Microsoft.XMLHTTP");
      }
      var caller = this;
      req.onreadystatechange = function() {
        if (req.readyState == 4) {
          if (req.status === 200 || // Normal http
          req.status === 0) {
            caller.loadedEvent_(req.responseText);
          }
        }
      };
      req.open("GET", data, true);
      req.send(null);
    }
  } else {
    console.error("Unknown data format: " + datatype);
  }
};
Dygraph.prototype.updateOptions = function(input_attrs, block_redraw) {
  if (typeof block_redraw == "undefined") block_redraw = false;
  var file = input_attrs.file;
  var attrs = Dygraph.copyUserAttrs_(input_attrs);
  var prevNumAxes = this.attributes_.numAxes();
  if ("rollPeriod" in attrs) {
    this.rollPeriod_ = attrs.rollPeriod;
  }
  if ("dateWindow" in attrs) {
    this.dateWindow_ = attrs.dateWindow;
  }
  var requiresNewPoints = isPixelChangingOptionList(this.attr_("labels"), attrs);
  updateDeep(this.user_attrs_, attrs);
  this.attributes_.reparseSeries();
  if (prevNumAxes < this.attributes_.numAxes()) this.plotter_.clear();
  if (file) {
    this.cascadeEvents_("dataWillUpdate", {});
    this.file_ = file;
    if (!block_redraw) this.start_();
  } else {
    if (!block_redraw) {
      if (requiresNewPoints) {
        this.predraw_();
      } else {
        this.renderGraph_(false);
      }
    }
  }
};
Dygraph.copyUserAttrs_ = function(attrs) {
  var my_attrs = {};
  for (var k in attrs) {
    if (!attrs.hasOwnProperty(k)) continue;
    if (k == "file") continue;
    if (attrs.hasOwnProperty(k)) my_attrs[k] = attrs[k];
  }
  return my_attrs;
};
Dygraph.prototype.resize = function(width, height) {
  if (this.resize_lock) {
    return;
  }
  this.resize_lock = true;
  if (width === null != (height === null)) {
    console.warn("Dygraph.resize() should be called with zero parameters or two non-NULL parameters. Pretending it was zero.");
    width = height = null;
  }
  var old_width = this.width_;
  var old_height = this.height_;
  if (width) {
    this.maindiv_.style.width = width + "px";
    this.maindiv_.style.height = height + "px";
    this.width_ = width;
    this.height_ = height;
  } else {
    this.width_ = this.maindiv_.clientWidth;
    this.height_ = this.maindiv_.clientHeight;
  }
  if (old_width != this.width_ || old_height != this.height_) {
    this.resizeElements_();
    this.predraw_();
  }
  this.resize_lock = false;
};
Dygraph.prototype.adjustRoll = function(length) {
  this.rollPeriod_ = length;
  this.predraw_();
};
Dygraph.prototype.visibility = function() {
  if (!this.getOption("visibility")) {
    this.attrs_.visibility = [];
  }
  while (this.getOption("visibility").length < this.numColumns() - 1) {
    this.attrs_.visibility.push(true);
  }
  return this.getOption("visibility");
};
Dygraph.prototype.setVisibility = function(num, value) {
  var x = this.visibility();
  var numIsObject = false;
  if (!Array.isArray(num)) {
    if (num !== null && typeof num === "object") {
      numIsObject = true;
    } else {
      num = [num];
    }
  }
  if (numIsObject) {
    for (var i in num) {
      if (num.hasOwnProperty(i)) {
        if (i < 0 || i >= x.length) {
          console.warn("Invalid series number in setVisibility: " + i);
        } else {
          x[i] = num[i];
        }
      }
    }
  } else {
    for (var i = 0; i < num.length; i++) {
      if (typeof num[i] === "boolean") {
        if (i >= x.length) {
          console.warn("Invalid series number in setVisibility: " + i);
        } else {
          x[i] = num[i];
        }
      } else {
        if (num[i] < 0 || num[i] >= x.length) {
          console.warn("Invalid series number in setVisibility: " + num[i]);
        } else {
          x[num[i]] = value;
        }
      }
    }
  }
  this.predraw_();
};
Dygraph.prototype.size = function() {
  return { width: this.width_, height: this.height_ };
};
Dygraph.prototype.setAnnotations = function(ann, suppressDraw) {
  this.annotations_ = ann;
  if (!this.layout_) {
    console.warn("Tried to setAnnotations before dygraph was ready. Try setting them in a ready() block. See dygraphs.com/tests/annotation.html");
    return;
  }
  this.layout_.setAnnotations(this.annotations_);
  if (!suppressDraw) {
    this.predraw_();
  }
};
Dygraph.prototype.annotations = function() {
  return this.annotations_;
};
Dygraph.prototype.getLabels = function() {
  var labels = this.attr_("labels");
  return labels ? labels.slice() : null;
};
Dygraph.prototype.indexFromSetName = function(name) {
  return this.setIndexByName_[name];
};
Dygraph.prototype.getRowForX = function(xVal) {
  var low = 0, high = this.numRows() - 1;
  while (low <= high) {
    var idx = high + low >> 1;
    var x = this.getValue(idx, 0);
    if (x < xVal) {
      low = idx + 1;
    } else if (x > xVal) {
      high = idx - 1;
    } else if (low != idx) {
      high = idx;
    } else {
      return idx;
    }
  }
  return null;
};
Dygraph.prototype.ready = function(callback) {
  if (this.is_initial_draw_) {
    this.readyFns_.push(callback);
  } else {
    callback.call(this, this);
  }
};
Dygraph.prototype.addAndTrackEvent = function(elem, type, fn) {
  addEvent(elem, type, fn);
  this.registeredEvents_.push({ elem, type, fn });
};
Dygraph.prototype.removeTrackedEvents_ = function() {
  if (this.registeredEvents_) {
    for (var idx = 0; idx < this.registeredEvents_.length; idx++) {
      var reg = this.registeredEvents_[idx];
      removeEvent(reg.elem, reg.type, reg.fn);
    }
  }
  this.registeredEvents_ = [];
};
Dygraph.PLUGINS = [
  legend_default,
  axes_default,
  range_selector_default,
  // Has to be before ChartLabels so that its callbacks are called after ChartLabels' callbacks.
  chart_labels_default,
  annotations_default,
  grid_default
];
Dygraph.GVizChart = dygraph_gviz_default;
Dygraph.DASHED_LINE = DASHED_LINE;
Dygraph.DOT_DASH_LINE = DOT_DASH_LINE;
Dygraph.dateAxisLabelFormatter = dateAxisLabelFormatter;
Dygraph.toRGB_ = toRGB_;
Dygraph.findPos = findPos;
Dygraph.pageX = pageX;
Dygraph.pageY = pageY;
Dygraph.dateString_ = dateString_;
Dygraph.defaultInteractionModel = dygraph_interaction_model_default.defaultModel;
Dygraph.nonInteractiveModel = Dygraph.nonInteractiveModel_ = dygraph_interaction_model_default.nonInteractiveModel_;
Dygraph.Circles = Circles;
Dygraph.Plugins = {
  Legend: legend_default,
  Axes: axes_default,
  Annotations: annotations_default,
  ChartLabels: chart_labels_default,
  Grid: grid_default,
  RangeSelector: range_selector_default
};
Dygraph.DataHandlers = {
  DefaultHandler: default_default,
  BarsHandler: bars_default,
  CustomBarsHandler: bars_custom_default,
  DefaultFractionHandler: default_fractions_default,
  ErrorBarsHandler: bars_error_default,
  FractionsBarsHandler: bars_fractions_default
};
Dygraph.startPan = dygraph_interaction_model_default.startPan;
Dygraph.startZoom = dygraph_interaction_model_default.startZoom;
Dygraph.movePan = dygraph_interaction_model_default.movePan;
Dygraph.moveZoom = dygraph_interaction_model_default.moveZoom;
Dygraph.endPan = dygraph_interaction_model_default.endPan;
Dygraph.endZoom = dygraph_interaction_model_default.endZoom;
Dygraph.numericLinearTicks = numericLinearTicks;
Dygraph.numericTicks = numericTicks;
Dygraph.dateTicker = dateTicker;
Dygraph.Granularity = Granularity;
Dygraph.getDateAxis = getDateAxis;
Dygraph.floatFormat = floatFormat;
setupDOMready_(Dygraph);
var dygraph_default = Dygraph;

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/utils/utf8.mjs
var sharedTextEncoder = new TextEncoder();
var CHUNK_SIZE = 4096;
function utf8DecodeJs(bytes, inputOffset, byteLength) {
  var offset = inputOffset;
  var end = offset + byteLength;
  var units = [];
  var result = "";
  while (offset < end) {
    var byte1 = bytes[offset++];
    if ((byte1 & 128) === 0) {
      units.push(byte1);
    } else if ((byte1 & 224) === 192) {
      var byte2 = bytes[offset++] & 63;
      units.push((byte1 & 31) << 6 | byte2);
    } else if ((byte1 & 240) === 224) {
      var byte2 = bytes[offset++] & 63;
      var byte3 = bytes[offset++] & 63;
      units.push((byte1 & 31) << 12 | byte2 << 6 | byte3);
    } else if ((byte1 & 248) === 240) {
      var byte2 = bytes[offset++] & 63;
      var byte3 = bytes[offset++] & 63;
      var byte4 = bytes[offset++] & 63;
      var unit = (byte1 & 7) << 18 | byte2 << 12 | byte3 << 6 | byte4;
      if (unit > 65535) {
        unit -= 65536;
        units.push(unit >>> 10 & 1023 | 55296);
        unit = 56320 | unit & 1023;
      }
      units.push(unit);
    } else {
      units.push(byte1);
    }
    if (units.length >= CHUNK_SIZE) {
      result += String.fromCharCode.apply(String, units);
      units.length = 0;
    }
  }
  if (units.length > 0) {
    result += String.fromCharCode.apply(String, units);
  }
  return result;
}
var sharedTextDecoder = new TextDecoder();
var TEXT_DECODER_THRESHOLD = 200;
function utf8DecodeTD(bytes, inputOffset, byteLength) {
  var stringBytes = bytes.subarray(inputOffset, inputOffset + byteLength);
  return sharedTextDecoder.decode(stringBytes);
}
function utf8Decode(bytes, inputOffset, byteLength) {
  if (byteLength > TEXT_DECODER_THRESHOLD) {
    return utf8DecodeTD(bytes, inputOffset, byteLength);
  } else {
    return utf8DecodeJs(bytes, inputOffset, byteLength);
  }
}

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/ExtData.mjs
var ExtData = (
  /** @class */
  /* @__PURE__ */ function() {
    function ExtData2(type, data) {
      this.type = type;
      this.data = data;
    }
    return ExtData2;
  }()
);

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/DecodeError.mjs
var __extends = /* @__PURE__ */ function() {
  var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
      d2.__proto__ = b2;
    } || function(d2, b2) {
      for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
    };
    return extendStatics(d, b);
  };
  return function(d, b) {
    if (typeof b !== "function" && b !== null)
      throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() {
      this.constructor = d;
    }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  };
}();
var DecodeError = (
  /** @class */
  function(_super) {
    __extends(DecodeError2, _super);
    function DecodeError2(message) {
      var _this = _super.call(this, message) || this;
      var proto = Object.create(DecodeError2.prototype);
      Object.setPrototypeOf(_this, proto);
      Object.defineProperty(_this, "name", {
        configurable: true,
        enumerable: false,
        value: DecodeError2.name
      });
      return _this;
    }
    return DecodeError2;
  }(Error)
);

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/utils/int.mjs
var UINT32_MAX = 4294967295;
function setInt64(view, offset, value) {
  var high = Math.floor(value / 4294967296);
  var low = value;
  view.setUint32(offset, high);
  view.setUint32(offset + 4, low);
}
function getInt64(view, offset) {
  var high = view.getInt32(offset);
  var low = view.getUint32(offset + 4);
  return high * 4294967296 + low;
}
function getUint64(view, offset) {
  var high = view.getUint32(offset);
  var low = view.getUint32(offset + 4);
  return high * 4294967296 + low;
}

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/timestamp.mjs
var EXT_TIMESTAMP = -1;
var TIMESTAMP32_MAX_SEC = 4294967296 - 1;
var TIMESTAMP64_MAX_SEC = 17179869184 - 1;
function encodeTimeSpecToTimestamp(_a) {
  var sec = _a.sec, nsec = _a.nsec;
  if (sec >= 0 && nsec >= 0 && sec <= TIMESTAMP64_MAX_SEC) {
    if (nsec === 0 && sec <= TIMESTAMP32_MAX_SEC) {
      var rv = new Uint8Array(4);
      var view = new DataView(rv.buffer);
      view.setUint32(0, sec);
      return rv;
    } else {
      var secHigh = sec / 4294967296;
      var secLow = sec & 4294967295;
      var rv = new Uint8Array(8);
      var view = new DataView(rv.buffer);
      view.setUint32(0, nsec << 2 | secHigh & 3);
      view.setUint32(4, secLow);
      return rv;
    }
  } else {
    var rv = new Uint8Array(12);
    var view = new DataView(rv.buffer);
    view.setUint32(0, nsec);
    setInt64(view, 4, sec);
    return rv;
  }
}
function encodeDateToTimeSpec(date) {
  var msec = date.getTime();
  var sec = Math.floor(msec / 1e3);
  var nsec = (msec - sec * 1e3) * 1e6;
  var nsecInSec = Math.floor(nsec / 1e9);
  return {
    sec: sec + nsecInSec,
    nsec: nsec - nsecInSec * 1e9
  };
}
function encodeTimestampExtension(object) {
  if (object instanceof Date) {
    var timeSpec = encodeDateToTimeSpec(object);
    return encodeTimeSpecToTimestamp(timeSpec);
  } else {
    return null;
  }
}
function decodeTimestampToTimeSpec(data) {
  var view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  switch (data.byteLength) {
    case 4: {
      var sec = view.getUint32(0);
      var nsec = 0;
      return { sec, nsec };
    }
    case 8: {
      var nsec30AndSecHigh2 = view.getUint32(0);
      var secLow32 = view.getUint32(4);
      var sec = (nsec30AndSecHigh2 & 3) * 4294967296 + secLow32;
      var nsec = nsec30AndSecHigh2 >>> 2;
      return { sec, nsec };
    }
    case 12: {
      var sec = getInt64(view, 4);
      var nsec = view.getUint32(0);
      return { sec, nsec };
    }
    default:
      throw new DecodeError("Unrecognized data size for timestamp (expected 4, 8, or 12): ".concat(data.length));
  }
}
function decodeTimestampExtension(data) {
  var timeSpec = decodeTimestampToTimeSpec(data);
  return new Date(timeSpec.sec * 1e3 + timeSpec.nsec / 1e6);
}
var timestampExtension = {
  type: EXT_TIMESTAMP,
  encode: encodeTimestampExtension,
  decode: decodeTimestampExtension
};

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/ExtensionCodec.mjs
var ExtensionCodec = (
  /** @class */
  function() {
    function ExtensionCodec2() {
      this.builtInEncoders = [];
      this.builtInDecoders = [];
      this.encoders = [];
      this.decoders = [];
      this.register(timestampExtension);
    }
    ExtensionCodec2.prototype.register = function(_a) {
      var type = _a.type, encode = _a.encode, decode2 = _a.decode;
      if (type >= 0) {
        this.encoders[type] = encode;
        this.decoders[type] = decode2;
      } else {
        var index = 1 + type;
        this.builtInEncoders[index] = encode;
        this.builtInDecoders[index] = decode2;
      }
    };
    ExtensionCodec2.prototype.tryToEncode = function(object, context) {
      for (var i = 0; i < this.builtInEncoders.length; i++) {
        var encodeExt = this.builtInEncoders[i];
        if (encodeExt != null) {
          var data = encodeExt(object, context);
          if (data != null) {
            var type = -1 - i;
            return new ExtData(type, data);
          }
        }
      }
      for (var i = 0; i < this.encoders.length; i++) {
        var encodeExt = this.encoders[i];
        if (encodeExt != null) {
          var data = encodeExt(object, context);
          if (data != null) {
            var type = i;
            return new ExtData(type, data);
          }
        }
      }
      if (object instanceof ExtData) {
        return object;
      }
      return null;
    };
    ExtensionCodec2.prototype.decode = function(data, type, context) {
      var decodeExt = type < 0 ? this.builtInDecoders[-1 - type] : this.decoders[type];
      if (decodeExt) {
        return decodeExt(data, type, context);
      } else {
        return new ExtData(type, data);
      }
    };
    ExtensionCodec2.defaultCodec = new ExtensionCodec2();
    return ExtensionCodec2;
  }()
);

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/utils/typedArrays.mjs
function ensureUint8Array(buffer) {
  if (buffer instanceof Uint8Array) {
    return buffer;
  } else if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer);
  } else {
    return Uint8Array.from(buffer);
  }
}
function createDataView(buffer) {
  if (buffer instanceof ArrayBuffer) {
    return new DataView(buffer);
  }
  var bufferView = ensureUint8Array(buffer);
  return new DataView(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength);
}

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/utils/prettyByte.mjs
function prettyByte(byte) {
  return "".concat(byte < 0 ? "-" : "", "0x").concat(Math.abs(byte).toString(16).padStart(2, "0"));
}

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/CachedKeyDecoder.mjs
var DEFAULT_MAX_KEY_LENGTH = 16;
var DEFAULT_MAX_LENGTH_PER_KEY = 16;
var CachedKeyDecoder = (
  /** @class */
  function() {
    function CachedKeyDecoder2(maxKeyLength, maxLengthPerKey) {
      if (maxKeyLength === void 0) {
        maxKeyLength = DEFAULT_MAX_KEY_LENGTH;
      }
      if (maxLengthPerKey === void 0) {
        maxLengthPerKey = DEFAULT_MAX_LENGTH_PER_KEY;
      }
      this.maxKeyLength = maxKeyLength;
      this.maxLengthPerKey = maxLengthPerKey;
      this.hit = 0;
      this.miss = 0;
      this.caches = [];
      for (var i = 0; i < this.maxKeyLength; i++) {
        this.caches.push([]);
      }
    }
    CachedKeyDecoder2.prototype.canBeCached = function(byteLength) {
      return byteLength > 0 && byteLength <= this.maxKeyLength;
    };
    CachedKeyDecoder2.prototype.find = function(bytes, inputOffset, byteLength) {
      var records = this.caches[byteLength - 1];
      FIND_CHUNK: for (var _i = 0, records_1 = records; _i < records_1.length; _i++) {
        var record = records_1[_i];
        var recordBytes = record.bytes;
        for (var j = 0; j < byteLength; j++) {
          if (recordBytes[j] !== bytes[inputOffset + j]) {
            continue FIND_CHUNK;
          }
        }
        return record.str;
      }
      return null;
    };
    CachedKeyDecoder2.prototype.store = function(bytes, value) {
      var records = this.caches[bytes.length - 1];
      var record = { bytes, str: value };
      if (records.length >= this.maxLengthPerKey) {
        records[Math.random() * records.length | 0] = record;
      } else {
        records.push(record);
      }
    };
    CachedKeyDecoder2.prototype.decode = function(bytes, inputOffset, byteLength) {
      var cachedValue = this.find(bytes, inputOffset, byteLength);
      if (cachedValue != null) {
        this.hit++;
        return cachedValue;
      }
      this.miss++;
      var str = utf8DecodeJs(bytes, inputOffset, byteLength);
      var slicedCopyOfBytes = Uint8Array.prototype.slice.call(bytes, inputOffset, inputOffset + byteLength);
      this.store(slicedCopyOfBytes, str);
      return str;
    };
    return CachedKeyDecoder2;
  }()
);

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/Decoder.mjs
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g;
  return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __asyncValues = function(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve, reject) {
        v = o[n](v), settle(resolve, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve({ value: v2, done: d });
    }, reject);
  }
};
var __await = function(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
};
var __asyncGenerator = function(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function verb(n) {
    if (g[n]) i[n] = function(v) {
      return new Promise(function(a, b) {
        q.push([n, v, a, b]) > 1 || resume(n, v);
      });
    };
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
  }
};
var STATE_ARRAY = "array";
var STATE_MAP_KEY = "map_key";
var STATE_MAP_VALUE = "map_value";
var isValidMapKeyType = function(key) {
  return typeof key === "string" || typeof key === "number";
};
var HEAD_BYTE_REQUIRED = -1;
var EMPTY_VIEW = new DataView(new ArrayBuffer(0));
var EMPTY_BYTES = new Uint8Array(EMPTY_VIEW.buffer);
try {
  EMPTY_VIEW.getInt8(0);
} catch (e) {
  if (!(e instanceof RangeError)) {
    throw new Error("This module is not supported in the current JavaScript engine because DataView does not throw RangeError on out-of-bounds access");
  }
}
var DataViewIndexOutOfBoundsError = RangeError;
var MORE_DATA = new DataViewIndexOutOfBoundsError("Insufficient data");
var sharedCachedKeyDecoder = new CachedKeyDecoder();
var Decoder = (
  /** @class */
  function() {
    function Decoder2(options) {
      var _a, _b, _c, _d, _e, _f, _g;
      this.totalPos = 0;
      this.pos = 0;
      this.view = EMPTY_VIEW;
      this.bytes = EMPTY_BYTES;
      this.headByte = HEAD_BYTE_REQUIRED;
      this.stack = [];
      this.extensionCodec = (_a = options === null || options === void 0 ? void 0 : options.extensionCodec) !== null && _a !== void 0 ? _a : ExtensionCodec.defaultCodec;
      this.context = options === null || options === void 0 ? void 0 : options.context;
      this.useBigInt64 = (_b = options === null || options === void 0 ? void 0 : options.useBigInt64) !== null && _b !== void 0 ? _b : false;
      this.maxStrLength = (_c = options === null || options === void 0 ? void 0 : options.maxStrLength) !== null && _c !== void 0 ? _c : UINT32_MAX;
      this.maxBinLength = (_d = options === null || options === void 0 ? void 0 : options.maxBinLength) !== null && _d !== void 0 ? _d : UINT32_MAX;
      this.maxArrayLength = (_e = options === null || options === void 0 ? void 0 : options.maxArrayLength) !== null && _e !== void 0 ? _e : UINT32_MAX;
      this.maxMapLength = (_f = options === null || options === void 0 ? void 0 : options.maxMapLength) !== null && _f !== void 0 ? _f : UINT32_MAX;
      this.maxExtLength = (_g = options === null || options === void 0 ? void 0 : options.maxExtLength) !== null && _g !== void 0 ? _g : UINT32_MAX;
      this.keyDecoder = (options === null || options === void 0 ? void 0 : options.keyDecoder) !== void 0 ? options.keyDecoder : sharedCachedKeyDecoder;
    }
    Decoder2.prototype.reinitializeState = function() {
      this.totalPos = 0;
      this.headByte = HEAD_BYTE_REQUIRED;
      this.stack.length = 0;
    };
    Decoder2.prototype.setBuffer = function(buffer) {
      this.bytes = ensureUint8Array(buffer);
      this.view = createDataView(this.bytes);
      this.pos = 0;
    };
    Decoder2.prototype.appendBuffer = function(buffer) {
      if (this.headByte === HEAD_BYTE_REQUIRED && !this.hasRemaining(1)) {
        this.setBuffer(buffer);
      } else {
        var remainingData = this.bytes.subarray(this.pos);
        var newData = ensureUint8Array(buffer);
        var newBuffer = new Uint8Array(remainingData.length + newData.length);
        newBuffer.set(remainingData);
        newBuffer.set(newData, remainingData.length);
        this.setBuffer(newBuffer);
      }
    };
    Decoder2.prototype.hasRemaining = function(size) {
      return this.view.byteLength - this.pos >= size;
    };
    Decoder2.prototype.createExtraByteError = function(posToShow) {
      var _a = this, view = _a.view, pos = _a.pos;
      return new RangeError("Extra ".concat(view.byteLength - pos, " of ").concat(view.byteLength, " byte(s) found at buffer[").concat(posToShow, "]"));
    };
    Decoder2.prototype.decode = function(buffer) {
      this.reinitializeState();
      this.setBuffer(buffer);
      var object = this.doDecodeSync();
      if (this.hasRemaining(1)) {
        throw this.createExtraByteError(this.pos);
      }
      return object;
    };
    Decoder2.prototype.decodeMulti = function(buffer) {
      return __generator(this, function(_a) {
        switch (_a.label) {
          case 0:
            this.reinitializeState();
            this.setBuffer(buffer);
            _a.label = 1;
          case 1:
            if (!this.hasRemaining(1)) return [3, 3];
            return [4, this.doDecodeSync()];
          case 2:
            _a.sent();
            return [3, 1];
          case 3:
            return [
              2
              /*return*/
            ];
        }
      });
    };
    Decoder2.prototype.decodeAsync = function(stream) {
      var _a, stream_1, stream_1_1;
      var _b, e_1, _c, _d;
      return __awaiter(this, void 0, void 0, function() {
        var decoded, object, buffer, e_1_1, _e, headByte, pos, totalPos;
        return __generator(this, function(_f) {
          switch (_f.label) {
            case 0:
              decoded = false;
              _f.label = 1;
            case 1:
              _f.trys.push([1, 6, 7, 12]);
              _a = true, stream_1 = __asyncValues(stream);
              _f.label = 2;
            case 2:
              return [4, stream_1.next()];
            case 3:
              if (!(stream_1_1 = _f.sent(), _b = stream_1_1.done, !_b)) return [3, 5];
              _d = stream_1_1.value;
              _a = false;
              try {
                buffer = _d;
                if (decoded) {
                  throw this.createExtraByteError(this.totalPos);
                }
                this.appendBuffer(buffer);
                try {
                  object = this.doDecodeSync();
                  decoded = true;
                } catch (e) {
                  if (!(e instanceof DataViewIndexOutOfBoundsError)) {
                    throw e;
                  }
                }
                this.totalPos += this.pos;
              } finally {
                _a = true;
              }
              _f.label = 4;
            case 4:
              return [3, 2];
            case 5:
              return [3, 12];
            case 6:
              e_1_1 = _f.sent();
              e_1 = { error: e_1_1 };
              return [3, 12];
            case 7:
              _f.trys.push([7, , 10, 11]);
              if (!(!_a && !_b && (_c = stream_1.return))) return [3, 9];
              return [4, _c.call(stream_1)];
            case 8:
              _f.sent();
              _f.label = 9;
            case 9:
              return [3, 11];
            case 10:
              if (e_1) throw e_1.error;
              return [
                7
                /*endfinally*/
              ];
            case 11:
              return [
                7
                /*endfinally*/
              ];
            case 12:
              if (decoded) {
                if (this.hasRemaining(1)) {
                  throw this.createExtraByteError(this.totalPos);
                }
                return [2, object];
              }
              _e = this, headByte = _e.headByte, pos = _e.pos, totalPos = _e.totalPos;
              throw new RangeError("Insufficient data in parsing ".concat(prettyByte(headByte), " at ").concat(totalPos, " (").concat(pos, " in the current buffer)"));
          }
        });
      });
    };
    Decoder2.prototype.decodeArrayStream = function(stream) {
      return this.decodeMultiAsync(stream, true);
    };
    Decoder2.prototype.decodeStream = function(stream) {
      return this.decodeMultiAsync(stream, false);
    };
    Decoder2.prototype.decodeMultiAsync = function(stream, isArray) {
      return __asyncGenerator(this, arguments, function decodeMultiAsync_1() {
        var isArrayHeaderRequired, arrayItemsLeft, _a, stream_2, stream_2_1, buffer, e_2, e_3_1;
        var _b, e_3, _c, _d;
        return __generator(this, function(_e) {
          switch (_e.label) {
            case 0:
              isArrayHeaderRequired = isArray;
              arrayItemsLeft = -1;
              _e.label = 1;
            case 1:
              _e.trys.push([1, 15, 16, 21]);
              _a = true, stream_2 = __asyncValues(stream);
              _e.label = 2;
            case 2:
              return [4, __await(stream_2.next())];
            case 3:
              if (!(stream_2_1 = _e.sent(), _b = stream_2_1.done, !_b)) return [3, 14];
              _d = stream_2_1.value;
              _a = false;
              _e.label = 4;
            case 4:
              _e.trys.push([4, , 12, 13]);
              buffer = _d;
              if (isArray && arrayItemsLeft === 0) {
                throw this.createExtraByteError(this.totalPos);
              }
              this.appendBuffer(buffer);
              if (isArrayHeaderRequired) {
                arrayItemsLeft = this.readArraySize();
                isArrayHeaderRequired = false;
                this.complete();
              }
              _e.label = 5;
            case 5:
              _e.trys.push([5, 10, , 11]);
              _e.label = 6;
            case 6:
              if (false) return [3, 9];
              return [4, __await(this.doDecodeSync())];
            case 7:
              return [4, _e.sent()];
            case 8:
              _e.sent();
              if (--arrayItemsLeft === 0) {
                return [3, 9];
              }
              return [3, 6];
            case 9:
              return [3, 11];
            case 10:
              e_2 = _e.sent();
              if (!(e_2 instanceof DataViewIndexOutOfBoundsError)) {
                throw e_2;
              }
              return [3, 11];
            case 11:
              this.totalPos += this.pos;
              return [3, 13];
            case 12:
              _a = true;
              return [
                7
                /*endfinally*/
              ];
            case 13:
              return [3, 2];
            case 14:
              return [3, 21];
            case 15:
              e_3_1 = _e.sent();
              e_3 = { error: e_3_1 };
              return [3, 21];
            case 16:
              _e.trys.push([16, , 19, 20]);
              if (!(!_a && !_b && (_c = stream_2.return))) return [3, 18];
              return [4, __await(_c.call(stream_2))];
            case 17:
              _e.sent();
              _e.label = 18;
            case 18:
              return [3, 20];
            case 19:
              if (e_3) throw e_3.error;
              return [
                7
                /*endfinally*/
              ];
            case 20:
              return [
                7
                /*endfinally*/
              ];
            case 21:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    Decoder2.prototype.doDecodeSync = function() {
      DECODE: while (true) {
        var headByte = this.readHeadByte();
        var object = void 0;
        if (headByte >= 224) {
          object = headByte - 256;
        } else if (headByte < 192) {
          if (headByte < 128) {
            object = headByte;
          } else if (headByte < 144) {
            var size = headByte - 128;
            if (size !== 0) {
              this.pushMapState(size);
              this.complete();
              continue DECODE;
            } else {
              object = {};
            }
          } else if (headByte < 160) {
            var size = headByte - 144;
            if (size !== 0) {
              this.pushArrayState(size);
              this.complete();
              continue DECODE;
            } else {
              object = [];
            }
          } else {
            var byteLength = headByte - 160;
            object = this.decodeUtf8String(byteLength, 0);
          }
        } else if (headByte === 192) {
          object = null;
        } else if (headByte === 194) {
          object = false;
        } else if (headByte === 195) {
          object = true;
        } else if (headByte === 202) {
          object = this.readF32();
        } else if (headByte === 203) {
          object = this.readF64();
        } else if (headByte === 204) {
          object = this.readU8();
        } else if (headByte === 205) {
          object = this.readU16();
        } else if (headByte === 206) {
          object = this.readU32();
        } else if (headByte === 207) {
          if (this.useBigInt64) {
            object = this.readU64AsBigInt();
          } else {
            object = this.readU64();
          }
        } else if (headByte === 208) {
          object = this.readI8();
        } else if (headByte === 209) {
          object = this.readI16();
        } else if (headByte === 210) {
          object = this.readI32();
        } else if (headByte === 211) {
          if (this.useBigInt64) {
            object = this.readI64AsBigInt();
          } else {
            object = this.readI64();
          }
        } else if (headByte === 217) {
          var byteLength = this.lookU8();
          object = this.decodeUtf8String(byteLength, 1);
        } else if (headByte === 218) {
          var byteLength = this.lookU16();
          object = this.decodeUtf8String(byteLength, 2);
        } else if (headByte === 219) {
          var byteLength = this.lookU32();
          object = this.decodeUtf8String(byteLength, 4);
        } else if (headByte === 220) {
          var size = this.readU16();
          if (size !== 0) {
            this.pushArrayState(size);
            this.complete();
            continue DECODE;
          } else {
            object = [];
          }
        } else if (headByte === 221) {
          var size = this.readU32();
          if (size !== 0) {
            this.pushArrayState(size);
            this.complete();
            continue DECODE;
          } else {
            object = [];
          }
        } else if (headByte === 222) {
          var size = this.readU16();
          if (size !== 0) {
            this.pushMapState(size);
            this.complete();
            continue DECODE;
          } else {
            object = {};
          }
        } else if (headByte === 223) {
          var size = this.readU32();
          if (size !== 0) {
            this.pushMapState(size);
            this.complete();
            continue DECODE;
          } else {
            object = {};
          }
        } else if (headByte === 196) {
          var size = this.lookU8();
          object = this.decodeBinary(size, 1);
        } else if (headByte === 197) {
          var size = this.lookU16();
          object = this.decodeBinary(size, 2);
        } else if (headByte === 198) {
          var size = this.lookU32();
          object = this.decodeBinary(size, 4);
        } else if (headByte === 212) {
          object = this.decodeExtension(1, 0);
        } else if (headByte === 213) {
          object = this.decodeExtension(2, 0);
        } else if (headByte === 214) {
          object = this.decodeExtension(4, 0);
        } else if (headByte === 215) {
          object = this.decodeExtension(8, 0);
        } else if (headByte === 216) {
          object = this.decodeExtension(16, 0);
        } else if (headByte === 199) {
          var size = this.lookU8();
          object = this.decodeExtension(size, 1);
        } else if (headByte === 200) {
          var size = this.lookU16();
          object = this.decodeExtension(size, 2);
        } else if (headByte === 201) {
          var size = this.lookU32();
          object = this.decodeExtension(size, 4);
        } else {
          throw new DecodeError("Unrecognized type byte: ".concat(prettyByte(headByte)));
        }
        this.complete();
        var stack = this.stack;
        while (stack.length > 0) {
          var state = stack[stack.length - 1];
          if (state.type === STATE_ARRAY) {
            state.array[state.position] = object;
            state.position++;
            if (state.position === state.size) {
              stack.pop();
              object = state.array;
            } else {
              continue DECODE;
            }
          } else if (state.type === STATE_MAP_KEY) {
            if (!isValidMapKeyType(object)) {
              throw new DecodeError("The type of key must be string or number but " + typeof object);
            }
            if (object === "__proto__") {
              throw new DecodeError("The key __proto__ is not allowed");
            }
            state.key = object;
            state.type = STATE_MAP_VALUE;
            continue DECODE;
          } else {
            state.map[state.key] = object;
            state.readCount++;
            if (state.readCount === state.size) {
              stack.pop();
              object = state.map;
            } else {
              state.key = null;
              state.type = STATE_MAP_KEY;
              continue DECODE;
            }
          }
        }
        return object;
      }
    };
    Decoder2.prototype.readHeadByte = function() {
      if (this.headByte === HEAD_BYTE_REQUIRED) {
        this.headByte = this.readU8();
      }
      return this.headByte;
    };
    Decoder2.prototype.complete = function() {
      this.headByte = HEAD_BYTE_REQUIRED;
    };
    Decoder2.prototype.readArraySize = function() {
      var headByte = this.readHeadByte();
      switch (headByte) {
        case 220:
          return this.readU16();
        case 221:
          return this.readU32();
        default: {
          if (headByte < 160) {
            return headByte - 144;
          } else {
            throw new DecodeError("Unrecognized array type byte: ".concat(prettyByte(headByte)));
          }
        }
      }
    };
    Decoder2.prototype.pushMapState = function(size) {
      if (size > this.maxMapLength) {
        throw new DecodeError("Max length exceeded: map length (".concat(size, ") > maxMapLengthLength (").concat(this.maxMapLength, ")"));
      }
      this.stack.push({
        type: STATE_MAP_KEY,
        size,
        key: null,
        readCount: 0,
        map: {}
      });
    };
    Decoder2.prototype.pushArrayState = function(size) {
      if (size > this.maxArrayLength) {
        throw new DecodeError("Max length exceeded: array length (".concat(size, ") > maxArrayLength (").concat(this.maxArrayLength, ")"));
      }
      this.stack.push({
        type: STATE_ARRAY,
        size,
        array: new Array(size),
        position: 0
      });
    };
    Decoder2.prototype.decodeUtf8String = function(byteLength, headerOffset) {
      var _a;
      if (byteLength > this.maxStrLength) {
        throw new DecodeError("Max length exceeded: UTF-8 byte length (".concat(byteLength, ") > maxStrLength (").concat(this.maxStrLength, ")"));
      }
      if (this.bytes.byteLength < this.pos + headerOffset + byteLength) {
        throw MORE_DATA;
      }
      var offset = this.pos + headerOffset;
      var object;
      if (this.stateIsMapKey() && ((_a = this.keyDecoder) === null || _a === void 0 ? void 0 : _a.canBeCached(byteLength))) {
        object = this.keyDecoder.decode(this.bytes, offset, byteLength);
      } else {
        object = utf8Decode(this.bytes, offset, byteLength);
      }
      this.pos += headerOffset + byteLength;
      return object;
    };
    Decoder2.prototype.stateIsMapKey = function() {
      if (this.stack.length > 0) {
        var state = this.stack[this.stack.length - 1];
        return state.type === STATE_MAP_KEY;
      }
      return false;
    };
    Decoder2.prototype.decodeBinary = function(byteLength, headOffset) {
      if (byteLength > this.maxBinLength) {
        throw new DecodeError("Max length exceeded: bin length (".concat(byteLength, ") > maxBinLength (").concat(this.maxBinLength, ")"));
      }
      if (!this.hasRemaining(byteLength + headOffset)) {
        throw MORE_DATA;
      }
      var offset = this.pos + headOffset;
      var object = this.bytes.subarray(offset, offset + byteLength);
      this.pos += headOffset + byteLength;
      return object;
    };
    Decoder2.prototype.decodeExtension = function(size, headOffset) {
      if (size > this.maxExtLength) {
        throw new DecodeError("Max length exceeded: ext length (".concat(size, ") > maxExtLength (").concat(this.maxExtLength, ")"));
      }
      var extType = this.view.getInt8(this.pos + headOffset);
      var data = this.decodeBinary(
        size,
        headOffset + 1
        /* extType */
      );
      return this.extensionCodec.decode(data, extType, this.context);
    };
    Decoder2.prototype.lookU8 = function() {
      return this.view.getUint8(this.pos);
    };
    Decoder2.prototype.lookU16 = function() {
      return this.view.getUint16(this.pos);
    };
    Decoder2.prototype.lookU32 = function() {
      return this.view.getUint32(this.pos);
    };
    Decoder2.prototype.readU8 = function() {
      var value = this.view.getUint8(this.pos);
      this.pos++;
      return value;
    };
    Decoder2.prototype.readI8 = function() {
      var value = this.view.getInt8(this.pos);
      this.pos++;
      return value;
    };
    Decoder2.prototype.readU16 = function() {
      var value = this.view.getUint16(this.pos);
      this.pos += 2;
      return value;
    };
    Decoder2.prototype.readI16 = function() {
      var value = this.view.getInt16(this.pos);
      this.pos += 2;
      return value;
    };
    Decoder2.prototype.readU32 = function() {
      var value = this.view.getUint32(this.pos);
      this.pos += 4;
      return value;
    };
    Decoder2.prototype.readI32 = function() {
      var value = this.view.getInt32(this.pos);
      this.pos += 4;
      return value;
    };
    Decoder2.prototype.readU64 = function() {
      var value = getUint64(this.view, this.pos);
      this.pos += 8;
      return value;
    };
    Decoder2.prototype.readI64 = function() {
      var value = getInt64(this.view, this.pos);
      this.pos += 8;
      return value;
    };
    Decoder2.prototype.readU64AsBigInt = function() {
      var value = this.view.getBigUint64(this.pos);
      this.pos += 8;
      return value;
    };
    Decoder2.prototype.readI64AsBigInt = function() {
      var value = this.view.getBigInt64(this.pos);
      this.pos += 8;
      return value;
    };
    Decoder2.prototype.readF32 = function() {
      var value = this.view.getFloat32(this.pos);
      this.pos += 4;
      return value;
    };
    Decoder2.prototype.readF64 = function() {
      var value = this.view.getFloat64(this.pos);
      this.pos += 8;
      return value;
    };
    return Decoder2;
  }()
);

// ../../node_modules/@msgpack/msgpack/dist.es5+esm/decode.mjs
function decode(buffer, options) {
  var decoder = new Decoder(options);
  return decoder.decode(buffer);
}

// dist/graph.js
function supplant(s, o) {
  return s.replace(/{([^{}]*)}/g, function(a, b) {
    const r = o[b];
    return typeof r === "string" || typeof r === "number" ? r : a;
  });
}
var isTouchDevice = () => {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
};
var Graph = class {
  constructor(elem, opts) {
    this.elem = elem;
    this.opts = opts;
    this.numSeries = this.opts.seriesNames.length;
    this.cache = new Cache(this.numSeries, this.opts.maxGapMs ?? 60 * 1e3);
    this.opts.strokeWidth = this.opts.strokeWidth || 3;
    this.windowSize = this.opts.windowSize;
    this.t0Server = void 0;
    this.t0Client = void 0;
    const labels = ["x"];
    for (let i = 0; i < this.numSeries; i++) {
      labels.push(`y${i + 1}`);
    }
    this.labels = labels;
    this.dygraph = this.makeGraph();
    this.connect();
  }
  onDraw(g) {
    if (!this.opts.drawCallback) {
      return;
    }
    const [loDate, hiDate] = g.xAxisRange();
    const [lo, hi] = [loDate.getTime(), hiDate.getTime()];
    this.opts.drawCallback(lo, hi);
  }
  makeGraph() {
    let opts = {
      title: supplant(this.opts.title, { value: "" }),
      ylabel: this.opts.ylabel,
      labels: this.labels,
      includeZero: this.opts.includeZero,
      strokeWidth: this.opts.strokeWidth,
      dateWindow: this.computeDateWindow(),
      height: this.opts.height,
      rightGap: 5,
      connectSeparatedPoints: true,
      valueRange: this.opts.valueRange,
      series: this.opts.series,
      drawCallback: this.onDraw.bind(this)
    };
    if (this.disableInteraction()) {
      opts.interactionModel = {};
    }
    const dummyRow = [/* @__PURE__ */ new Date()].concat(new Array(this.numSeries).fill(NaN));
    return new dygraph_default(this.elem, [dummyRow], opts);
  }
  disableInteraction() {
    return isTouchDevice();
  }
  computeDateWindow() {
    if (this.windowSize === void 0 || this.windowSize === null) {
      return void 0;
    }
    const t1Client = /* @__PURE__ */ new Date();
    if (this.t0Client === void 0 || this.t0Server === void 0) {
      return [
        new Date(t1Client.getTime() - this.windowSize),
        t1Client
      ];
    }
    const dt = t1Client.getTime() - this.t0Client.getTime();
    const t1 = new Date(this.t0Server.getTime() + dt);
    const t0 = new Date(t1.getTime() - this.windowSize);
    return [t0, t1];
  }
  update(series) {
    if (series.length == 0) {
      return;
    }
    this.cache.append(series);
    let updateOpts = {
      file: this.cache.getData(),
      labels: this.labels
    };
    for (let i = 0; i < series.length; i++) {
      const s = series[i];
      if (s.Pos === 0) {
        const lastValue = s.Values[s.Values.length - 1];
        updateOpts.title = supplant(this.opts.title, { value: lastValue.toFixed(2) });
        break;
      }
    }
    this.dygraph.updateOptions(updateOpts);
  }
  setDateWindow(window2) {
    this.dygraph.updateOptions({
      dateWindow: window2
    });
  }
  setDate(date) {
    const firstSet = this.t0Server === void 0;
    this.t0Server = date;
    this.t0Client = /* @__PURE__ */ new Date();
    if (firstSet) {
      this.scroll();
    }
  }
  scroll() {
    if (this.opts.disableScroll) {
      return;
    }
    setInterval(() => {
      if (this.dygraph === null) {
        return;
      }
      this.dygraph.updateOptions({
        dateWindow: this.computeDateWindow()
      });
    }, 250);
  }
  getLastTimestamp() {
    const data = this.cache.getData();
    if (data.length === 0) {
      return void 0;
    }
    const lastPoint = data[data.length - 1];
    return lastPoint[0].getTime();
  }
  connect() {
    const url = `ws://${window.location.hostname}:${window.location.port}/ws`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (message) => {
      this.elem.classList.remove("rtgraph-disconnected");
      if (message.data instanceof ArrayBuffer) {
        const msg = decode(new Uint8Array(message.data));
        if (msg.error !== void 0) {
          alert(msg.error);
          return;
        }
        if (msg.now !== void 0) {
          this.setDate(new Date(msg.now));
        }
        if (msg.rows !== void 0) {
          this.update(msg.rows);
        }
      }
    };
    ws.onopen = (event) => {
      setTimeout(() => {
        let lastPointMs = this.getLastTimestamp();
        ws.send(JSON.stringify({
          series: this.opts.seriesNames,
          windowSize: this.windowSize || 0,
          lastPointMs,
          maxGapMs: this.opts.maxGapMs || 60 * 1e3,
          // 60 seconds in ms
          date: this.opts.date
        }));
      });
    };
    ws.onerror = (err) => {
      ws.close();
    };
    ws.onclose = (err) => {
      this.elem.classList.add("rtgraph-disconnected");
      this.reconnect();
    };
  }
  reconnect() {
    setTimeout(() => this.connect(), 1e3);
  }
};

// dist/synchronizer.js
var synchronize = function synchronize2() {
  if (arguments.length === 0) {
    throw "Invalid invocation of synchronize(). Need >= 1 argument.";
  }
  var OPTIONS = ["selection", "zoom", "range"];
  var opts = {
    selection: true,
    zoom: true,
    range: true
  };
  var dygraphs = [];
  var prevCallbacks = [];
  var parseOpts = function parseOpts2(obj) {
    if (!(obj instanceof Object)) {
      throw "Last argument must be either Dygraph or Object.";
    } else {
      for (var i2 = 0; i2 < OPTIONS.length; i2++) {
        var optName = OPTIONS[i2];
        if (obj.hasOwnProperty(optName))
          opts[optName] = obj[optName];
      }
    }
  };
  if (arguments[0] instanceof dygraph_default) {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] instanceof dygraph_default) {
        dygraphs.push(arguments[i]);
      } else {
        break;
      }
    }
    if (i < arguments.length - 1) {
      throw "Invalid invocation of synchronize(). All but the last argument must be Dygraph objects.";
    } else if (i == arguments.length - 1) {
      parseOpts(arguments[arguments.length - 1]);
    }
  } else if (arguments[0].length) {
    for (var i = 0; i < arguments[0].length; i++) {
      dygraphs.push(arguments[0][i]);
    }
    if (arguments.length == 2) {
      parseOpts(arguments[1]);
    } else if (arguments.length > 2) {
      throw "Invalid invocation of synchronize(). Expected two arguments: array and optional options argument.";
    }
  } else {
    throw "Invalid invocation of synchronize(). First parameter must be either Dygraph or list of Dygraphs.";
  }
  if (dygraphs.length < 2) {
    throw "Invalid invocation of synchronize(). Need two or more dygraphs to synchronize.";
  }
  var readycount = dygraphs.length;
  for (var i = 0; i < dygraphs.length; i++) {
    var g = dygraphs[i];
    g.ready(function onReady_() {
      if (--readycount == 0) {
        var callBackTypes = ["drawCallback", "highlightCallback", "unhighlightCallback"];
        for (var j = 0; j < dygraphs.length; j++) {
          if (!prevCallbacks[j]) {
            prevCallbacks[j] = {};
          }
          for (var k = callBackTypes.length - 1; k >= 0; k--) {
            prevCallbacks[j][callBackTypes[k]] = dygraphs[j].getFunctionOption(callBackTypes[k]);
          }
        }
        if (opts.zoom) {
          attachZoomHandlers(dygraphs, opts, prevCallbacks);
        }
        if (opts.selection) {
          attachSelectionHandlers(dygraphs, prevCallbacks);
        }
      }
    });
  }
  return {
    detach: function detach() {
      for (var i2 = 0; i2 < dygraphs.length; i2++) {
        var g2 = dygraphs[i2];
        if (opts.zoom) {
          g2.updateOptions({ drawCallback: prevCallbacks[i2].drawCallback });
        }
        if (opts.selection) {
          g2.updateOptions({
            highlightCallback: prevCallbacks[i2].highlightCallback,
            unhighlightCallback: prevCallbacks[i2].unhighlightCallback
          });
        }
      }
      dygraphs = null;
      opts = null;
      prevCallbacks = null;
    }
  };
};
function arraysAreEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b))
    return false;
  var i = a.length;
  if (i !== b.length)
    return false;
  while (i--) {
    if (a[i] !== b[i])
      return false;
  }
  return true;
}
function attachZoomHandlers(gs, syncOpts, prevCallbacks) {
  var block = false;
  for (var i = 0; i < gs.length; i++) {
    var g = gs[i];
    g.updateOptions(
      {
        drawCallback: function synchronizer_drawCallback(me, initial) {
          if (block || initial) {
            for (let j = 0; j < gs.length; j++) {
              if (gs[j] == me) {
                if (prevCallbacks[j] && prevCallbacks[j].drawCallback) {
                  prevCallbacks[j].drawCallback.apply(this, arguments);
                }
                break;
              }
            }
            return;
          }
          block = true;
          var opts = {
            dateWindow: me.xAxisRange()
          };
          if (!me.isZoomed("x"))
            opts.dateWindow = null;
          if (syncOpts.range)
            opts.valueRange = me.yAxisRange();
          for (let j = 0; j < gs.length; j++) {
            if (gs[j] == me) {
              if (prevCallbacks[j] && prevCallbacks[j].drawCallback) {
                prevCallbacks[j].drawCallback.apply(this, arguments);
              }
              continue;
            }
            if (arraysAreEqual(opts.dateWindow, gs[j].getOption("dateWindow")) && (!syncOpts.range || arraysAreEqual(opts.valueRange, gs[j].getOption("valueRange")))) {
              continue;
            }
            gs[j].updateOptions(opts);
          }
          block = false;
        }
      },
      true
      /* no need to redraw */
    );
  }
}
function attachSelectionHandlers(gs, prevCallbacks) {
  var block = false;
  for (var i = 0; i < gs.length; i++) {
    var g = gs[i];
    g.updateOptions(
      {
        highlightCallback: function synchronizer_highlightCallback(event, x, points, row, seriesName) {
          if (block)
            return;
          block = true;
          var me = this;
          for (var i2 = 0; i2 < gs.length; i2++) {
            if (me == gs[i2]) {
              if (prevCallbacks[i2] && prevCallbacks[i2].highlightCallback) {
                prevCallbacks[i2].highlightCallback.apply(this, arguments);
              }
              continue;
            }
            var idx = gs[i2].getRowForX(x);
            if (idx !== null) {
              gs[i2].setSelection(idx, seriesName, void 0, true);
            }
          }
          block = false;
        },
        unhighlightCallback: function synchronizer_unhighlightCallback(event) {
          if (block)
            return;
          block = true;
          var me = this;
          for (var i2 = 0; i2 < gs.length; i2++) {
            if (me == gs[i2]) {
              if (prevCallbacks[i2] && prevCallbacks[i2].unhighlightCallback) {
                prevCallbacks[i2].unhighlightCallback.apply(this, arguments);
              }
              continue;
            }
            gs[i2].clearSelection();
          }
          block = false;
        }
      },
      true
      /* no need to redraw */
    );
  }
}
var synchronizer_default = synchronize;
export {
  Graph,
  synchronizer_default as synchronize
};
/**
 * @license
 * Part of dygraphs, see top-level LICENSE.txt file
 * MIT-licenced: https://opensource.org/licenses/MIT
 */
/*! Bundled license information:

dygraphs/src/dygraph-tickers.js:
  (**
   * @license
   * Copyright 2011 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/dygraph-utils.js:
  (**
   * @license
   * Copyright 2011 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/dygraph-layout.js:
  (**
   * @license
   * Copyright 2011 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/dygraph-canvas.js:
  (**
   * @license
   * Copyright 2006 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/dygraph-interaction-model.js:
  (**
   * @license
   * Copyright 2011 Robert Konigsberg (konigsberg@google.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/dygraph-options-reference.js:
  (**
   * @license
   * Copyright 2011 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/dygraph-options.js:
  (**
   * @license
   * Copyright 2011 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/datahandler/datahandler.js:
  (**
   * @license
   * Copyright 2013 David Eberlein (david.eberlein@ch.sauter-bc.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/datahandler/default.js:
  (**
   * @license
   * Copyright 2013 David Eberlein (david.eberlein@ch.sauter-bc.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/datahandler/bars.js:
  (**
   * @license
   * Copyright 2013 David Eberlein (david.eberlein@ch.sauter-bc.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/datahandler/bars-error.js:
  (**
   * @license
   * Copyright 2013 David Eberlein (david.eberlein@ch.sauter-bc.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/datahandler/bars-custom.js:
  (**
   * @license
   * Copyright 2013 David Eberlein (david.eberlein@ch.sauter-bc.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/datahandler/default-fractions.js:
  (**
   * @license
   * Copyright 2013 David Eberlein (david.eberlein@ch.sauter-bc.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/datahandler/bars-fractions.js:
  (**
   * @license
   * Copyright 2013 David Eberlein (david.eberlein@ch.sauter-bc.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/plugins/annotations.js:
  (**
   * @license
   * Copyright 2012 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/plugins/axes.js:
  (**
   * @license
   * Copyright 2012 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/plugins/chart-labels.js:
  (**
   * @license
   * Copyright 2012 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/plugins/grid.js:
  (**
   * @license
   * Copyright 2012 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/plugins/legend.js:
  (**
   * @license
   * Copyright 2012 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/plugins/range-selector.js:
  (**
   * @license
   * Copyright 2011 Paul Felix (paul.eric.felix@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/dygraph-gviz.js:
  (**
   * @license
   * Copyright 2011 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)

dygraphs/src/dygraph.js:
  (**
   * @license
   * Copyright 2006 Dan Vanderkam (danvdk@gmail.com)
   * MIT-licenced: https://opensource.org/licenses/MIT
   *)
*/
