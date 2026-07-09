/**
 * Lamport seq 管线单元测试
 *
 * 覆盖两块：
 * 1. share/utils/seq 的 BigInt 比较/规整逻辑
 * 2. proto 生成代码对超出 Number.MAX_SAFE_INTEGER 的 uint64 seq 的编解码 round-trip
 *    （jstype=JS_STRING 后应以 string 无损承载）
 */
import { toSeq, seqPositive, seqGt, seqLt, seqCompare, seqMax, seqPlusOne, seqToBigInt } from '@shared/utils/seq';
import { WSMessage, MessageType, TargetType } from '@shared/types/proto/transport/transport';
import { BaseMessage, PersistAck, MessageStatus } from '@shared/types/proto/message/message';

// 2026-07 前后的真实 Lamport seq 量级：ts(ms) << 22，约 7.4e18，远超 2^53
const BIG_SEQ = '7479837289402368001';
const BIGGER_SEQ = '7479837289402372097';

describe('share/utils/seq', () => {
    test('toSeq 规整各种输入', () => {
        expect(toSeq(undefined)).toBe('0');
        expect(toSeq(null)).toBe('0');
        expect(toSeq('')).toBe('0');
        expect(toSeq(0)).toBe('0');
        expect(toSeq(123)).toBe('123');
        expect(toSeq(BIG_SEQ)).toBe(BIG_SEQ);
        expect(toSeq('not-a-number')).toBe('0');
    });

    test('seqPositive', () => {
        expect(seqPositive('0')).toBe(false);
        expect(seqPositive(undefined)).toBe(false);
        expect(seqPositive(BIG_SEQ)).toBe(true);
        expect(seqPositive(1)).toBe(true);
    });

    test('大数比较不丢精度（差值小于 Number 精度间隙）', () => {
        // 两值差 4096，Number 表示在该量级的精度间隙是 1024/2048，
        // 若经过 float 转换会有相等/乱序风险，BigInt 必须严格区分
        expect(seqGt(BIGGER_SEQ, BIG_SEQ)).toBe(true);
        expect(seqLt(BIG_SEQ, BIGGER_SEQ)).toBe(true);
        expect(seqCompare(BIG_SEQ, BIGGER_SEQ)).toBe(-1);
        expect(seqCompare(BIGGER_SEQ, BIG_SEQ)).toBe(1);
        expect(seqCompare(BIG_SEQ, BIG_SEQ)).toBe(0);
        expect(seqMax(BIG_SEQ, BIGGER_SEQ)).toBe(BIGGER_SEQ);
    });

    test('相邻大数（±1）仍可区分', () => {
        const next = seqPlusOne(BIG_SEQ);
        expect(next).toBe('7479837289402368002');
        expect(seqGt(next, BIG_SEQ)).toBe(true);
        expect(seqGt(BIG_SEQ, next)).toBe(false);
    });

    test('seqToBigInt', () => {
        expect(seqToBigInt(BIG_SEQ)).toBe(7479837289402368001n);
        expect(seqToBigInt(undefined)).toBe(0n);
    });
});

describe('proto uint64 seq round-trip (jstype=JS_STRING)', () => {
    test('WSMessage 顶层 msg_seq 超大值编解码无损', () => {
        const msg: WSMessage = {
            route_target: [123],
            route_target_type: TargetType.USER,
            timestamp: Date.now(),
            type: MessageType.CHAT_TEXT,
            payload: new Uint8Array([1, 2, 3]),
            sender_id: 456,
            version: 1,
            msg_id: 'msg-1',
            session_id: 'sess-1',
            msg_seq: BIG_SEQ,
            deliver_to: [],
        };
        const decoded = WSMessage.decode(WSMessage.encode(msg).finish());
        expect(decoded.msg_seq).toBe(BIG_SEQ);
        expect(typeof decoded.msg_seq).toBe('string');
    });

    test('客户端出站消息（回填字段为空占位）可正常编码', () => {
        const msg: WSMessage = {
            route_target: [123],
            route_target_type: TargetType.USER,
            timestamp: Date.now(),
            type: MessageType.CHAT_TEXT,
            payload: new Uint8Array(),
            sender_id: 0,
            version: 1,
            msg_id: '',
            session_id: '',
            msg_seq: '0',
            deliver_to: [],
        };
        const decoded = WSMessage.decode(WSMessage.encode(msg).finish());
        expect(decoded.msg_seq).toBe('0');
        expect(decoded.deliver_to).toEqual([]);
    });

    test('BaseMessage.msg_seq / PersistAck.seq 均为 string 且无损', () => {
        const base: BaseMessage = {
            msg_id: 'm1',
            client_id: 'c1',
            session_id: 's1',
            session_key: 'k1',
            from_user_id: 1,
            target: 2,
            send_time: Date.now(),
            msg_seq: BIGGER_SEQ,
            status: MessageStatus.MESSAGE_STATUS_SENT,
            ext: {},
        };
        expect(BaseMessage.decode(BaseMessage.encode(base).finish()).msg_seq).toBe(BIGGER_SEQ);

        const ack: PersistAck = {
            msg_id: 'm1',
            client_id: 'c1',
            session_id: 's1',
            target: 1,
            ack_status: 0,
            timestamp: Date.now(),
            seq: BIG_SEQ,
            session_key: '',
        };
        expect(PersistAck.decode(PersistAck.encode(ack).finish()).seq).toBe(BIG_SEQ);
    });
});
