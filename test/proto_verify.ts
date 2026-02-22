
import { fromBinary, toBinary, create } from "@bufbuild/protobuf";
import { ImTypes } from "../src/types";

// Helper to convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

// Replace 'YOUR_HEX_STRING_HERE' with the actual hex string from the server
// Example: "080110641a0b746573742d636c69656e74"
const serverBytesHex = "08b4efe0dcc63310641a8a010a5a0a116d73675f756e697175655f69645f3132331211636c69656e745f6465766963655f3030311a1073657373696f6e5f757569645f34353620914e28a29c0138b3efe0dcc63340014801520e0a046b657931120676616c756531121d48656c6c6f2c207468697320697320612074657374206d6573736167651a0d08b3ea011205557365723320052001";

// Or if you have a byte array directly
// const serverBytes = new Uint8Array([...]);

async function testDeserialization() {
    try {
        console.log("Testing ImTypes.WSMessage deserialization...");

        if (!serverBytesHex) {
            console.log("Please provide a hex string in 'serverBytesHex' variable to test.");

            // Construct a dummy message for demonstration
            const dummy = create(ImTypes.WSMessageSchema, {
                timestamp: BigInt(Date.now()),
                type: ImTypes.MessageType.CHAT_TEXT,
                version: 1,
                payload: new Uint8Array([])
            });
            const binary = toBinary(ImTypes.WSMessageSchema, dummy);
            console.log("Generated dummy binary (hex):", Buffer.from(binary).toString('hex'));

            const decoded = fromBinary(ImTypes.WSMessageSchema, binary);
            console.log("Decoded dummy message:", decoded);
            return;
        }

        const bytes = hexToBytes(serverBytesHex);
        const decoded = fromBinary(ImTypes.WSMessageSchema, bytes);

        console.log("Successfully deserialized WSMessage:");
        console.log("Timestamp:", decoded.timestamp);
        console.log("Type:", decoded.type);
        console.log("Payload:", decoded.payload);
        console.log("Version:", decoded.version);
        console.log("Full Object:", decoded);

        if (decoded.type === ImTypes.MessageType.CHAT_TEXT) {
            console.log("Detected CHAT_TEXT message. Decoding payload...");
            const textMsg = fromBinary(ImTypes.TextMessageSchema, decoded.payload);
            console.log("Decoded TextMessage:", textMsg);
            console.log("Content:", textMsg.content);
        }


    } catch (error) {
        console.error("Deserialization failed:", error);
    }
}

testDeserialization();
