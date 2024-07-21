import { Series } from "./combine.js";
import Dygraph from 'dygraphs';
export declare class Graph {
    private readonly elem;
    private readonly opts;
    private readonly numSeries;
    private readonly windowSize;
    dygraph: typeof Dygraph;
    private readonly cache;
    private readonly labels;
    private t0Server;
    private t0Client;
    constructor(elem: HTMLElement, opts: {
        [key: string]: any;
    });
    private makeGraph;
    private disableInteraction;
    private computeDateWindow;
    update(series: Series[]): void;
    setDateWindow(window: [Date, Date]): void;
    private setDate;
    private scroll;
    private getLastTimestamp;
    private connect;
    private reconnect;
}
