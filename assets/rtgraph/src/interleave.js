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


export function interleave(data) {
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
                if (timestamp - last > 1600) {
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

    console.log(JSON.stringify(allPoints, null, 2));

    const merged = consolidate(allPoints);

    console.log(JSON.stringify(merged, null, 2));

    const rendered = render(numSeries, merged);

    console.log(JSON.stringify(rendered, null, 2));
    return rendered;
}