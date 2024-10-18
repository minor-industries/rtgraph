import { decode } from "@msgpack/msgpack";
export class WSConnector {
    constructor() {
        this.url = '/rtgraph/ws';
    }
    connect(handler) {
        this.connectInternal(handler);
    }
    connectInternal(handler) {
        const ws = new WebSocket(this.url);
        ws.binaryType = "arraybuffer";
        ws.onmessage = message => {
            const msg = decode(new Uint8Array(message.data));
            handler.onmessage(msg);
        };
        ws.onopen = event => {
            setTimeout(() => {
                ws.send(JSON.stringify(handler.subscriptionRequest()));
            });
        };
        ws.onerror = err => {
            ws.close();
        };
        ws.onclose = err => {
            handler.onclose();
            setTimeout(() => this.connectInternal(handler), 1000);
        };
    }
}
