import { Series } from "./combine.js";
import Dygraph from 'dygraphs';
export type DrawCallbackArgs = {
    lo: number;
    hi: number;
    indices: [number, number][];
    series: Series[];
};
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
    series?: {
        [key: string]: any;
    };
    disableScroll?: boolean;
    date: string | null;
    drawCallback?: (args: DrawCallbackArgs) => void;
};
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
    constructor(elem: HTMLElement, opts: GraphOptions);
    private onDraw;
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
