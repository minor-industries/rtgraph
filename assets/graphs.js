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

class Graph {
    constructor(elem, opts) {
        const second = 1000;
        const minute = second * 60;
        const hour = second * 24;

        this.elem = elem;
        this.opts = opts;

        if (this.opts.labels === undefined || this.opts.labels === null) {
            throw new Error("labels not given");
        }

        this.opts.mappers = this.opts.mappers || [];
        this.opts.strokeWidth = this.opts.strokeWidth || 3.0;
        this.windowSize = this.opts.windowSize || 10 * minute; // milliseconds

        this.g = undefined;
        this.data = [];
        this.t0Server = undefined;
        this.t0Client = undefined;

        this.connect();
    }

    computeDateWindow() {
        const t1Client = new Date();
        const dt = t1Client.getTime() - this.t0Client.getTime()
        const t1 = new Date(this.t0Server.getTime() + dt);
        const t0 = new Date(t1.getTime() - this.windowSize);
        return [t0, t1]
    };

    computeLabels() {
        return this.data.length > 0 ? this.opts.labels : [];
    }

    update(rows) {
        const newGraph = this.data.length === 0;

        let newRows = rows.map(mapDate);

        this.opts.mappers.forEach(mapper => {
            newRows = newRows.map(([first, ...rest]) => {
                return [first, ...rest.map(x => {
                    if (x === null || isNaN(x)) {
                        return x;
                    }
                    return mapper(x);
                })]
            })
        })

        this.data.push(...newRows);

        if (newGraph) {
            let labels = this.computeLabels();
            this.g = new Dygraph(
                this.elem,
                this.data,
                {
                    // dateWindow: [t0, t1],
                    title: supplant(this.opts.title, {value: ""}), // TODO: do better here
                    ylabel: this.opts.ylabel,
                    labels: labels,
                    includeZero: this.opts.includeZero,
                    strokeWidth: this.opts.strokeWidth,
                    dateWindow: this.computeDateWindow(),
                    height: this.opts.height,
                    rightGap: 5,
                    connectSeparatedPoints: true,
                    valueRange: this.opts.valueRange,
                    series: this.opts.series,
                });
        } else {
            let updateOpts = {
                file: this.data,
                labels: this.computeLabels()
            };

            // update the title if needed
            if (this.data.length > 0) {
                let lastRow = this.data[this.data.length - 1];
                const lastValue = lastRow[1]; // for now use the first Y value
                if (lastValue !== null && lastValue !== undefined) {
                    updateOpts.title = supplant(this.opts.title, {value: lastValue.toFixed(2)});
                }
            }

            this.g.updateOptions(updateOpts);
        }
    }

    setDate(date) {
        const firstSet = this.t0Server === undefined;

        this.t0Server = date;
        this.t0Client = new Date();

        if (firstSet) {
            this.scroll();
        }
    }

    scroll() {
        setInterval(() => {
            if (this.g === undefined) {
                return;
            }
            this.g.updateOptions({
                dateWindow: this.computeDateWindow(),
            })
        }, 250);
    }

    computeAfter(args) {
        if (this.data.length === 0) {
            return undefined;
        }

        const lastPoint = this.data[this.data.length - 1];
        return lastPoint[0].getTime() + 1;
    }

    connect() {
        console.log("connecting:", this.opts.seriesNames);
        const url = `ws://${window.location.hostname}:${window.location.port}/ws`;
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";

        ws.onmessage = message => {
            if (message.data instanceof ArrayBuffer) {
                let d = msgpack.decode(new Uint8Array(message.data));

                this.update(d.rows);
                return;
            }

            const msg = JSON.parse(message.data);

            if (msg.error !== undefined) {
                alert(msg.error);
                return;
            }

            if (msg.now !== undefined) {
                // handle case when client and server times don't match
                this.setDate(new Date(msg.now));
            }
        };

        ws.onopen = event => {
            setTimeout(() => {
                ws.send(JSON.stringify({
                        series: this.opts.seriesNames,
                        windowSize: this.opts.windowSize,
                        after: this.computeAfter(),
                    }
                ));
            })
        }

        ws.onerror = err => {
            console.log("websocket error: " + err);
            ws.close();
        }

        ws.onclose = err => {
            console.log("websocket close: " + err);
            this.reconnect();
        }
    }

    reconnect() {
        setTimeout(() => this.connect(), 1000);
    }
}
