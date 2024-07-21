import { Series } from "./combine.js";
import Dygraph from 'dygraphs';
export type GraphOptions = {
    title: number;
    ylabel?: string;
    seriesNames: string[];
    maxGapMs?: number;
    strokeWidth?: number;
    windowSize?: number;
    includeZero?: boolean;
    height?: number;
    valueRange?: [number, number];
    series?: {
        [key: string]: any;
    };
    reorderData?: boolean;
    disableScroll?: boolean;
    date?: Date;
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
