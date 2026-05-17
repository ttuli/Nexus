/**
 * imchat 服务器 QPS 压测脚本
 * 用法: node test/qps_test.js [options]
 *
 * 选项:
 *   --url         测试目标 URL（默认读取下方 CONFIG）
 *   --concurrency 并发数（默认 10）
 *   --duration    测试时长（秒，默认 10）
 *   --rps         目标 RPS 限速（0 = 不限，默认 0）
 *   --endpoint    使用预置端点名称（health | getAuthCode | friendList）
 *
 * 示例:
 *   node test/qps_test.js
 *   node test/qps_test.js --concurrency 50 --duration 30
 *   node test/qps_test.js --endpoint getAuthCode --concurrency 20
 */

'use strict';

const http = require('http');
const https = require('https');

// ─────────────────────────────────────────────
// 全局配置
// ─────────────────────────────────────────────
const CONFIG = {
    baseUrl: 'http://175.178.112.138:8021',
    concurrency: 10,
    duration: 10,       // 测试时长（秒）
    rps: 0,             // 目标 RPS；0 = 不限速
    timeout: 5000,      // 单次请求超时（ms）

    // 预置测试端点
    endpoints: {
        // 健康检查（轻量，推荐首选）
        health: {
            path: '/health',
            method: 'GET',
            headers: {},
            body: null,
        },
        // 获取验证码（POST，无需登录）
        getAuthCode: {
            path: '/auth/getAuthCode',
            method: 'POST',
            // Protobuf 编码的 GetAuthCodeReq { phone: "13800000000" }
            // 字段 1 (phone, string): tag=0x0A, len=11, "13800000000"
            body: Buffer.from([0x0a, 0x0b, 0x31, 0x33, 0x38, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30]),
            headers: { 'Content-Type': 'application/octet-stream' },
        },
        // 好友列表（GET，需要 Authorization token）
        friendList: {
            path: '/user/info?ids=1000002000',
            method: 'GET',
            body: null,
        },
    },

    // 默认使用健康检查端点
    defaultEndpoint: 'health',
};

// ─────────────────────────────────────────────
// 解析命令行参数
// ─────────────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
            result[key] = val;
        }
    }
    return result;
}

// ─────────────────────────────────────────────
// 统计数据结构
// ─────────────────────────────────────────────
function createStats() {
    return {
        total: 0,
        success: 0,
        failed: 0,
        timeout: 0,
        statusCodes: {},       // { "200": count, "404": count, ... }
        latencies: [],         // ms
        startTime: Date.now(),
        errors: {},            // { "ECONNREFUSED": count, ... }
    };
}

// ─────────────────────────────────────────────
// 单次 HTTP 请求
// ─────────────────────────────────────────────
function doRequest(options, body, timeoutMs) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const lib = options.protocol === 'https:' ? https : http;

        const req = lib.request(options, (res) => {
            // 耗尽响应体，否则 socket 无法复用
            res.resume();
            res.on('end', () => {
                resolve({ ok: true, status: res.statusCode, latency: Date.now() - t0 });
            });
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve({ ok: false, timedOut: true, latency: Date.now() - t0 });
        });

        req.on('error', (err) => {
            resolve({ ok: false, error: err.code || err.message, latency: Date.now() - t0 });
        });

        if (body) {
            req.write(body);
        }
        req.end();
    });
}

// ─────────────────────────────────────────────
// 百分位数计算
// ─────────────────────────────────────────────
function percentile(sortedArr, p) {
    if (!sortedArr.length) return 0;
    const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, idx)];
}

// ─────────────────────────────────────────────
// 打印进度条（每秒刷新）
// ─────────────────────────────────────────────
function printProgress(stats, elapsed, duration) {
    const qps = elapsed > 0 ? (stats.total / elapsed).toFixed(1) : '0.0';
    const successRate = stats.total > 0
        ? ((stats.success / stats.total) * 100).toFixed(1)
        : '0.0';
    const bar = '█'.repeat(Math.round((elapsed / duration) * 20)).padEnd(20, '░');
    process.stdout.write(
        `\r[${bar}] ${elapsed.toFixed(0)}s/${duration}s  ` +
        `总请求:${stats.total}  QPS:${qps}  成功率:${successRate}%  失败:${stats.failed}  超时:${stats.timeout}   `
    );
}

// ─────────────────────────────────────────────
// 打印最终报告
// ─────────────────────────────────────────────
function printReport(stats, duration) {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const qps = (stats.total / elapsed).toFixed(2);
    const sorted = stats.latencies.slice().sort((a, b) => a - b);
    const avg = sorted.length ? (sorted.reduce((s, v) => s + v, 0) / sorted.length).toFixed(2) : 0;

    console.log('\n');
    console.log('═══════════════════════════════════════════════');
    console.log('              服务器 QPS 测试报告               ');
    console.log('═══════════════════════════════════════════════');
    console.log(`  测试时长       : ${elapsed.toFixed(2)} 秒`);
    console.log(`  总请求数       : ${stats.total}`);
    console.log(`  成功请求       : ${stats.success}`);
    console.log(`  失败请求       : ${stats.failed}`);
    console.log(`  超时请求       : ${stats.timeout}`);
    console.log(`  成功率         : ${stats.total ? ((stats.success / stats.total) * 100).toFixed(2) : 0}%`);
    console.log('───────────────────────────────────────────────');
    console.log(`  实际 QPS       : ${qps}`);
    console.log('───────────────────────────────────────────────');
    console.log('  延迟分布（ms）:');
    console.log(`    最小           : ${sorted[0] ?? 0}`);
    console.log(`    平均           : ${avg}`);
    console.log(`    P50 (中位数)   : ${percentile(sorted, 50)}`);
    console.log(`    P75            : ${percentile(sorted, 75)}`);
    console.log(`    P90            : ${percentile(sorted, 90)}`);
    console.log(`    P95            : ${percentile(sorted, 95)}`);
    console.log(`    P99            : ${percentile(sorted, 99)}`);
    console.log(`    最大           : ${sorted[sorted.length - 1] ?? 0}`);
    console.log('───────────────────────────────────────────────');
    console.log('  HTTP 状态码分布:');
    const codes = Object.entries(stats.statusCodes).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (codes.length === 0) {
        console.log('    （无成功响应）');
    } else {
        for (const [code, count] of codes) {
            const pct = ((count / stats.total) * 100).toFixed(1);
            console.log(`    ${code.padEnd(6)} : ${count} (${pct}%)`);
        }
    }
    if (Object.keys(stats.errors).length > 0) {
        console.log('───────────────────────────────────────────────');
        console.log('  错误类型分布:');
        for (const [code, count] of Object.entries(stats.errors)) {
            console.log(`    ${code.padEnd(20)} : ${count}`);
        }
    }
    console.log('═══════════════════════════════════════════════');
}

// ─────────────────────────────────────────────
// 主逻辑
// ─────────────────────────────────────────────
async function main() {
    const args = parseArgs();

    // 合并参数
    const concurrency = parseInt(args.concurrency || CONFIG.concurrency, 10);
    const duration = parseInt(args.duration || CONFIG.duration, 10);
    const rps = parseInt(args.rps || CONFIG.rps, 10);
    const endpointName = args.endpoint || CONFIG.defaultEndpoint;

    let targetUrl, method, body, extraHeaders;

    if (args.url) {
        // 完全自定义 URL
        targetUrl = args.url;
        method = (args.method || 'GET').toUpperCase();
        body = null;
        extraHeaders = {};
    } else {
        const ep = CONFIG.endpoints[endpointName];
        if (!ep) {
            console.error(`❌ 未知端点: ${endpointName}，可选: ${Object.keys(CONFIG.endpoints).join(', ')}`);
            process.exit(1);
        }
        targetUrl = CONFIG.baseUrl + ep.path;
        method = ep.method;
        body = ep.body || null;
        extraHeaders = ep.headers || {};
    }

    const parsed = new URL(targetUrl);
    const reqOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method,
        protocol: parsed.protocol,
        headers: {
            'Connection': 'keep-alive',
            ...extraHeaders,
            ...(body ? { 'Content-Length': body.length } : {}),
        },
    };

    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('           imchat 服务器 QPS 压测工具           ');
    console.log('════════════════════════════════════════════════');
    console.log(`  目标地址   : ${targetUrl}`);
    console.log(`  HTTP 方法  : ${method}`);
    console.log(`  并发数     : ${concurrency}`);
    console.log(`  测试时长   : ${duration} 秒`);
    console.log(`  限速 RPS   : ${rps === 0 ? '不限' : rps}`);
    console.log(`  超时阈值   : ${CONFIG.timeout} ms`);
    console.log('════════════════════════════════════════════════');
    console.log('');

    const stats = createStats();
    const endTime = Date.now() + duration * 1000;
    let stopped = false;

    // 计算限速间隔（ms per request, for each worker）
    const intervalPerWorkerMs = rps > 0 ? (concurrency / rps) * 1000 : 0;

    // 进度刷新定时器
    const progressTimer = setInterval(() => {
        const elapsed = (Date.now() - stats.startTime) / 1000;
        printProgress(stats, elapsed, duration);
        if (elapsed >= duration) {
            clearInterval(progressTimer);
        }
    }, 500);

    // 单个 worker 的循环
    async function worker() {
        while (!stopped && Date.now() < endTime) {
            const loopStart = Date.now();
            const result = await doRequest(reqOptions, body, CONFIG.timeout);

            stats.total++;
            if (result.timedOut) {
                stats.timeout++;
                stats.failed++;
            } else if (result.ok) {
                stats.success++;
                stats.statusCodes[result.status] = (stats.statusCodes[result.status] || 0) + 1;
                stats.latencies.push(result.latency);
            } else {
                stats.failed++;
                const errCode = result.error || 'UNKNOWN';
                stats.errors[errCode] = (stats.errors[errCode] || 0) + 1;
            }

            // 限速：如果配置了 rps，等待剩余时间
            if (intervalPerWorkerMs > 0) {
                const elapsed = Date.now() - loopStart;
                const wait = intervalPerWorkerMs - elapsed;
                if (wait > 0) await sleep(wait);
            }
        }
    }

    // 启动全部 worker
    const workers = Array.from({ length: concurrency }, () => worker());

    // 测试时长结束后停止
    await sleep(duration * 1000);
    stopped = true;

    // 等待所有 worker 完成正在进行的请求
    await Promise.all(workers);

    clearInterval(progressTimer);
    printReport(stats, duration);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
    console.error('❌ 脚本异常:', err);
    process.exit(1);
});
