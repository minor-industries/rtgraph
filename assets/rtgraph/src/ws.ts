import {Connector, Handler, Msg} from "./connector.js";
import {decode} from "@msgpack/msgpack";

export class WSConnector implements Connector {
    private readonly url: string
    private handler?: Handler;

    constructor() {
        this.url = `ws://${window.location.hostname}:${window.location.port}/rtgraph/ws`;
    }

    connect(handler: Handler): void {
        this.handler = handler;
        this.connectInternal();
    }

    private connectInternal() {
        const ws = new WebSocket(this.url);
        ws.binaryType = "arraybuffer";
        ws.onmessage = message => {
            const msg: Msg = decode(new Uint8Array(message.data)) as Msg;
            this.handler!.onmessage(msg);
        }

        ws.onopen = event => {
            setTimeout(() => {
                ws.send(JSON.stringify(this.handler!.subscriptionRequest()));
            })
        }

        ws.onerror = err => {
            ws.close();
        }

        ws.onclose = err => {
            this.handler!.onclose();
            setTimeout(() => this.connectInternal(), 1000);
        }
    }
}