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
        this.data.push(row)
        return row
    }

    interleave(data) {
        if (data.length === 0) {
            return;
        }

        const flat = this.flattenAndAddGaps(data);

        let row = this.newRow(flat[0].timestamp)
        flat.forEach(col => {
            if (row[0].getTime() !== col.timestamp) {
                row = this.newRow(col.timestamp)
            }
            row[col.pos + 1] = col.value;
        })
    }

    appendSingle(sample) {
        let idx = this.data.length - 1;
        const maxTimestamp = this.data[idx][0].getTime();

        if (sample.timestamp < maxTimestamp) {
            console.log("out-of-order", sample.timestamp, maxTimestamp);
            // for now ignore out-of-order timestamps;
        } else if (sample.timestamp === maxTimestamp) {
            this.data[idx][sample.pos + 1] = sample.value;
        } else {
            const row = this.newRow(sample.timestamp)
            row[sample.pos + 1] = sample.value;
        }
    }

    append(data) {
        const flat = this.flattenAndAddGaps(data);
        flat.forEach(col => {
            this.appendSingle(col);
        })
    }

    flattenAndAddGaps(data) {
        let flat = [];

        data.forEach(series => {
            for (let i = 0; i < series.Timestamps.length; i++) {
                const timestamp = series.Timestamps[i];
                const value = series.Values[i];

                const last = this.lastSeen[series.Pos]
                this.lastSeen[series.Pos] = timestamp;
                if (last !== undefined && timestamp - last > this.maxGapMS) {
                    flat.push({
                        timestamp: timestamp - 1,
                        pos: series.Pos,
                        value: NaN,
                    })
                }

                flat.push({
                    timestamp: timestamp,
                    pos: series.Pos,
                    value: value,
                })
            }
        })

        flat.sort((a, b) => {
            return a.timestamp - b.timestamp;
        })

        return flat;
    }
}