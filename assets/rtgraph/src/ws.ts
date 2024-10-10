import {Connector, Handler, Msg} from "./connector.js";
import {decode} from "@msgpack/msgpack";

export class WSConnector implements Connector {
    private readonly url: string

    constructor() {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        this.url = `${protocol}://${window.location.hostname}:${window.location.port}/rtgraph/ws`;
    }

    connect(handler: Handler): void {
        this.connectInternal(handler);
    }

    private connectInternal(handler: Handler) {
        const ws = new WebSocket(this.url);
        ws.binaryType = "arraybuffer";
        ws.onmessage = message => {
            const msg: Msg = decode(new Uint8Array(message.data)) as Msg;
            handler.onmessage(msg);
        }

        ws.onopen = event => {
            setTimeout(() => {
                ws.send(JSON.stringify(handler.subscriptionRequest()));
            })
        }

        ws.onerror = err => {
            ws.close();
        }

        ws.onclose = err => {
            handler.onclose();
            setTimeout(() => this.connectInternal(handler), 1000);
        }
    }
}