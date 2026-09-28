/**
 * 应用更新管理（主进程）
 *
 * 两条入口：
 * 1. 强制更新：请求层收到 Auth 服务的 426 → 断开 WS、等各窗口落盘后全部关闭 → 打开更新窗口
 *    → 自动检查、下载 → 退出并静默安装，装完自动重启。
 * 2. 可选更新：启动探测通过后在后台查询更新源，有新版本就推给登录窗 / 主窗口弹提示框，
 *    用户选「立即更新」才打开更新窗口下载，下载完由用户决定何时重启安装。
 *
 * 「要不要强制」由服务端判定（Auth 版本中间件），安装包走 electron-updater + 更新源（latest.yml）。
 * 两者分开：更新源不可达只会让下载失败（更新窗口给出重试 / 官网下载），不会让强制更新被绕过。
 */
import { app, shell } from 'electron';
import electronUpdater from 'electron-updater';
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater';
import { windowManager } from '@/electron/windows/windowManager';
import { wsManager } from '@/electron/websocket';
import { storage, StorageKeys } from '@/electron/utils/storage';
import { mainGet, MainRequestError } from '@/electron/resource/mainRequest';
import { WindowKey } from '@shared/config/windowKeys';
import { APP_CONSTANTS as config } from '@shared/config/constants';
import { IpcChannels, UpdatePromptAction, UpdatePromptInfo, UpdateState } from '@shared/types';
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
 * 同一版本自动安装的次数上限。
 * 装完重启仍是旧版本，说明安装被拦（安全软件、文件占用等）；不设上限会陷入
 * 「装失败 → 旧版启动 → 426 → 再装再失败」的死循环。
 */
const MAX_AUTO_INSTALL_ATTEMPTS = 2;

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

/** 更新说明规整为纯文本：部分来源给的是 HTML，渲染层一律按文本展示，不走 v-html */
function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string | undefined {
    if (!notes) return undefined;
    const text = typeof notes === 'string'
        ? notes
        : notes.map((n) => n.note ?? '').filter(Boolean).join('\n\n');
    const plain = text
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
    /** 426 响应给出的最低版本 */
    private minVersion = '';
    private downloadToken: CancellationTokenInstance | null = null;
    private downloadedFile = '';
    /** 检查进行中，挡住重复的「重试」 */
    private checking = false;
    private installing = false;
    private initialized = false;

    public init(shutdown: Shutdown): void {
        if (this.initialized) return;
        this.initialized = true;
        this.shutdown = shutdown;

        // 下载只由强制流程或用户显式触发：更新包走 OSS 按流量计费，也不是每个人都想马上更新
        autoUpdater.autoDownload = false;
        // 下载完点了「稍后」的，下次正常退出时静默装上
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.on('download-progress', (p: ProgressInfo) => this.onProgress(p));
        autoUpdater.on('update-downloaded', (e: UpdateDownloadedEvent) => {
            this.downloadedFile = e.downloadedFile;
        });

        this.reconcileInstallRecord();
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

    /** 查询可选更新，查不到不影响使用，下次启动再查 */
    private async checkOptionalUpdate(): Promise<void> {
        if (!this.canAutoUpdate()) return;
        try {
            const result = await autoUpdater.checkForUpdates();
            if (!result?.isUpdateAvailable || isUpgradeRequired()) return;

            const { version, releaseNotes } = result.updateInfo;
            if (storage.get<string>(StorageKeys.UPDATE_SKIPPED_VERSION) === version) return;

            this.prompt = {
                version,
                currentVersion: getAppVersion(),
                releaseNotes: normalizeReleaseNotes(releaseNotes),
            };
            this.pushPrompt();
        } catch (error) {
            console.warn('[UpdateManager] 检查更新失败:', briefError(error));
        }
    }

    // ==================== 可选更新提示 ====================

    public getPrompt(): UpdatePromptInfo | null {
        return this.prompt;
    }

    /**
     * 推给当前的主界面。窗口还没加载完会收不到，由渲染层挂载时 UPDATE_GET_PROMPT 补拉。
     * 登录 → 主窗口过渡期两个窗口都在，只发给主窗口，避免弹两次。
     */
    private pushPrompt(): void {
        if (!this.prompt) return;
        if (!windowManager.sendMessage(WindowKey.Home, IpcChannels.UPDATE_PROMPT, this.prompt)) {
            windowManager.sendMessage(WindowKey.Login, IpcChannels.UPDATE_PROMPT, this.prompt);
        }
    }

    public respondPrompt(action: UpdatePromptAction): void {
        const prompt = this.prompt;
        this.prompt = null;
        if (!prompt) return;

        if (action === 'skip') {
            storage.set(StorageKeys.UPDATE_SKIPPED_VERSION, prompt.version);
        } else if (action === 'update') {
            this.setState({
                mode: 'optional',
                phase: 'downloading',
                targetVersion: prompt.version,
                releaseNotes: prompt.releaseNotes,
            });
            windowManager.CreateWindow({ key: WindowKey.Update });
            void this.download();
        }
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
        if (!this.state || this.checking || this.downloadToken || this.installing) return;
        if (!this.canAutoUpdate()) {
            this.patch({ phase: 'error', error: this.unsupportedReason() });
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

    private async download(): Promise<void> {
        if (!this.state) return;
        this.cancelDownload();
        const token = new CancellationToken();
        this.downloadToken = token;
        this.downloadedFile = '';
        this.patch({
            phase: 'downloading',
            error: undefined,
            progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
        });

        try {
            const files = await autoUpdater.downloadUpdate(token);
            if (token !== this.downloadToken) return; // 已取消，或被新的下载取代
            this.downloadToken = null;
            this.downloadedFile ||= files[0] ?? '';
            this.onDownloaded();
        } catch (error) {
            if (token !== this.downloadToken) return;
            this.downloadToken = null;
            this.patch({ phase: 'error', error: `下载失败：${briefError(error)}` });
        }
    }

    private onProgress(p: ProgressInfo): void {
        if (this.state?.phase !== 'downloading') return;
        this.patch({
            progress: {
                percent: p.percent,
                transferred: p.transferred,
                total: p.total,
                bytesPerSecond: p.bytesPerSecond,
            },
        });
    }

    private onDownloaded(): void {
        const state = this.state;
        if (!state) return;
        const hasInstaller = !!this.downloadedFile;

        if (state.mode === 'optional') {
            this.patch({ phase: 'downloaded', hasInstaller });
            return;
        }

        if (this.isAutoInstallBlocked(state.targetVersion)) {
            // 不再自动装，退出时也别再偷偷装一次（那次尝试不会被计数）
            autoUpdater.autoInstallOnAppQuit = false;
            this.patch({
                phase: 'install-failed',
                hasInstaller,
                error: '新版本已下载，但自动安装多次未能完成（可能被安全软件拦截），请手动运行安装包',
            });
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

    // ==================== 窗口与兜底出口 ====================

    public closeWindow(): void {
        windowManager.getWindow(WindowKey.Update)?.close();
    }

    private handleWindowClosed(): void {
        if (this.installing) return;
        this.cancelDownload();

        if (this.state?.mode === 'forced') {
            // 强制更新下关掉更新窗口即放弃更新，此时应用已没有其他窗口，直接退出
            this.shutdown(() => app.quit());
            return;
        }
        // 可选更新：关窗即放弃本次下载；已下载完的留给 autoInstallOnAppQuit 在下次退出时安装
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

    /**
     * macOS 的自动更新要求应用已签名并公证，未签名的包在安装校验阶段必然失败；
     * 开发环境没有打包产物（缺 app-update.yml）。这两种情况只能走官网下载。
     */
    private canAutoUpdate(): boolean {
        return app.isPackaged && process.platform !== 'darwin';
    }

    private unsupportedReason(): string {
        return app.isPackaged
            ? '当前平台暂不支持自动更新，请前往官网下载新版本'
            : '开发环境不支持自动更新';
    }

    private cancelDownload(): void {
        this.downloadToken?.cancel();
        this.downloadToken = null;
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
