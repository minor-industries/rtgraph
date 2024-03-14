const mapDate = value => [new Date(value[0]), value[1]];


function makeGraph(elem, opts) {
    const second = 1000;
    const minute = second * 60;
    const hour = second * 24;

    opts.mappers = opts.mappers || [];
    opts.strokeWidth = opts.strokeWidth || 3.0;
    const windowSize = opts.windowSize || 10 * minute; // milliseconds

    let g;
    let data;
    let t0Server;
    let t0Client;

    const computeDateWindow = () => {
        const t1Client = new Date();
        const dt = t1Client.getTime() - t0Client.getTime()
        const t1 = new Date(t0Server.getTime() + dt);
        const t0 = new Date(t1.getTime() - windowSize);
        t0.setMinutes(t0.getMinutes() - 5);
        return [t0, t1]
    };

    const url = `ws://${window.location.hostname}:${window.location.port}/ws`;
    const ws = new WebSocket(url);

    ws.binaryType = "blob";
    ws.onmessage = message => {

        if (message.data instanceof Blob) {
            alert("binary");
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

        if (msg.initial_data !== undefined) {
            data = msg.initial_data.map(mapDate);
            opts.mappers.forEach(mapper => {
                data = data.map(value => {
                    return [value[0], mapper(value[1])]
                })
            })

            g = new Dygraph(// containing div
                elem,
                data,
                {
                    // dateWindow: [t0, t1],
                    title: opts.title,
                    ylabel: opts.ylabel,
                    labels: ["X", "Y"],
                    includeZero: opts.includeZero,
                    strokeWidth: opts.strokeWidth,
                    dateWindow: computeDateWindow(),
                    height: opts.height,
                    rightGap: 5,
                });
        }

        if (msg.rows !== undefined) {
            let rows = msg.rows.map(mapDate);

            opts.mappers.forEach(mapper => {
                rows = rows.map(value => {
                    return [value[0], mapper(value[1])]
                })
            })

            data.push(...rows);
            g.updateOptions({
                file: data,
            });
        }
    };

    ws.onopen = event => {
        setTimeout(function () {
            ws.send(JSON.stringify({series: opts.series}));
        })
    }
}
