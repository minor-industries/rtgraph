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

        const flat = this.mergeAndAddGaps(data);

        let row = this.newRow(flat[0][1])
        flat.forEach(sample => {
            const [pos, timestamp, value, _] = sample;
            if (row[0].getTime() !== timestamp) {
                row = this.newRow(timestamp)
            }
            row[pos + 1] = value;
        })
    }

    private appendSingle(sample: Sample) {
        const [pos, timestamp, value, _] = sample;

        if (this.data.length === 0) {
            this.newRow(timestamp);
        }

        let idx = this.data.length - 1;
        const maxTimestamp = this.data[idx][0].getTime();

        if (timestamp < maxTimestamp) {
            console.log("out-of-order", timestamp, maxTimestamp);
            // for now ignore out-of-order timestamps;
        } else if (timestamp === maxTimestamp) {
            this.data[idx][pos + 1] = value;
        } else {
            const row = this.newRow(timestamp)
            row[pos + 1] = value;
        }
    }

    append(data: Series[]) {
        if (this.data.length == 0) {
            this.interleave(data)
        } else {
            this.appendInternal(data);
        }
    }

    private appendInternal(data: Series[]) {
        const flat = this.mergeAndAddGaps(data);
        flat.forEach(col => {
            this.appendSingle(col);
        })
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

    private mergeAndAddGaps(data: Series[]): Sample[] {
        const flat: Sample[] = [];

        const [minT, overlap] = this.detectOverlap(data);
        console.log("overlap", overlap);

        if (overlap) {
            const idx = binarySearch(
                this.data,
                // eventually I think instead of replacing an exact time match we can probably merge
                x => {
                    console.log(x[0].getTime(), minT);
                    return x[0].getTime() >= minT;
                }
            );

            console.log("replace everything from", idx, this.data[idx]);
        }

        const startPositions = this.series.map(x => x.Timestamps.length);

        for (let i = 0; i < data.length; i++) {
            const series = data[i];
            this.series[series.Pos].Timestamps.push(...series.Timestamps);
            this.series[series.Pos].Values.push(...series.Values);
        }

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
            flat.push(item);

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

        return flat;
    }
}