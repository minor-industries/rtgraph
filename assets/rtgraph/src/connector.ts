import {Series} from "./combine.js";
import {SubscriptionRequest} from "./graph.js";

export type Msg = {
    error?: string;
    now?: number;
    rows?: Series[];
};


export type Handler = {
    onmessage(m: Msg): void
    onclose(): void
    subscriptionRequest(): SubscriptionRequest
}

export type Connector = {
    connect(handler: Handler): void
}