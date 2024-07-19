import TinyQueue from 'tinyqueue';
import {binarySearch} from "./binary_search.js";

export type Series = {
    Pos: number;
    Timestamps: number[];
    Values: number[];
};

export type DygraphRow = [Date, ...(number | null)[]];

type Sample = [
    number, // position of series
    number, // timestamp
    number, // value
    number, // position IN series
];

export class Cache {
    private readonly lastSeen: { [key: number]: number };
    private readonly maxGapMS: number;
    private readonly numSeries: number;
    private readonly data: DygraphRow[];
    private readonly series: Series[];

    constructor(numSeries: number, maxGapMS: number) {
        this.lastSeen = {};
        this.maxGapMS = maxGapMS;
        this.numSeries = numSeries;
        this.data = [];
        this.series = [];
        for (let i = 0; i < numSeries; i++) {
            this.series[i] = {
                Pos: i,
                Timestamps: [],
                Values: [],
            };
        }
    }

    private newRow(timestamp: number): DygraphRow {
        const row: any = new Array(this.numSeries + 1);
        row.fill(null, 1);
        row[0] = new Date(timestamp);
        this.data.push(row)
        return row
    }

    private interleave(data: Series[]) {
        if (data.length === 0) {
            return;
        }

        let row: DygraphRow;
        let first = true;
        this.mergeAndAddGaps(data, (sample: Sample) => {
            const [pos, timestamp, value, _] = sample;
            if (first || row[0].getTime() !== timestamp) {
                row = this.newRow(timestamp)
                first = false;
            }
            row[pos + 1] = value;
        });
    }

    append(data: Series[]) {
        this.interleave(data);
    }

    getData(): DygraphRow[] {
        return this.data;
    }

    private detectOverlap(data: Series[]): [number, boolean] {
        if (this.data.length === 0) {
            return [0, false];
        }

        const t1 = data
            .filter(x => x.Timestamps.length > 0)
            .map(x => x.Timestamps[0])
            .reduce((acc, x) => x < acc ? x : acc, Number.MAX_VALUE);

        console.log("minT", t1);

        if (t1 === Number.MAX_VALUE) {
            return [0, false];
        }

        const t0 = this.data[this.data.length - 1][0].getTime();
        return [t1, t1 <= t0];
    }

    private appendSingleSeries(series: Series) {
        this.series[series.Pos].Timestamps.push(...series.Timestamps);
        this.series[series.Pos].Values.push(...series.Values);
    }

    private mergeSingleSeries(series: Series) {
        if (series.Timestamps.length === 0) {
            return;
        }

        const existing = this.series[series.Pos];
        if (existing.Timestamps.length === 0) {
            this.appendSingleSeries(series);
            return;
        }

        const t0 = existing.Timestamps[existing.Timestamps.length - 1];
        const t1 = series.Timestamps[0];

        if (t1 > t0) {
            this.appendSingleSeries(series);
            return;
        }

        // there's overlap, so
        // this is a quick and dirty implementation, we can and should do better
        // storing timestamps and values separately doesn't lend itself well here
        const X = Array.prototype.concat(existing.Timestamps, series.Timestamps);
        const Y = Array.prototype.concat(existing.Values, series.Values);

        const pairs = X.map((timestamp, index) => [timestamp, Y[index]]);
        pairs.sort((x, y) => x[0] - y[0]);

        const T: number[] = [];
        const V: number[] = [];

        for (let i = 0; i < pairs.length; i++) {
            T.push(pairs[i][0]);
            V.push(pairs[i][1]);
        }

        existing.Timestamps = T;
        existing.Values = V;
    }

    private mergeAndAddGaps(
        data: Series[],
        callback: (s: Sample) => void
    ) {
        const [minT, overlap] = this.detectOverlap(data);
        console.log("overlap", overlap);

        let startPositions: number[];

        if (overlap) {
            const idx = binarySearch(
                this.data,
                // eventually I think instead of replacing an exact time match we can probably merge
                x => {
                    return x[0].getTime() >= minT;
                }
            );

            this.data.length = idx; // truncate data keeping only non-overlapping parts

            startPositions = this.series.map(s => {
                const idx = binarySearch(
                    s.Timestamps,
                    x => x >= minT
                );

                if (idx === -1) {
                    return s.Timestamps.length;
                }

                return idx;
            });
        } else {
            startPositions = this.series.map(x => x.Timestamps.length);
        }

        // merge incoming data series
        for (let i = 0; i < data.length; i++) {
            this.mergeSingleSeries(data[i]);
        }

        // start the main algorithm
        const queue = new TinyQueue<Sample>([], (a, b) => {
            return a[1] - b[1];
        });

        for (let pos = 0; pos < this.numSeries; pos++) {
            const series = this.series[pos];
            const start = startPositions[pos];

            if (series.Timestamps.length === start) {
                continue; // no more data
            }

            const storedSeries = this.series[pos];
            if (start > 0) {
                const t0 = storedSeries.Timestamps[start - 1];
                const t1 = series.Timestamps[start];

                if (t1 - t0 > this.maxGapMS) {
                    // push gap before first entry of incoming series
                    queue.push([pos, t1 - 1, NaN, -1]);
                }
            }

            // push the first entry from the incoming series
            queue.push([pos, series.Timestamps[start], series.Values[start], start]);
        }

        while (queue.length > 0) {
            const item = queue.pop()!;
            const idx = item[3];
            callback(item);

            if (idx < 0) {
                continue; // this was a gap
            }

            const pos = item[0];
            const series = this.series[pos];
            const next = idx + 1;

            if (next >= series.Timestamps.length) {
                continue; // no more samples in this series
            }

            const t0 = item[1];
            const t1 = series.Timestamps[next];

            if (t1 - t0 > this.maxGapMS) {
                // push a "gap" in addition to the next sample
                queue.push([pos, t1 - 1, NaN, -1]);
            }

            // push the next sample from the series
            queue.push([pos, series.Timestamps[next], series.Values[next], next]);
        }
    }
}