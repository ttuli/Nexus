import { authManager } from './authManager';
import { tokenManager } from './tokenManager';
import { cacheManager } from './cacheManager';
import { setupIpcHandlers } from './ipcHandlers';
import { wsManager, setupWsIpcHandlers, setupWsEventForwarding } from '@/electron/websocket';
import { closePrivateDB, closeAllDb } from '@/electron/db';
import settingManager from './settingManager';
import { fileCacheManager } from './fileCacheManager';
import { windowManager } from '@/electron/windows/windowManager'
import { WindowKey } from '@shared/config/windowKeys';
import { app } from 'electron';

/**
 * 资源管理器（主入口）
 * 统一初始化和导出各模块
 */
class ResourceManager {
    private initialized: boolean = false;

    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化各模块（cacheManager.init() 是 async，内部会启动 Worker 并打开 sharedDb）
        settingManager.init();
        authManager.init();
        cacheManager.init().catch(err => {
            console.error('[ResourceManager] cacheManager.init() failed:', err);
        });
        fileCacheManager.init();

        // 初始化 WebSocket 模块
        wsManager.init();
        setupWsIpcHandlers();
        setupWsEventForwarding();

        // 设置 IPC 处理器
        setupIpcHandlers();

        windowManager.CreateWindow({
            key: WindowKey.Login,
        });
    }

    public kickout(): void {
        tokenManager.cleanout();
        // 清理纯内存缓存，保留磁盘缓存供下次加速
        cacheManager.clearMemory();
        
        wsManager.closeWs();
        windowManager.closeAllWindows().finally(() => {
            // 先让所有窗口完成销毁和退出清理工作，最后再安全关闭私有数据库连接
            closePrivateDB()
                .catch(err => console.error('[ResourceManager] closePrivateDB error:', err))
                .finally(() => {
                    windowManager.CreateWindow({
                        key: WindowKey.Login,
                    });
                });
        });
    }

    // ==================== App Lifecycle ====================

    public destroy(): void {
        console.log('[ResourceManager] Destroying all resources...');
        // 先关闭所有窗口（等待退出清理及会话保存操作完成）
        windowManager.closeAllWindows().finally(() => {
            wsManager.closeWs();
            // 确保窗口全部销毁后，再安全关闭所有数据库连接
            closeAllDb().finally(() => {
                app.quit();
            });
        });
    }
}

export const resourceManager = new ResourceManager();

// 重新导出各模块
export { authManager } from './authManager';
export { tokenManager } from './tokenManager';
export { cacheManager } from './cacheManager';
export { userService } from './userManager';
export { friendService } from './friendManager';

