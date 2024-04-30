export class Cache {
    constructor(numSeries, maxGapMS) {
        this.lastSeen = {};
        this.maxGapMS = maxGapMS;
        this.numSeries = numSeries;
        this.data = [];
    }
    newRow(timestamp) {
        const row = new Array(this.numSeries + 1);
        row.fill(null, 1);
        row[0] = new Date(timestamp);
        this.data.push(row);
        return row;
    }
    interleave(data) {
        if (data.length === 0 || data[0].Timestamps.length === 0) {
            return;
        }
        const flat = this.flattenAndAddGaps(data);
        let row = this.newRow(flat[0][0]);
        flat.forEach(sample => {
            const [timestamp, pos, value] = sample;
            if (row[0].getTime() !== timestamp) {
                row = this.newRow(timestamp);
            }
            row[pos + 1] = value;
        });
    }
    appendSingle(sample) {
        const [timestamp, pos, value] = sample;
        if (this.data.length === 0) {
            this.newRow(timestamp);
        }
        let idx = this.data.length - 1;
        const maxTimestamp = this.data[idx][0].getTime();
        if (timestamp < maxTimestamp) {
            console.log("out-of-order", timestamp, maxTimestamp);
            // for now ignore out-of-order timestamps;
        }
        else if (timestamp === maxTimestamp) {
            this.data[idx][pos + 1] = value;
        }
        else {
            const row = this.newRow(timestamp);
            row[pos + 1] = value;
        }
    }
    append(data) {
        const flat = this.flattenAndAddGaps(data);
        flat.forEach(col => {
            this.appendSingle(col);
        });
    }
    flattenAndAddGaps(data) {
        let flat = [];
        data.forEach(series => {
            for (let i = 0; i < series.Timestamps.length; i++) {
                const timestamp = series.Timestamps[i];
                const value = series.Values[i];
                const last = this.lastSeen[series.Pos];
                this.lastSeen[series.Pos] = timestamp;
                if (last !== undefined && timestamp - last > this.maxGapMS) {
                    flat.push([timestamp - 1, series.Pos, NaN]);
                }
                flat.push([timestamp, series.Pos, value]);
            }
        });
        flat.sort((a, b) => {
            return a[0] - b[0];
        });
        return flat;
    }
}
