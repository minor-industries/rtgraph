import {Cache, Series} from "./combine.js"
import Dygraph from 'dygraphs';
import {binarySearch} from "./binary_search.js";
import {Msg} from "./connection.js";
import {WSConn} from "./ws.js";


function supplant(s: string, o: any) {
    // https://stackoverflow.com/questions/1408289/how-can-i-do-string-interpolation-in-javascript
    return s.replace(/{([^{}]*)}/g,
        function (a, b) {
            const r = o[b];
            return typeof r === 'string' || typeof r === 'number' ? r as string : a;
        }
    );
}

const isTouchDevice = () => {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0));
};

export type DrawCallbackArgs = {
    lo: number
    hi: number
    indices: [number, number][]
    series: Series[]
}

export type GraphOptions = {
    title: string;
    ylabel?: string;
    seriesNames: string[];
    maxGapMs?: number;
    strokeWidth?: number;
    windowSize: number | null;
    includeZero?: boolean;
    height?: number;
    valueRange?: [number, number];
    series?: { [key: string]: any };
    disableScroll?: boolean;
    date: string | null;
    drawCallback?: (args: DrawCallbackArgs) => void;
    connect?: boolean;
};

export type SubscriptionRequest = {
    series: string[]
    windowSize?: number,
    lastPointMs?: number,
    date: string | null,
}

export class Graph {
    private readonly elem: HTMLElement;
    private readonly opts: GraphOptions;
    private readonly numSeries: number;
    private readonly windowSize: number | null;
    dygraph: typeof Dygraph;
    private readonly cache: Cache;
    private readonly labels: string[];
    private t0Server: Date | undefined;
    private t0Client: Date | undefined;

    constructor(
        elem: HTMLElement,
        opts: GraphOptions
    ) {
        this.elem = elem;
        this.opts = opts;
        this.numSeries = this.opts.seriesNames.length;
        this.cache = new Cache(
            this.numSeries,
            this.opts.maxGapMs ?? 60 * 1000
        );

        this.opts.strokeWidth = this.opts.strokeWidth || 3.0;
        this.windowSize = this.opts.windowSize;

        this.t0Server = undefined;
        this.t0Client = undefined;

        if (this.opts.connect === undefined) {
            this.opts.connect = true;
        }

        const labels: string[] = ["x"];
        for (let i = 0; i < this.numSeries; i++) {
            labels.push(`y${i + 1}`);
        }
        this.labels = labels;

        this.dygraph = this.makeGraph();
        if (this.opts.connect) {
            this.connect();
        } else {
            this.setDate(new Date());
        }
    }

    private onDraw(g: typeof Dygraph) {
        if (!this.opts.drawCallback) {
            return;
        }

        const range: [number | Date, number | Date] = (g as any).xAxisRange();
        const mapped = range.map((x: number | Date) => (x instanceof Date) ? x.getTime() : x);
        const lo = mapped[0];
        const hi = mapped[1];

        const series = this.cache.getSeries();

        const indices: [number, number][] = new Array(series.length);

        for (let i = 0; i < series.length; i++) {
            const ts = series[i].Timestamps;
            if (ts.length === 0) {
                indices[i] = [-1, -1];
                continue;
            }

            const t0 = ts[0];
            const tn = ts[ts.length - 1];

            if (t0 > hi || tn < lo) {
                indices[i] = [-1, -1];
                continue;
            }

            const i0 = binarySearch(ts, 0, x => x >= lo);
            const i1 = binarySearch(ts, ts.length, x => hi < x);

            indices[i] = [i0, i1];
        }

        this.opts.drawCallback({lo, hi, indices, series});
    }

    private makeGraph(): typeof Dygraph {
        let opts: { [key: string]: any } = {
            title: supplant(this.opts.title, {value: ""}),
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
            drawCallback: this.onDraw.bind(this),
        };

        if (this.disableInteraction()) {
            opts.interactionModel = {};
        }

        const dummyRow = [new Date()].concat(new Array(this.numSeries).fill(NaN));
        return new (Dygraph as any)(this.elem, [dummyRow], opts);
    }

    private disableInteraction() {
        return isTouchDevice();
    }

    private computeDateWindow(): [Date, Date] | undefined {
        if (this.windowSize === undefined || this.windowSize === null) {
            return undefined;
        }

        const t1Client = new Date();

        if (this.t0Client === undefined || this.t0Server === undefined) {
            return [
                new Date(t1Client.getTime() - this.windowSize),
                t1Client
            ]
        }

        const dt = t1Client.getTime() - this.t0Client.getTime()
        const t1 = new Date(this.t0Server.getTime() + dt);
        const t0 = new Date(t1.getTime() - this.windowSize);
        return [t0, t1]
    };

    update(series: Series[]) {
        if (series.length == 0) {
            return;
        }

        this.cache.append(series);

        let updateOpts: { [key: string]: any } = {
            file: this.cache.getData(),
            labels: this.labels
        };

        // update the title if needed
        for (let i = 0; i < series.length; i++) {
            const s = series[i];
            if (s.Pos === 0) {
                // for now use the first Y value
                const lastValue = s.Values[s.Values.length - 1];
                updateOpts.title = supplant(this.opts.title, {value: lastValue.toFixed(2)});
                break;
            }
        }

        (this.dygraph as any).updateOptions(updateOpts);
    }

    setDateWindow(window: [Date, Date]) {
        (this.dygraph as any).updateOptions({
            dateWindow: window,
        });
    }

    private setDate(date: Date) {
        const firstSet = this.t0Server === undefined;

        this.t0Server = date;
        this.t0Client = new Date();

        if (firstSet) {
            this.scroll();
        }
    }

    private scroll() {
        if (this.opts.disableScroll) {
            return;
        }

        setInterval(() => {
            if (this.dygraph === null) {
                return;
            }
            (this.dygraph as any).updateOptions({
                dateWindow: this.computeDateWindow(),
            })
        }, 250);
    }

    private getLastTimestamp() {
        const data = this.cache.getData();
        if (data.length === 0) {
            return undefined;
        }
        const lastPoint = data[data.length - 1];
        return lastPoint[0].getTime();
    }

    subscriptionRequest(): SubscriptionRequest {
        let lastPointMs = this.getLastTimestamp();
        return {
            series: this.opts.seriesNames,
            windowSize: this.windowSize || 0,
            lastPointMs: lastPointMs,
            date: this.opts.date
        }
    }

    onmessage(msg: Msg) {
        this.elem.classList.remove("rtgraph-disconnected");

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

    onclose() {
        this.elem.classList.add("rtgraph-disconnected");
    }

    private connect() {
        const ws = new WSConn();
        ws.connect(this);
    }
}

