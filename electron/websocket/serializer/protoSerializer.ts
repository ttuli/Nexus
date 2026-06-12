import { IMessageSerializer, WsMessage } from "./MessageSerializer";
import { ImTypes } from '@/src/types';


/**
 * Protobuf binary serializer implementation
 * Serializes to Uint8Array for backend proto parsing
 */
export class DefaultSerializer implements IMessageSerializer {
    serialize(msg: WsMessage): Uint8Array {
        const writer = ImTypes.WSMessage.encode(msg);
        return writer.finish();
    }

    deserialize(data: string | ArrayBuffer | Uint8Array): WsMessage {
        let bytes: Uint8Array;
        if (data instanceof Uint8Array) {
            bytes = data;
        } else if (data instanceof ArrayBuffer) {
            bytes = new Uint8Array(data);
        } else {
            // string fallback: treat as binary string
            const buf = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
                buf[i] = data.charCodeAt(i);
            }
            bytes = buf;
        }
        return ImTypes.WSMessage.decode(bytes) as WsMessage;
    }
}

// Default serializer instance
export const defaultSerializer: IMessageSerializer = new DefaultSerializer();