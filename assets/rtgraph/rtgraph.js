// @ts-ignore
import { Cache } from "../combine.js";
function supplant(s, o) {
    // https://stackoverflow.com/questions/1408289/how-can-i-do-string-interpolation-in-javascript
    return s.replace(/{([^{}]*)}/g, function (a, b) {
        const r = o[b];
        return typeof r === 'string' || typeof r === 'number' ? r : a;
    });
}
const isTouchDevice = () => {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0));
};
export class Graph {
    constructor(elem, opts) {
        var _a;
        this.elem = elem;
        this.opts = opts;
        this.cache = new Cache(this.opts.seriesNames.length, (_a = this.opts.maxGapMs) !== null && _a !== void 0 ? _a : 60 * 1000);
        if (this.opts.labels === undefined || this.opts.labels === null) {
            throw new Error("labels not given");
        }
        this.opts.strokeWidth = this.opts.strokeWidth || 3.0;
        this.windowSize = this.opts.windowSize;
        this.g = null;
        this.data = [];
        this.t0Server = undefined;
        this.t0Client = undefined;
        this.connect();
    }
    disableInteraction() {
        return isTouchDevice();
    }
    computeDateWindow() {
        if (this.windowSize === undefined || this.windowSize === null) {
            return undefined;
        }
        // TODO: perhaps we need to raise an error here instead
        if (this.t0Client === undefined || this.t0Server === undefined) {
            return undefined;
        }
        const t1Client = new Date();
        const dt = t1Client.getTime() - this.t0Client.getTime();
        const t1 = new Date(this.t0Server.getTime() + dt);
        const t0 = new Date(t1.getTime() - this.windowSize);
        return [t0, t1];
    }
    ;
    computeLabels() {
        return this.data.length > 0 ? this.opts.labels : [];
    }
    // TODO: get data schema for newRows
    update(newRows) {
        const newGraph = this.data.length === 0;
        if (this.opts.reorderData === true) {
            this.data.push(...newRows);
            // TODO: can probably do better here with binary search and array splice
            this.data.sort((a, b) => {
                return a[0] - b[0];
            });
        }
        else {
            if (this.data.length === 0) {
                this.cache.interleave(newRows);
                this.data = this.cache.data;
            }
            else {
                this.cache.append(newRows);
                this.data = this.cache.data;
            }
        }
        if (newGraph) {
            let labels = this.computeLabels();
            let opts = {
                // dateWindow: [t0, t1],
                title: supplant(this.opts.title, { value: "" }), // TODO: do better here
                ylabel: this.opts.ylabel,
                labels: labels,
                includeZero: this.opts.includeZero,
                strokeWidth: this.opts.strokeWidth,
                dateWindow: this.computeDateWindow(),
                height: this.opts.height,
                rightGap: 5,
                connectSeparatedPoints: true,
                valueRange: this.opts.valueRange,
                series: this.opts.series,
            };
            if (this.disableInteraction()) {
                opts.interactionModel = {};
            }
            this.g = new Dygraph(this.elem, this.data, opts);
        }
        else {
            let updateOpts = {
                file: this.data,
                labels: this.computeLabels()
            };
            // update the title if needed
            if (newRows.length > 0) {
                let lastRow = newRows[newRows.length - 1];
                const lastValue = lastRow[1]; // for now use the first Y value
                if (lastValue !== null && lastValue !== undefined) {
                    updateOpts.title = supplant(this.opts.title, { value: lastValue.toFixed(2) });
                }
            }
            this.g.updateOptions(updateOpts);
        }
    }
    setDate(date) {
        const firstSet = this.t0Server === undefined;
        this.t0Server = date;
        this.t0Client = new Date();
        if (firstSet) {
            this.scroll();
        }
    }
    scroll() {
        if (this.opts.disableScroll) {
            return;
        }
        setInterval(() => {
            if (this.g === undefined) {
                return;
            }
            this.g.updateOptions({
                dateWindow: this.computeDateWindow(),
            });
        }, 250);
    }
    getLastPoint() {
        if (this.data.length === 0) {
            return undefined;
        }
        const lastPoint = this.data[this.data.length - 1];
        return lastPoint[0].getTime();
    }
    connect() {
        const url = `ws://${window.location.hostname}:${window.location.port}/ws`;
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        ws.onmessage = message => {
            this.elem.classList.remove("rtgraph-disconnected");
            if (message.data instanceof ArrayBuffer) {
                const msg = msgpack.decode(new Uint8Array(message.data));
                if (msg.error !== undefined) {
                    alert(msg.error);
                    return;
                }
                if (msg.now !== undefined) {
                    // handle case when client and server times don't match
                    this.setDate(new Date(msg.now));
                }
                if (msg.rows !== undefined) {
                    this.update(msg.rows);
                }
            }
        };
        ws.onopen = event => {
            setTimeout(() => {
                let lastPointMs = this.getLastPoint();
                ws.send(JSON.stringify({
                    series: this.opts.seriesNames,
                    windowSize: this.windowSize || 0,
                    lastPointMs: lastPointMs,
                    maxGapMs: this.opts.maxGapMs || 60 * 1000 // 60 seconds in ms
                }));
            });
        };
        ws.onerror = err => {
            ws.close();
        };
        ws.onclose = err => {
            this.elem.classList.add("rtgraph-disconnected");
            this.reconnect();
        };
    }
    reconnect() {
        setTimeout(() => this.connect(), 1000);
    }
}
