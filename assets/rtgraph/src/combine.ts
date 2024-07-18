import TinyQueue from 'tinyqueue';

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

    constructor(numSeries: number, maxGapMS: number) {
        this.lastSeen = {};
        this.maxGapMS = maxGapMS;
        this.numSeries = numSeries;
        this.data = [];
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

        const flat = this.flattenAndAddGaps(data);

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
        const flat = this.flattenAndAddGaps(data);
        flat.forEach(col => {
            this.appendSingle(col);
        })
    }

    getData(): DygraphRow[] {
        return this.data;
    }

    private flattenAndAddGaps(data: Series[]): Sample[] {
        const flat: Sample[] = [];

        const queue = new TinyQueue<Sample>([], (a, b) => {
            return a[1] - b[1];
        });

        let remaining = data
            .map(x => x.Timestamps.length)
            .reduce((acc, x) => acc + x, 0);

        for (let i = 0; i < data.length; i++) {
            const series = data[i];
            if (series.Timestamps.length == 0) {
                continue; // perhaps not possible/allowed, but anyway
            }
            queue.push([series.Pos, series.Timestamps[0], series.Values[0], 0]);
        }

        while (remaining > 0) {
            const item = queue.pop()!;
            remaining--;
            flat.push(item);

            const seriesPos = item[0];
            const series = data[seriesPos];
            const next = item[3] + 1;

            if (next < series.Timestamps.length) {
                const sample: Sample = [
                    seriesPos,
                    series.Timestamps[next],
                    series.Values[next],
                    next,
                ];
                queue.push(sample);
            }
        }

        return flat;
    }
}