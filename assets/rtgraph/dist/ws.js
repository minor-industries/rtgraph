import { decode } from "@msgpack/msgpack";
export class WSConn {
    constructor() {
        this.url = `ws://${window.location.hostname}:${window.location.port}/rtgraph/ws`;
    }
    connect(handler) {
        this.handler = handler;
        this.connectInternal();
    }
    connectInternal() {
        const ws = new WebSocket(this.url);
        ws.binaryType = "arraybuffer";
        ws.onmessage = message => {
            const msg = decode(new Uint8Array(message.data));
            this.handler.onmessage(msg);
        };
        ws.onopen = event => {
            setTimeout(() => {
                ws.send(JSON.stringify(this.handler.subscriptionRequest()));
            });
        };
        ws.onerror = err => {
            ws.close();
        };
        ws.onclose = err => {
            this.handler.onclose();
            setTimeout(() => this.connectInternal(), 1000);
        };
    }
}
