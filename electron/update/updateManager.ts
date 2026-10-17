/**
 * 应用更新管理（主进程）
 *
 * 三种更新方式。前两种由发版时写进 latest.yml 的 vendor.updateMode 决定（npm run build -- --update-mode=…，
 * 见 scripts/build.mjs），第三种由服务端决定：
 * 1. 弹窗更新（prompt，默认）：启动探测通过后在后台查询更新源，有新版本先记下，登录成功进入主窗口后才弹提示框
 *    （登录窗只处理强制更新）。用户选「立即更新」才打开更新窗口下载，下载完由用户决定何时重启安装。
 * 2. 无感更新（silent）：查到新版本就在后台静默下载，不弹任何提示；下次正常退出时静默安装，再启动即是新版本。
 *    退出时还没下完的，界面照常收掉，进程留在后台下完再退出并安装。
 *    退出时没装上的（异常退出、关机、被安全软件拦截），下次启动查询后复用已下载的安装包，等下一次退出再装；
 *    同一版本连续多次没装上就不再静默重试，改为弹窗，由更新窗口引导用户手动安装。
 * 3. 强制更新：请求层收到 Auth 服务的 426 → 断开 WS、等各窗口落盘后全部关闭 → 打开更新窗口
 *    → 自动检查、下载 → 退出并静默安装，装完自动重启。
 * 此外设置页可以手动「检查更新」，发现新版本后由用户点「立即更新」打开更新窗口，之后与弹窗更新相同。
 *
 * 「要不要强制」由服务端判定（Auth 版本中间件），安装包走 electron-updater + 更新源（latest.yml）。
 * 两者分开：更新源不可达只会让下载失败（更新窗口给出重试 / 官网下载），不会让强制更新被绕过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';
import electronUpdater from 'electron-updater';
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater';
import { windowManager } from '@/electron/windows/windowManager';
import { wsManager } from '@/electron/websocket';
import { storage, StorageKeys } from '@/electron/utils/storage';
import { mainGet, MainRequestError } from '@/electron/resource/mainRequest';
import { WindowKey } from '@shared/config/windowKeys';
import { APP_CONSTANTS as config } from '@shared/config/constants';
import {
    IpcChannels,
    UpdateCheckResult,
    UpdateProgress,
    UpdatePromptAction,
    UpdatePromptInfo,
    UpdateState,
} from '@shared/types';
import {
    HTTP_UPGRADE_REQUIRED,
    UpgradeRequiredInfo,
    getAppVersion,
    isUpgradeRequired,
    onUpdateWindowClosed,
    onUpgradeRequired,
} from './updateSignals';
import { setupUpdateIpcHandlers } from './ipcHandlers';

// electron-updater 是 CommonJS 包，导出挂在 getter 上，ESM 下具名导入会被 Node 拒绝，只能取默认导出再解构
const { autoUpdater, CancellationToken } = electronUpdater;
type CancellationTokenInstance = InstanceType<typeof CancellationToken>;

/** 启动探测超时。探测排在登录窗之前，不能拖慢启动太久；超时按探测失败处理，交给登录时兜底 */
const PROBE_TIMEOUT_MS = 2500;
/** 强制更新下载完后停留片刻再重启，让用户看清「即将重启安装」 */
const INSTALL_DELAY_MS = 1500;
/**
 * 同一版本自动安装的次数上限，强制更新的自动安装和退出时的静默安装都计入。
 * 装完再启动仍是旧版本，说明安装被拦（安全软件、文件占用等）；不设上限会陷入
 * 「装失败 → 旧版启动 → 426 → 再装再失败」或「每次退出都偷偷装一次、次次失败」的死循环。
 */
const MAX_AUTO_INSTALL_ATTEMPTS = 2;
/** 退出时最多等后台下载这么久：网络太慢就不等了，直接退出，下次启动重新下载 */
const QUIT_DOWNLOAD_WAIT_MS = 10 * 60 * 1000;

/**
 * 发版时指定的更新方式，取自 latest.yml 的 vendor.updateMode，缺省或不认识的值按 prompt 处理。
 * 强制更新不在这里指定，由服务端的最低版本（etcd config/app.min_version）决定。
 */
type ReleaseUpdateMode = 'prompt' | 'silent';

interface InstallRecord {
    version: string;
    attempts: number;
}

type Shutdown = (onQuit: () => void) => void;

/** 比较 x.y.z，忽略预发布后缀；非法版本按 0.0.0 处理 */
function compareVersions(a: string, b: string): number {
    const parse = (v: string) => (v.match(/^v?(\d+)\.(\d+)\.(\d+)/)?.slice(1) ?? ['0', '0', '0']).map(Number);
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

/** electron-builder 把 releaseInfo.vendor 原样写进 latest.yml，electron-updater 解析时也原样保留 */
function releaseUpdateMode(info: UpdateInfo): ReleaseUpdateMode {
    const mode = (info as UpdateInfo & { vendor?: { updateMode?: unknown } }).vendor?.updateMode;
    return mode === 'silent' ? 'silent' : 'prompt';
}

/** 更新说明规整为纯文本：部分来源给的是 HTML，渲染层一律按文本展示，不走 v-html */
function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string | undefined {
    if (!notes) return undefined;
    const text = typeof notes === 'string'
        ? notes
        : notes.map((n) => n.note ?? '').filter(Boolean).join('\n\n');
    const plain = text
        .replace(/\r\n?/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|li|h\d)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return plain || undefined;
}

/** electron-updater 的错误信息常带整段堆栈和请求头，只取首行给用户看 */
function briefError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    const line = text.split('\n')[0].trim();
    return line.length > 160 ? `${line.slice(0, 160)}…` : line;
}

export class UpdateManager {
    /** 优雅退出：由 resourceManager.destroy 提供（落盘 → 断 WS → 关库 → onQuit） */
    private shutdown: Shutdown = (onQuit) => onQuit();
    /** 更新窗口的状态；为 null 表示更新窗口未打开 */
    private state: UpdateState | null = null;
    /** 待用户答复的可选更新提示 */
    private prompt: UpdatePromptInfo | null = null;
    /** 最近一次查询到的新版本，设置页「立即更新」据此打开更新窗口 */
    private available: UpdatePromptInfo | null = null;
    /** 426 响应给出的最低版本 */
    private minVersion = '';
    /**
     * 进行中的下载。无感更新的后台下载、更新窗口的下载共用这一个任务：
     * 后台正在下载时打开更新窗口，窗口接着显示进度，不会重新下载
     */
    private downloadTask: Promise<void> | null = null;
    private downloadToken: CancellationTokenInstance | null = null;
    /** 最近一次的下载进度，更新窗口中途接手后台下载时先显示它 */
    private lastProgress: UpdateProgress | null = null;
    /** 后台静默下载进行中：用户中途打开又关掉更新窗口，不取消它 */
    private silentDownloading = false;
    private downloadedFile = '';
    /** 本次运行已下载完成的版本，正常退出时由 autoInstallOnAppQuit 静默安装 */
    private downloadedVersion = '';
    /** 检查进行中，挡住重复的「重试」 */
    private checking = false;
    private installing = false;
    /** 退出被推迟，进程留在后台等下载完成 */
    private quitDeferred = false;
    private initialized = false;

    public init(shutdown: Shutdown): void {
        if (this.initialized) return;
        this.initialized = true;
        this.shutdown = shutdown;

        // 不让 electron-updater 查到就下载：弹窗更新要等用户同意（更新包走 OSS 按流量计费，也不是每个人都想马上更新），
        // 无感更新和强制更新由本模块显式发起下载
        autoUpdater.autoDownload = false;
        // 已下载但还没安装的（无感更新、下载完点了「稍后安装」的），下次正常退出时静默装上
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.on('download-progress', (p: ProgressInfo) => this.onProgress(p));
        autoUpdater.on('update-downloaded', (e: UpdateDownloadedEvent) => {
            this.downloadedFile = e.downloadedFile;
            this.downloadedVersion = e.version;
        });
        app.on('before-quit', (event) => this.onBeforeQuit(event));
        app.on('quit', (_event, exitCode) => this.onAppQuit(exitCode));

        this.reconcileInstallRecord();
        if (this.canAutoUpdate()) {
            this.cleanInstalledUpdate();
        }
        onUpgradeRequired((info) => void this.enterForcedMode(info));
        onUpdateWindowClosed(() => this.handleWindowClosed());
        setupUpdateIpcHandlers(this);
    }

    // ==================== 启动检查 ====================

    /**
     * 启动检查，必须在打开登录窗之前调用。
     * 放在登录窗之前而不是并行：426 若在登录页还没加载完时到达，关窗要等渲染层响应 APP_QUIT，
     * 未加载的页面收不到，只能干等 closeAllWindows 的 10 秒超时。
     *
     * @returns true 表示已进入强制更新（更新窗口已接管），调用方不应再打开登录窗
     */
    public async checkOnStartup(): Promise<boolean> {
        try {
            // 接口本身什么都不做，由 Auth 的版本中间件回答：够新 200，过低 426
            await mainGet(`${config.authServer}/auth/version`, { skipAuth: true, timeout: PROBE_TIMEOUT_MS });
        } catch (error) {
            if (error instanceof MainRequestError && error.statusCode === HTTP_UPGRADE_REQUIRED) {
                // 426 已由请求层上报，enterForcedMode 正在接管
                return true;
            }
            // 断网 / 超时 / 服务不可达：不拦。登录与刷新 token 经过同一个中间件，会在那里补上
            console.warn('[UpdateManager] 启动版本探测失败，交由登录时判定:', (error as Error).message);
        }
        void this.checkOptionalUpdate();
        return false;
    }

    /** 查询新版本并按发版时指定的方式处理；查不到不影响使用，下次启动再查 */
    private async checkOptionalUpdate(): Promise<void> {
        if (!this.canAutoUpdate()) return;
        try {
            const result = await autoUpdater.checkForUpdates();
            if (!result?.isUpdateAvailable || isUpgradeRequired()) return;
            const info = this.rememberAvailable(result.updateInfo);

            if (releaseUpdateMode(result.updateInfo) === 'silent') {
                if (!this.isAutoInstallBlocked(info.version)) {
                    void this.downloadSilently(info.version);
                    return;
                }
                // 前几次退出时都没装上，再静默重试也是白费：改为弹窗，下载后更新窗口会引导手动安装
                console.warn(`[UpdateManager] ${info.version} 多次静默安装未生效，改为提示用户`);
                autoUpdater.autoInstallOnAppQuit = false;
            } else if (storage.get<string>(StorageKeys.UPDATE_SKIPPED_VERSION) === info.version) {
                return;
            }

            this.prompt = info;
            this.pushPrompt();
        } catch (error) {
            console.warn('[UpdateManager] 检查更新失败:', briefError(error));
        }
    }

    /** 无感更新：后台静默下载，下完等下次正常退出时由 autoInstallOnAppQuit 静默安装 */
    private async downloadSilently(version: string): Promise<void> {
        this.silentDownloading = true;
        try {
            await this.ensureDownload();
            console.info(`[UpdateManager] ${version} 已在后台下载完成，下次退出时安装`);
        } catch (error) {
            // 转入强制更新时会取消后台下载，不算失败
            if (!isUpgradeRequired()) {
                console.warn('[UpdateManager] 后台下载失败，下次启动重试:', briefError(error));
            }
        } finally {
            this.silentDownloading = false;
        }
    }

    // ==================== 设置页手动检查 ====================

    /** 设置页「检查更新」：只查询不下载，发现新版本由用户点「立即更新」再走 startUpdate。不受「跳过此版本」影响 */
    public async checkManually(): Promise<UpdateCheckResult> {
        if (!this.canAutoUpdate()) {
            return { status: 'error', error: '开发环境不支持自动更新' };
        }
        try {
            const result = await autoUpdater.checkForUpdates();
            if (!result) {
                return { status: 'error', error: '自动更新不可用' };
            }
            if (!result.isUpdateAvailable) {
                return { status: 'latest' };
            }
            return { status: 'available', version: this.rememberAvailable(result.updateInfo).version };
        } catch (error) {
            return { status: 'error', error: briefError(error) };
        }
    }

    /** 设置页「立即更新」：打开更新窗口下载最近一次查到的新版本 */
    public startUpdate(): void {
        if (this.available) {
            this.openOptionalUpdate(this.available);
        }
    }

    // ==================== 可选更新提示 ====================

    public getPrompt(): UpdatePromptInfo | null {
        return this.prompt;
    }

    /**
     * 只推给主窗口：可选更新等登录成功后再提示，不在登录窗打扰。
     * 检查一般在登录完成前就有结果，此时主窗口还没打开，由它挂载时 UPDATE_GET_PROMPT 补拉。
     */
    private pushPrompt(): void {
        if (!this.prompt) return;
        windowManager.sendMessage(WindowKey.Home, IpcChannels.UPDATE_PROMPT, this.prompt);
    }

    public respondPrompt(action: UpdatePromptAction): void {
        const prompt = this.prompt;
        this.prompt = null;
        if (!prompt) return;

        if (action === 'skip') {
            storage.set(StorageKeys.UPDATE_SKIPPED_VERSION, prompt.version);
        } else if (action === 'update') {
            this.openOptionalUpdate(prompt);
        }
    }

    /** 打开更新窗口下载 info 对应的版本。更新窗口已经开着（含强制更新）就只把它唤到前面 */
    private openOptionalUpdate(info: UpdatePromptInfo): void {
        this.prompt = null;
        if (this.state) {
            windowManager.showWindow(WindowKey.Update);
            return;
        }
        this.setState({
            mode: 'optional',
            phase: 'downloading',
            targetVersion: info.version,
            releaseNotes: info.releaseNotes,
        });
        windowManager.CreateWindow({ key: WindowKey.Update });
        void this.download();
    }

    // ==================== 强制更新 ====================

    private async enterForcedMode(info: UpgradeRequiredInfo): Promise<void> {
        console.warn(`[UpdateManager] 服务端要求更新：当前 ${getAppVersion()}，最低 ${info.minVersion || '未知'}`);
        this.prompt = null;
        this.minVersion = info.minVersion;
        this.cancelDownload();
        this.setState({ mode: 'forced', phase: 'checking', serverMessage: info.message });

        // 旧版本不能再和服务端通信：断开 WS（主动断开不会触发重连），等各窗口落盘后全部关闭
        wsManager.closeWs();
        await windowManager.closeAllWindows();
        windowManager.CreateWindow({ key: WindowKey.Update });
        await this.checkAndDownload();
    }

    // ==================== 检查 / 下载 / 安装 ====================

    public getState(): UpdateState | null {
        return this.state;
    }

    /** 检查并下载：强制更新的入口，也是两种模式下「重试」的入口 */
    public async checkAndDownload(): Promise<void> {
        if (!this.state || this.checking || this.installing || this.state.phase === 'downloading') return;
        if (!this.canAutoUpdate()) {
            this.patch({ phase: 'error', error: '开发环境不支持自动更新' });
            return;
        }

        this.checking = true;
        this.patch({ phase: 'checking', error: undefined, progress: undefined });
        try {
            const result = await autoUpdater.checkForUpdates();
            if (!result?.isUpdateAvailable) {
                this.patch({ phase: 'error', error: '暂未找到可用的新版本，请稍后重试或前往官网下载' });
                return;
            }

            const { version, releaseNotes } = result.updateInfo;
            this.patch({ targetVersion: version, releaseNotes: normalizeReleaseNotes(releaseNotes) });

            // 更新源上的最新版仍低于服务端要求：装上重启也还是 426，直接说明，不做无用的安装
            if (this.state?.mode === 'forced' && this.minVersion && compareVersions(version, this.minVersion) < 0) {
                this.patch({
                    phase: 'error',
                    error: `需要 ${this.minVersion} 及以上版本，自动更新目前只提供 ${version}，请前往官网下载`,
                });
                return;
            }
        } catch (error) {
            this.patch({ phase: 'error', error: `检查更新失败：${briefError(error)}` });
            return;
        } finally {
            this.checking = false;
        }
        await this.download();
    }

    /** 更新窗口的下载。后台已经在下载同一版本时接着它显示进度；已下载过的由 electron-updater 校验缓存后直接返回 */
    private async download(): Promise<void> {
        if (!this.state) return;
        this.patch({
            phase: 'downloading',
            error: undefined,
            progress: this.downloadTask && this.lastProgress
                ? this.lastProgress
                : { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
        });

        try {
            await this.ensureDownload();
        } catch (error) {
            // 关窗、转入强制更新时下载会被取消，状态已由它们接管
            if (this.state?.phase === 'downloading') {
                this.patch({ phase: 'error', error: `下载失败：${briefError(error)}` });
            }
            return;
        }
        if (this.state?.phase === 'downloading') {
            this.onDownloaded();
        }
    }

    /** 返回进行中的下载，没有就发起一个 */
    private ensureDownload(): Promise<void> {
        if (this.downloadTask && !this.downloadToken?.cancelled) {
            return this.downloadTask;
        }
        // 已取消的旧下载要等它真正结束再发起：结束前 electron-updater 会把新的下载请求并进旧任务，跟着一起失败
        const previous = this.downloadTask?.catch(() => undefined);
        const token = new CancellationToken();
        this.downloadToken = token;
        this.lastProgress = null;

        const task = (async () => {
            await previous;
            this.downloadedFile = '';
            const files = await autoUpdater.downloadUpdate(token);
            this.downloadedFile ||= files[0] ?? '';
        })();
        this.downloadTask = task;
        void task.catch(() => undefined).finally(() => {
            if (this.downloadTask === task) {
                this.downloadTask = null;
                this.downloadToken = null;
            }
        });
        return task;
    }

    private onProgress(p: ProgressInfo): void {
        this.lastProgress = {
            percent: p.percent,
            transferred: p.transferred,
            total: p.total,
            bytesPerSecond: p.bytesPerSecond,
        };
        if (this.state?.phase === 'downloading') {
            this.patch({ progress: this.lastProgress });
        }
    }

    private onDownloaded(): void {
        const state = this.state;
        if (!state) return;
        const hasInstaller = !!this.downloadedFile;

        // 无感更新、强制更新都可能已经在这个版本上自动安装失败过多次，两种模式一样处理
        if (this.isAutoInstallBlocked(state.targetVersion)) {
            // 不再自动装，退出时也别再静默装一次
            autoUpdater.autoInstallOnAppQuit = false;
            this.patch({
                phase: 'install-failed',
                hasInstaller,
                error: '新版本已下载，但自动安装多次未能完成（可能被安全软件拦截），请手动运行安装包',
            });
            return;
        }

        if (state.mode === 'optional') {
            this.patch({ phase: 'downloaded', hasInstaller });
            return;
        }

        this.patch({ phase: 'installing', hasInstaller });
        setTimeout(() => this.install(), INSTALL_DELAY_MS);
    }

    /**
     * 退出并安装。走 resourceManager 的优雅退出链：落盘、断 WS、关库之后才交给安装程序，
     * 直接调 quitAndInstall 会跳过这些步骤。
     */
    public install(): void {
        const target = this.state?.targetVersion;
        const phase = this.state?.phase;
        if (this.installing || !target) return;
        if (phase !== 'downloaded' && phase !== 'installing' && phase !== 'install-failed') return;

        this.installing = true;
        this.recordInstallAttempt(target);
        this.patch({ phase: 'installing', error: undefined });
        // isSilent：NSIS 配的是 oneClick: false，不静默的话每次更新都要再走一遍安装向导
        // isForceRunAfter：装完自动重新打开
        this.shutdown(() => autoUpdater.quitAndInstall(true, true));
    }

    /**
     * 无感更新的后台下载还没完成就退出（托盘「退出」、关登录窗等）：先不结束进程，等下完再退出，
     * 退出时由 autoInstallOnAppQuit 静默安装。到这里时退出流程已关掉窗口、托盘、WS 和数据库，
     * 用户看来应用已经退出了。下载失败或等太久就直接退出，下次启动重新下载。
     * 系统关机 / 注销时 Windows 下不会触发 before-quit，不会因此拖住关机
     */
    private onBeforeQuit(event: Electron.Event): void {
        const task = this.downloadTask;
        if (this.quitDeferred || !this.silentDownloading || !task || this.installing || isUpgradeRequired()) return;

        event.preventDefault();
        this.quitDeferred = true;
        console.info('[UpdateManager] 后台下载还没完成，下完再退出并安装');
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<void>((resolve) => {
            timer = setTimeout(resolve, QUIT_DOWNLOAD_WAIT_MS);
        });
        void Promise.race([task.catch(() => undefined), timeout]).finally(() => {
            clearTimeout(timer);
            app.quit();
        });
    }

    /**
     * 退出前在后台等下载时，用户又启动了应用：新实例拿不到单实例锁会直接退出，而本实例的界面、数据库已收掉恢复不了。
     * 放弃这次下载，退出后重新启动，下次启动会重新下载。
     * @returns true 表示已接管，调用方不要再去唤起窗口
     */
    public handleSecondInstance(): boolean {
        if (!this.quitDeferred) return false;
        console.info('[UpdateManager] 等待后台下载时应用被再次启动，放弃下载并重新启动');
        this.cancelDownload();
        app.relaunch();
        app.exit(0);
        return true;
    }

    /**
     * 正常退出时 electron-updater 会静默安装本次运行下载好的新版本（autoInstallOnAppQuit），这里把它记为一次安装尝试：
     * 装上了下次启动由 reconcileInstallRecord 清掉记录，没装上的累计到上限后不再静默重试。
     * 条件与 electron-updater 一致：退出码非 0 不安装；install() 走的 quitAndInstall 已自己记过
     */
    private onAppQuit(exitCode: number): void {
        if (exitCode !== 0 || this.installing || !this.downloadedVersion || !autoUpdater.autoInstallOnAppQuit) return;
        this.recordInstallAttempt(this.downloadedVersion);
    }

    // ==================== 窗口与兜底出口 ====================

    public closeWindow(): void {
        windowManager.getWindow(WindowKey.Update)?.close();
    }

    private handleWindowClosed(): void {
        if (this.installing) return;

        if (this.state?.mode === 'forced') {
            this.cancelDownload();
            // 强制更新下关掉更新窗口即放弃更新，此时应用已没有其他窗口，直接退出
            this.shutdown(() => app.quit());
            return;
        }
        // 可选更新：关窗即放弃本次下载，无感更新的后台下载除外（照常下完，等退出时安装）；
        // 已下载完的留给 autoInstallOnAppQuit 在下次退出时安装
        if (!this.silentDownloading) {
            this.cancelDownload();
        }
        this.state = null;
    }

    public openDownloadPage(): void {
        const url = config.downloadPageUrl;
        if (/^https?:\/\//i.test(url)) {
            void shell.openExternal(url);
        }
    }

    public showInstaller(): void {
        if (this.downloadedFile) {
            shell.showItemInFolder(this.downloadedFile);
        }
    }

    // ==================== 内部工具 ====================

    /** 开发环境没有打包产物（缺 app-update.yml），只能走官网下载 */
    private canAutoUpdate(): boolean {
        return app.isPackaged;
    }

    /** 取消进行中的下载。任务本身等结束后由 ensureDownload 里的收尾清掉 */
    private cancelDownload(): void {
        this.downloadToken?.cancel();
    }

    private rememberAvailable(info: UpdateInfo): UpdatePromptInfo {
        this.available = {
            version: info.version,
            currentVersion: getAppVersion(),
            releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        };
        return this.available;
    }

    private setState(partial: Pick<UpdateState, 'mode' | 'phase'> & Partial<UpdateState>): void {
        this.state = {
            currentVersion: getAppVersion(),
            hasDownloadPage: !!config.downloadPageUrl,
            hasInstaller: false,
            ...partial,
        };
        this.pushState();
    }

    private patch(partial: Partial<UpdateState>): void {
        if (!this.state) return;
        this.state = { ...this.state, ...partial };
        this.pushState();
    }

    /** 只推给更新窗口；窗口没加载完会收不到，由渲染层挂载时 UPDATE_GET_STATE 补拉 */
    private pushState(): void {
        windowManager.sendMessage(WindowKey.Update, IpcChannels.UPDATE_STATE, this.state);
    }

    /**
     * 更新装好后删掉下载的安装包（%LOCALAPPDATA%\<updaterCacheDirName>\pending，约 90 MB），装上了再留着只占空间。
     * 只删版本不高于当前的：已下载还没装的新版本（无感更新等着退出时装、点了「稍后安装」的）要留着。
     * 同目录下的 installer.exe、current.blockmap 是安装程序留下的当前版本安装包和 blockmap，
     * 下次增量更新要拿它们和新版本逐块比对，删了每次都只能完整下载，所以不动。
     * 在启动检查之前同步执行，免得和随后的下载同时操作 pending 目录
     */
    private cleanInstalledUpdate(): void {
        try {
            // 缓存目录的取法与 electron-updater 一致：LOCALAPPDATA 下、app-update.yml 里 updaterCacheDirName 指定的目录
            const updateConfig = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
            const dirName = updateConfig.match(/^updaterCacheDirName:\s*(\S+)/m)?.[1];
            if (!dirName) return;
            const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
            const pendingDir = path.join(localAppData, dirName, 'pending');
            const infoFile = path.join(pendingDir, 'update-info.json');
            if (!fs.existsSync(infoFile)) return;

            const { fileName } = JSON.parse(fs.readFileSync(infoFile, 'utf8')) as { fileName?: string };
            // 文件名按 electron-builder.json5 的 artifactName 带版本号；解析不出就不动，留给 electron-updater 下次下载时自己清
            const version = fileName?.match(/\d+\.\d+\.\d+/)?.[0];
            if (!version || compareVersions(version, getAppVersion()) > 0) return;

            fs.rmSync(pendingDir, { recursive: true, force: true });
            console.info(`[UpdateManager] 已删除装好的更新包 ${fileName}`);
        } catch (error) {
            // 安装程序刚把应用拉起来、自己还没退出时文件可能被占用，下次启动再删
            console.warn('[UpdateManager] 清理更新包失败:', briefError(error));
        }
    }

    /** 启动时核对上次的自动安装：已升到目标版本说明装成功了，清掉记录 */
    private reconcileInstallRecord(): void {
        const record = storage.get<InstallRecord>(StorageKeys.UPDATE_INSTALL_RECORD);
        if (record && compareVersions(getAppVersion(), record.version) >= 0) {
            storage.delete(StorageKeys.UPDATE_INSTALL_RECORD);
        }
    }

    private isAutoInstallBlocked(version?: string): boolean {
        const record = storage.get<InstallRecord>(StorageKeys.UPDATE_INSTALL_RECORD);
        return !!version && record?.version === version && record.attempts >= MAX_AUTO_INSTALL_ATTEMPTS;
    }

    private recordInstallAttempt(version: string): void {
        const record = storage.get<InstallRecord>(StorageKeys.UPDATE_INSTALL_RECORD);
        const attempts = record?.version === version ? record.attempts + 1 : 1;
        storage.set<InstallRecord>(StorageKeys.UPDATE_INSTALL_RECORD, { version, attempts });
    }
}

export const updateManager = new UpdateManager();
