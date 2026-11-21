/**
 * 抹平主进程 (process.env) 和渲染进程 (import.meta.env) 的环境变量读取差异。
 * 优先取运行时环境变量（开发时主进程由 dotenv 从 .env 注入，也便于临时覆盖），
 * 没有再取构建时写进包里的 import.meta.env。
 * 主进程里 process.env 总是存在，不能见它就直接返回：打包后没有 .env，
 * 会拿到 undefined 退回 localhost 默认值。
 */
export const getEnv = (key: string): string | undefined => {
    const runtime = typeof process !== 'undefined' ? process.env?.[key] : undefined;
    if (runtime !== undefined) {
        return runtime;
    }
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        return import.meta.env[key];
    }
    return undefined;
};
