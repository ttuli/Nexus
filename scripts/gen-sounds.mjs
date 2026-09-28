/**
 * 生成应用提示音到 public/audio/。纯合成、不依赖外部素材，调整下方参数后重新执行即可：
 *
 *   node scripts/gen-sounds.mjs
 *
 * - notify_msg.wav      新消息：上行四度的两声清亮「叮」，短促、不抢注意力
 * - notify_request.wav  好友 / 群申请：木琴音色的上行三和弦，比新消息更像「有人找你」
 * - phonering.wav       通话振铃（主叫回铃与被叫来电共用，靠音量区分）：
 *                       木琴旋律 + 一段静音，按 loop 循环播放，尾音在文件结束前完全收住以免接缝处咔哒
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SAMPLE_RATE = 44100;
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/audio');

/** 十二平均律音高（A4 = 440Hz） */
const NOTE = {
    E5: 659.25, G5: 783.99, A5: 880.0,
    C6: 1046.5, D6: 1174.66, E6: 1318.51, A6: 1760.0,
};

/**
 * 音色：每个泛音相对基频的倍数、振幅、指数衰减的时间常数（秒）。
 * 钟琴泛音接近整数倍，听感清亮；木琴第二泛音在约 3.9 倍处，衰减快，听感温润。
 */
const BELL = [
    { ratio: 1, amp: 1.0, tau: 0.16 },
    { ratio: 2, amp: 0.22, tau: 0.07 },
    { ratio: 3.01, amp: 0.07, tau: 0.04 },
];
const MARIMBA = [
    { ratio: 1, amp: 1.0, tau: 0.28 },
    { ratio: 3.93, amp: 0.3, tau: 0.05 },
    { ratio: 9.2, amp: 0.05, tau: 0.015 },
];

function createBuffer(seconds) {
    return new Float32Array(Math.round(seconds * SAMPLE_RATE));
}

/** 在 start 秒处叠加一个音；decay 按倍数拉长整体衰减（用于句尾长音） */
function addNote(buf, freq, start, { timbre, gain = 1, decay = 1, attack = 0.004 }) {
    const from = Math.round(start * SAMPLE_RATE);
    // 衰减到约 -60dB（e^-7）后不再计算
    const longest = Math.max(...timbre.map((p) => p.tau)) * decay;
    const len = Math.min(buf.length - from, Math.round(longest * 7 * SAMPLE_RATE));
    for (let i = 0; i < len; i++) {
        const t = i / SAMPLE_RATE;
        // 线性起音：从 0 瞬间跳到满幅会爆出咔哒声
        const env = Math.min(1, t / attack);
        let s = 0;
        for (const p of timbre) {
            s += p.amp * Math.exp(-t / (p.tau * decay)) * Math.sin(2 * Math.PI * freq * p.ratio * t);
        }
        buf[from + i] += gain * env * s;
    }
}

/** 归一化到目标峰值，并做首尾淡入淡出：防止播放起止处出现咔哒声，循环播放时接缝平滑 */
function finalize(buf, peak, fadeOutSeconds = 0.005) {
    let max = 0;
    for (const v of buf) max = Math.max(max, Math.abs(v));
    const scale = max > 0 ? peak / max : 0;
    const fadeIn = Math.round(0.002 * SAMPLE_RATE);
    const fadeOut = Math.round(fadeOutSeconds * SAMPLE_RATE);
    for (let i = 0; i < buf.length; i++) {
        let g = scale;
        if (i < fadeIn) g *= i / fadeIn;
        const remain = buf.length - 1 - i;
        if (remain < fadeOut) g *= remain / fadeOut;
        buf[i] *= g;
    }
    return buf;
}

/** 16 位单声道 PCM WAV */
function writeWav(name, buf) {
    const data = Buffer.alloc(buf.length * 2);
    for (let i = 0; i < buf.length; i++) {
        data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);               // fmt 块大小
    header.writeUInt16LE(1, 20);                // PCM
    header.writeUInt16LE(1, 22);                // 单声道
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(SAMPLE_RATE * 2, 28);  // 字节率
    header.writeUInt16LE(2, 32);                // 块对齐
    header.writeUInt16LE(16, 34);               // 位深
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    writeFileSync(path.join(OUT_DIR, name), Buffer.concat([header, data]));
    console.log(`${name}: ${(buf.length / SAMPLE_RATE).toFixed(2)}s, ${((44 + data.length) / 1024).toFixed(0)}KB`);
}

// 新消息：E6 → A6，第二声略长略响，形成「叮—咚」的上扬感
{
    const buf = createBuffer(0.7);
    addNote(buf, NOTE.E6, 0, { timbre: BELL, gain: 0.7 });
    addNote(buf, NOTE.A6, 0.085, { timbre: BELL, decay: 1.3 });
    writeWav('notify_msg.wav', finalize(buf, 0.5, 0.1));
}

// 好友 / 群申请：G5 → C6 → E6 上行三和弦，末音拖长
{
    const buf = createBuffer(1.2);
    [NOTE.G5, NOTE.C6, NOTE.E6].forEach((freq, i) => {
        addNote(buf, freq, i * 0.11, { timbre: MARIMBA, gain: 0.8 + i * 0.1, decay: i === 2 ? 1.4 : 1 });
    });
    writeWav('notify_request.wav', finalize(buf, 0.5, 0.15));
}

// 振铃：两句木琴旋律（五声音阶）+ 约 1 秒静音为一个循环周期
{
    const BEAT = 0.16;
    /** [音名, 第几拍, 衰减倍数] */
    const melody = [
        ['E5', 0], ['G5', 1], ['C6', 2], ['G5', 3], ['A5', 4], ['C6', 5], ['E6', 6, 1.6],
        ['D6', 9], ['C6', 10], ['A5', 11], ['C6', 12, 1.4],
    ];
    const buf = createBuffer(3.4);
    for (const [name, beat, decay = 1] of melody) {
        addNote(buf, NOTE[name], beat * BEAT, { timbre: MARIMBA, decay });
        // 低八度轻轻垫一层，让高音区的木琴不那么单薄
        addNote(buf, NOTE[name] / 2, beat * BEAT, { timbre: MARIMBA, gain: 0.18, decay });
    }
    writeWav('phonering.wav', finalize(buf, 0.8, 0.3));
}
