import { Cache } from "./combine.js";
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
        this.numSeries = this.opts.seriesNames.length;
        this.cache = new Cache(this.numSeries, (_a = this.opts.maxGapMs) !== null && _a !== void 0 ? _a : 60 * 1000);
        if (this.opts.labels !== undefined) {
            throw new Error("labels no longer supported");
        }
        this.opts.strokeWidth = this.opts.strokeWidth || 3.0;
        this.windowSize = this.opts.windowSize;
        this.t0Server = undefined;
        this.t0Client = undefined;
        const labels = ["x"];
        for (let i = 0; i < this.numSeries; i++) {
            labels.push(`y${i + 1}`);
        }
        this.labels = labels;
        this.dygraph = this.makeGraph();
        this.connect();
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
        };
        if (this.disableInteraction()) {
            opts.interactionModel = {};
        }
        const dummyRow = [new Date()].concat(new Array(this.numSeries).fill(NaN));
        return new Dygraph(this.elem, [dummyRow], opts);
    }
    disableInteraction() {
        return isTouchDevice();
    }
    computeDateWindow() {
        if (this.windowSize === undefined || this.windowSize === null) {
            return undefined;
        }
        const t1Client = new Date();
        if (this.t0Client === undefined || this.t0Server === undefined) {
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
    ;
    update(series) {
        if (series.length == 0) {
            return;
        }
        if (this.opts.reorderData === true) {
            throw new Error("not implemented"); // TODO
        }
        else {
            this.cache.append(series);
        }
        let updateOpts = {
            file: this.cache.getData(),
            labels: this.labels
        };
        // update the title if needed
        for (let i = 0; i < series.length; i++) {
            const s = series[i];
            if (s.Pos === 0) {
                // for now use the first Y value
                const lastValue = s.Values[s.Values.length - 1];
                updateOpts.title = supplant(this.opts.title, { value: lastValue.toFixed(2) });
                break;
            }
        }
        this.dygraph.updateOptions(updateOpts);
    }
    setDateWindow(window) {
        this.dygraph.updateOptions({
            dateWindow: window,
        });
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
            if (this.dygraph === null) {
                return;
            }
            this.dygraph.updateOptions({
                dateWindow: this.computeDateWindow(),
            });
        }, 250);
    }
    getLastTimestamp() {
        const data = this.cache.getData();
        if (data.length === 0) {
            return undefined;
        }
        const lastPoint = data[data.length - 1];
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
                let lastPointMs = this.getLastTimestamp();
                ws.send(JSON.stringify({
                    series: this.opts.seriesNames,
                    windowSize: this.windowSize || 0,
                    lastPointMs: lastPointMs,
                    maxGapMs: this.opts.maxGapMs || 60 * 1000, // 60 seconds in ms
                    date: this.opts.date
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
