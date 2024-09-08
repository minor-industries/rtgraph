import { Connector, Handler } from "./connector.js";
export declare class WSConnector implements Connector {
    private readonly url;
    private handler?;
    constructor();
    connect(handler: Handler): void;
    private connectInternal;
}
