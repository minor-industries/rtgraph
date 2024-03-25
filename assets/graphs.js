const mapDate = ([first, ...rest]) => [new Date(first), ...rest];


function supplant(s, o) {
    // https://stackoverflow.com/questions/1408289/how-can-i-do-string-interpolation-in-javascript
    return s.replace(/{([^{}]*)}/g,
        function (a, b) {
            const r = o[b];
            return typeof r === 'string' || typeof r === 'number' ? r : a;
        }
    );
}


function makeGraph(elem, opts) {
    const second = 1000;
    const minute = second * 60;
    const hour = second * 24;

    if (opts.labels === undefined || opts.labels === null) {
        throw new Error("labels not given");
    }

    opts.mappers = opts.mappers || [];
    opts.strokeWidth = opts.strokeWidth || 3.0;
    const windowSize = opts.windowSize || 10 * minute; // milliseconds

    let g;
    let data = [];
    let t0Server;
    let t0Client;

    const computeDateWindow = () => {
        const t1Client = new Date();
        const dt = t1Client.getTime() - t0Client.getTime()
        const t1 = new Date(t0Server.getTime() + dt);
        const t0 = new Date(t1.getTime() - windowSize);
        return [t0, t1]
    };


    function update(rows) {
        const newGraph = data.length === 0;

        let newRows = rows.map(mapDate);

        opts.mappers.forEach(mapper => {
            newRows = newRows.map(([first, ...rest]) => {
                return [first, ...rest.map(x => {
                    if (x === null || isNaN(x)) {
                        return x;
                    }
                    return mapper(x);
                })]
            })
        })

        data.push(...newRows);

        if (newGraph) {
            g = new Dygraph(
                elem,
                data,
                {
                    // dateWindow: [t0, t1],
                    title: supplant(opts.title, {value: ""}), // TODO: do better here
                    ylabel: opts.ylabel,
                    labels: opts.labels,
                    includeZero: opts.includeZero,
                    strokeWidth: opts.strokeWidth,
                    dateWindow: computeDateWindow(),
                    height: opts.height,
                    rightGap: 5,
                    connectSeparatedPoints: true,
                    valueRange: opts.valueRange
                });
        } else {
            let updateOpts = {
                file: data,
            };

            // update the title if needed
            if (data.length > 0) {
                let lastRow = data[data.length - 1];
                const lastValue = lastRow[1]; // for now use the first Y value
                if (lastValue !== null && lastValue !== undefined) {
                    updateOpts.title = supplant(opts.title, {value: lastValue.toFixed(2)});
                }
            }

            g.updateOptions(updateOpts);
        }
    }

    const url = `ws://${window.location.hostname}:${window.location.port}/ws`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onmessage = message => {
        if (message.data instanceof ArrayBuffer) {
            let d = msgpack.decode(new Uint8Array(message.data));

            console.log(d.rows.length);
            if (d.rows.length > 0) {
                console.log(d.rows[0])
            }

            update(d.rows);
            return;
        }

        const msg = JSON.parse(message.data);

        if (msg.error !== undefined) {
            alert(msg.error);
            return;
        }

        if (msg.now !== undefined) {
            // handle case when client and server times don't match
            t0Server = new Date(msg.now);
            t0Client = new Date();
            setInterval(function () {
                if (g === undefined) {
                    return;
                }
                g.updateOptions({
                    dateWindow: computeDateWindow(),
                })
            }, 250);
        }
    };

    ws.onopen = event => {
        setTimeout(function () {
            ws.send(JSON.stringify({series: opts.series}));
        })
    }
}
