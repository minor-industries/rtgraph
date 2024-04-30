export class Cache {
    constructor(numSeries, maxGapMS) {
        this.lastSeen = {};
        this.maxGapMS = maxGapMS;
        this.numSeries = numSeries;
        this.timestamps = [];
        this.present = [];
        this.series = new Array(numSeries);
        for (let i = 0; i < numSeries; i++) {
            this.series[i] = [];
        }
    }

    interleave(data) {
        const flat = this.flattenAndAddGaps(data);
        const merged = consolidate(flat);

        merged.forEach(row => {
            const col0 = row[0];
            this.timestamps.push(col0.timestamp);
            const idx = this.timestamps.length - 1;

            for (let i = 0; i < this.numSeries; i++) {
                this.series[i].push(0.0);
            }

            let present = 0;

            row.forEach(col => {
                present |= (1 << col.pos)
                this.series[col.pos][idx] = col.value;
            })

            this.present.push(present);
        })


        return this.renderResult(0);
    }

    renderResult(start) {
        const result = [];
        for (let i = start; i < this.timestamps.length; i++) {
            const row = new Array(this.numSeries + 1);
            row.fill(null, 1);
            row[0] = new Date(this.timestamps[i]);
            const present = this.present[i];

            for (let j = 0; j < this.numSeries; j++) {
                const has = present & (1 << j)
                if (has !== 0) {
                    row[j + 1] = this.series[j][i];
                }
            }

            result.push(row);
        }

        return result;
    }

    appendSingle(sample) {
        let idx = this.timestamps.length - 1;
        const maxTimestamp = this.timestamps[idx];

        if (sample.timestamp < maxTimestamp) {
            // for now ignore out-of-order timestamps;
        } else if (sample.timestamp === maxTimestamp) {
            this.present[idx] |= (1 << sample.pos);
            // console.log(this.present[idx]);
            this.series[sample.pos][idx] = sample.value;
        } else {
            idx++;
            this.timestamps.push(sample.timestamp)
            this.present.push((1 << sample.pos))
            for (let i = 0; i < this.numSeries; i++) {
                this.series[i].push(0.0);
            }
            this.series[sample.pos][idx] = sample.value;
        }
    }

    append(data) {
        // console.log(JSON.stringify(data, null, 2));

        // console.log("--------------------------")

        const idx = this.timestamps.length - 1;

        const flat = this.flattenAndAddGaps(data);
        const merged = consolidate(flat);

        // console.log(JSON.stringify(merged, null, 2));

        merged.forEach(row => {
            row.forEach(col => {
                this.appendSingle(col);
            })
        })

        // data.forEach(series => {
        //     const pos = series.Pos;
        //     for (let i = 0; i < series.Timestamps.length; i++) {
        //         const timestamp = series.Timestamps[i];
        //         const value = series.Values[i];
        //         this.appendSingle({
        //             timestamp: timestamp,
        //             pos: pos,
        //             value: value,
        //         })
        //     }
        // })

        return this.renderResult(idx + 1);
    }

    flattenAndAddGaps(data) {
        let flat = [];

        data.forEach(series => {
            //TODO: add gaps to each series independently? or not?

            for (let i = 0; i < series.Timestamps.length; i++) {
                const timestamp = series.Timestamps[i];
                const value = series.Values[i];

                const last = this.lastSeen[series.Pos]
                this.lastSeen[series.Pos] = timestamp;

                if (last !== undefined) {
                    if (timestamp - last > this.maxGapMS) {
                        flat.push({
                            timestamp: timestamp - 1,
                            pos: series.Pos,
                            value: NaN,
                        })
                    }
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

function render(numSeries, merged) {
    let result = []

    merged.forEach(r => {
        const row = new Array(numSeries + 1);
        row.fill(null, 1);
        row[0] = new Date(r[0].timestamp);

        r.forEach(c => {
            row[c.pos + 1] = c.value;
        })

        result.push(row);
    })

    return result;
}


export function interleave(data, maxTimestampMS) {
    const numSeries = data.length;
    console.log(numSeries);

    const allPoints = [];

    const lastSeen = {};

    data.forEach(series => {
        for (let i = 0; i < series.Timestamps.length; i++) {
            const timestamp = series.Timestamps[i];
            const value = series.Values[i];

            const last = lastSeen[series.Pos]
            lastSeen[series.Pos] = timestamp;

            if (last !== undefined) {
                if (timestamp - last > maxTimestampMS) {
                    allPoints.push({
                        timestamp: timestamp - 1,
                        pos: series.Pos,
                        value: NaN,
                    })
                }
            }

            allPoints.push({
                timestamp: timestamp,
                pos: series.Pos,
                value: value,
            })
        }
    })

    allPoints.sort((a, b) => {
        return a.timestamp - b.timestamp;
    })

    // console.log(JSON.stringify(allPoints, null, 2));

    const merged = consolidate(allPoints);

    // console.log(JSON.stringify(merged, null, 2));

    const rendered = render(numSeries, merged);
    return rendered;
}