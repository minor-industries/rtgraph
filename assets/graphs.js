const mapDate = ([first, ...rest]) => [new Date(first), ...rest];


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
                    title: opts.title,
                    ylabel: opts.ylabel,
                    labels: opts.labels,
                    includeZero: opts.includeZero,
                    strokeWidth: opts.strokeWidth,
                    dateWindow: computeDateWindow(),
                    height: opts.height,
                    rightGap: 5,
                    connectSeparatedPoints: true
                });
        } else {
            g.updateOptions({
                file: data,
            });
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
