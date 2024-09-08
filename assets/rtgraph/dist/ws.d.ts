import { Connection, Handler } from "./connection.js";
export declare class WSConn implements Connection {
    private readonly url;
    private handler?;
    constructor();
    connect(handler: Handler): void;
    private connectInternal;
}
