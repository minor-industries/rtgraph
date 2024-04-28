declare class Dygraph {
    constructor(...args: any[])

    updateOptions(arg: any): void
}

declare module msgpack {
    export function decode(input: Uint8Array): any;
}

function mapDate([first, ...rest]: [number, ...any[]]) {
    return [new Date(first), ...rest];
}

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

class Graph {
    private readonly elem: HTMLElement;
    private opts: { [p: string]: any };
    private readonly windowSize: number;
    private g: Dygraph | null; // TODO
    private t0Server: Date | undefined;
    private t0Client: Date | undefined;
    private data: any[];

    constructor(
        elem: HTMLElement,
        opts: { [key: string]: any }
    ) {
        this.elem = elem;
        this.opts = opts;

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
        const dt = t1Client.getTime() - this.t0Client.getTime()
        const t1 = new Date(this.t0Server.getTime() + dt);
        const t0 = new Date(t1.getTime() - this.windowSize);
        return [t0, t1]
    };

    computeLabels() {
        return this.data.length > 0 ? this.opts.labels : [];
    }

    update(rows: [Date, ...any]) {
        const newGraph = this.data.length === 0;

        let newRows = rows.map(mapDate);

        this.data.push(...newRows);

        if (this.opts.reorderData === true) {
            // TODO: can probably do better here with binary search and array splice
            this.data.sort((a, b) => {
                return a[0] - b[0];
            })
        }

        if (newGraph) {
            let labels = this.computeLabels();
            let opts: { [key: string]: any } = {
                // dateWindow: [t0, t1],
                title: supplant(this.opts.title, {value: ""}), // TODO: do better here
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
        } else {
            let updateOpts: { [key: string]: any } = {
                file: this.data,
                labels: this.computeLabels()
            };

            // update the title if needed
            if (newRows.length > 0) {
                let lastRow = newRows[newRows.length - 1];
                const lastValue = lastRow[1]; // for now use the first Y value
                if (lastValue !== null && lastValue !== undefined) {
                    updateOpts.title = supplant(this.opts.title, {value: lastValue.toFixed(2)});
                }
            }

            this.g!.updateOptions(updateOpts);
        }
    }

    setDate(date: Date) {
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
            this.g!.updateOptions({
                dateWindow: this.computeDateWindow(),
            })
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
                    }
                ));
            })
        }

        ws.onerror = err => {
            ws.close();
        }

        ws.onclose = err => {
            this.elem.classList.add("rtgraph-disconnected");
            this.reconnect();
        }
    }

    reconnect() {
        setTimeout(() => this.connect(), 1000);
    }
}

export type row = [Date, ...(number | null)[]];

function findMergeIndex(existing: row[], firstExtraDate: Date) {
    let insertionIndex = existing.length - 1;
    while (insertionIndex >= 0 && existing[insertionIndex][0] >= firstExtraDate) {
        insertionIndex--;
    }
    insertionIndex++;
    return insertionIndex;
}

export function combineData(existing: row[], extra: row[]): row[] {
    if (extra.length === 0) {
        return existing;
    }

    extra.sort((a, b) => a[0].getTime() - b[0].getTime());

    const firstExtraDate = extra[0][0];
    const mergeIndex = findMergeIndex(existing, firstExtraDate);

    const slicedExisting = existing.slice(mergeIndex);
    const merged = mergeArrays(slicedExisting, extra);

    const overwriteCount = existing.length - mergeIndex;
    const appendCount = merged.length - overwriteCount;

    let mergedPos = 0;
    for (let i = 0; i < overwriteCount; i++) {
        existing[mergeIndex + i] = merged[mergedPos++];
    }

    for (let i = 0; i < appendCount; i++) {
        existing.push(merged[mergedPos++])
    }

    return existing;
}

function mergeArrays(arr1: row[], arr2: row[]): row[] {
    let result: row[] = [];
    let i = 0, j = 0;

    while (i < arr1.length && j < arr2.length) {
        const time1 = arr1[i][0];
        const time2 = arr2[j][0];

        if (time1 < time2) {
            result.push(arr1[i++]);
        } else if (time1 > time2) {
            result.push(arr2[j++]);
        } else {
            // Merge all rows at the same timestamp from both arrays
            let mergedRows = mergeAllAtSameTimestamp(arr1, arr2, time1, i, j);
            result.push(mergedRows);
            // Skip over all rows at this timestamp
            while (i < arr1.length && arr1[i][0].getTime() === time1.getTime()) i++;
            while (j < arr2.length && arr2[j][0].getTime() === time1.getTime()) j++;
        }
    }

    // Append remaining entries from either array
    while (i < arr1.length) result.push(arr1[i++]);
    while (j < arr2.length) result.push(arr2[j++]);

    return result;
}

function mergeAllAtSameTimestamp(arr1: row[], arr2: row[], timestamp: Date, startIndex1: number, startIndex2: number): row {
    // Initialize a merged row with the timestamp and null values for subsequent entries
    let mergedRow: row = [timestamp, ...new Array(arr1[startIndex1].length - 1).fill(null)];

    // Aggregate all rows at the given timestamp from arr1
    for (let k = startIndex1; k < arr1.length && arr1[k][0].getTime() === timestamp.getTime(); k++) {
        mergedRow = mergeRows(mergedRow, arr1[k]);
    }

    // Aggregate all rows at the given timestamp from arr2
    for (let k = startIndex2; k < arr2.length && arr2[k][0].getTime() === timestamp.getTime(); k++) {
        mergedRow = mergeRows(mergedRow, arr2[k]);
    }

    return mergedRow;
}

function mergeRows(row1: row, row2: row): row {
    let mergedRow: row = [row1[0]]; // Use the date from either row
    for (let k = 1; k < row1.length; k++) {
        mergedRow.push(row1[k] !== null ? row1[k] : row2[k]);
    }
    return mergedRow;
}
