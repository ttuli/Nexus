import { ImTypes } from '../../../src/types'; // Import for types

export interface WsMessage extends ImTypes.WSMessage {
    clientId: string | number | any; // Allow relaxed type for now
    [key: string]: any;
}

/**
 * Message serializer interface - can be implemented for different formats
 */
export interface IMessageSerializer {
    serialize(msg: WsMessage): string | ArrayBuffer | Uint8Array;
    deserialize(data: string | ArrayBuffer | Uint8Array): WsMessage;
}
