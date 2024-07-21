import TinyQueue from 'tinyqueue';
import { binarySearch } from "./binary_search.js";
import { sortedArrayMerge } from "./sorted_array_merge.js";
export class Cache {
    constructor(numSeries, maxGapMS) {
        this.overlapCount = 0;
        this.maxGapMS = maxGapMS;
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
    getSeries() {
        return this.series;
    }
    detectOverlap(data) {
        if (this.data.length === 0) {
            return [0, false];
        }
        const t1 = data
            .filter(x => x.Timestamps.length > 0)
            .map(x => x.Timestamps[0])
            .reduce((acc, x) => x < acc ? x : acc, Number.MAX_VALUE);
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
        }
        else {
            sortedArrayMerge(existing.Timestamps, existing.Values, series.Timestamps, series.Values);
        }
    }
    mergeAndAddGaps(data, callback) {
        const [minT, overlap] = this.detectOverlap(data);
        let startPositions;
        if (overlap) {
            this.overlapCount++;
            // eventually I think instead of replacing an exact time match we can probably merge and change to less-than
            // truncate data keeping only non-overlapping parts
            this.data.length = binarySearch(this.data, this.data.length, x => x[0].getTime() >= minT);
            startPositions = this.series.map(s => {
                return binarySearch(s.Timestamps, s.Timestamps.length, x => x >= minT);
            });
        }
        else {
            startPositions = this.series.map(x => x.Timestamps.length);
        }
        // merge incoming data series
        for (let i = 0; i < data.length; i++) {
            this.mergeSingleSeries(data[i]);
        }
        // start the main algorithm
        const queue = new TinyQueue([], (a, b) => {
            return a[1] - b[1];
        });
        for (let pos = 0; pos < this.series.length; pos++) {
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
            const item = queue.pop();
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
