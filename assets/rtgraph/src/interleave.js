export class Cache {
    constructor(numSeries, maxGapMS) {
        this.lastSeen = {};
        this.maxGapMS = maxGapMS;
        this.numSeries = numSeries;
        this.data = [];
    }

    interleave(data) {
        const flat = this.flattenAndAddGaps(data);
        const merged = consolidate(flat);

        merged.forEach(r => {
            const col0 = r[0];
            const row = new Array(this.numSeries + 1);
            row.fill(null, 1);
            row[0] = new Date(col0.timestamp);

            r.forEach(col => {
                row[col.pos + 1] = col.value;
            })

            this.data.push(row);
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
            const row = new Array(this.numSeries + 1);
            row.fill(null, 1);
            row[0] = new Date(sample.timestamp);
            row[sample.pos + 1] = sample.value;
            this.data.push(row);
        }
    }

    append(data) {
        const flat = this.flattenAndAddGaps(data);
        const merged = consolidate(flat);

        merged.forEach(row => {
            row.forEach(col => {
                this.appendSingle(col);
            })
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

function consolidate(allPoints) {
    let result = []
    let acc = [];

    allPoints.forEach(point => {
        if (acc.length === 0 || acc[0].timestamp === point.timestamp) {
            acc.push(point);
        } else {
            result.push(acc);
            acc = [point];
        }
    });

    if (acc.length > 0) {
        result.push(acc);
    }

    return result;
}