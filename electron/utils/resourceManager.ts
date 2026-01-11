import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import { windowManager } from '../windows/windowManager';
import { UserInfo } from '@/types/user';

/**
 * 资源管理器
 * 在主进程管理用户信息等资源
 */
class ResourceManager {
  // 用户信息缓存 Map<userId, userInfo>
  private userCache: Map<string, UserInfo> = new Map();
  // 正在获取的用户ID集合（防止重复请求）
  private fetchingUsers: Set<string> = new Set();
  private token: string = '';
  private refreshToken: string = '';

  constructor() {
    this.setupIpcHandlers();
  }

  /**
   * 获取用户信息（从缓存）
   */
  public getUserInfo(userId: string): UserInfo | null {
    return this.userCache.get(userId) || null;
  }

  /**
   * 批量获取用户信息（从缓存）
   */
  public getUsersInfo(userIds: string[]): UserInfo[] {
    return userIds
      .map((id) => this.userCache.get(id))
      .filter((user): user is UserInfo => user !== undefined);
  }

  /**
   * 设置用户信息（更新缓存）
   */
  public setUserInfo(user: UserInfo): void {
    const userId = user.user_id;
    this.userCache.set(userId, user);

    // 通知所有渲染进程用户信息已更新
    this.broadcastUserUpdate(user);
  }

  /**
   * 批量设置用户信息
   */
  public setUsersInfo(users: UserInfo[]): void {
    users.forEach((user) => this.setUserInfo(user));
  }

  /**
   * 删除用户信息
   */
  public deleteUserInfo(userId: string): void {
    this.userCache.delete(userId);
  }

  /**
   * 清除所有用户信息
   */
  public clearUserCache(): void {
    this.userCache.clear();
  }

  /**
   * 广播用户信息更新到所有渲染进程
   */
  private broadcastUserUpdate(user: UserInfo): void {
    windowManager.broadcastMessage('resource:user-updated', user);
  }

  /**
   * 通过渲染进程获取用户信息（当主进程缓存中没有时）
   */
  private async fetchUserFromRenderer(
    event: IpcMainInvokeEvent,
    userIds: string[]
  ): Promise<UserInfo[]> {
    return new Promise((resolve, reject) => {
      const sender = BrowserWindow.fromWebContents(event.sender);
      if (!sender || sender.isDestroyed()) {
        reject(new Error('Window is destroyed'));
        return;
      }

      if (userIds.length === 0) {
        return;
      }

      // 标记为正在获取
      userIds.forEach((id) => this.fetchingUsers.add(id));

      // 通过 IPC 请求渲染进程获取用户信息
      const requestId = `fetch-users-${Date.now()}`;
      const responseChannel = `resource:fetch-users-response-${requestId}`;

      let timeoutId: NodeJS.Timeout | null = null;
      console.log(responseChannel)

      // 监听响应
      const responseHandler = (_e: any, response: {
        success: boolean;
        users?: UserInfo[];
        error?: string;
      }) => {
        // 清理超时
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // 清理监听器
        try {
          ipcMain.removeListener(responseChannel, responseHandler);
        } catch (err) {
          // 忽略清理错误
        }
        
        // 移除获取标记
        userIds.forEach((id) => this.fetchingUsers.delete(id));

        if (response.success && response.users) {
          // 更新缓存
          this.setUsersInfo(response.users);
          // 返回所有请求的用户（包括之前缓存的）
          resolve(this.getUsersInfo(userIds));
        } else {
          reject(new Error(response.error || 'Failed to fetch users'));
        }
      };

      ipcMain.once(responseChannel, responseHandler);

      // 发送请求到渲染进程
      try {
        event.sender.send('resource:fetch-users-request', {
          requestId,
          userIds: userIds,
          responseChannel,
        });
      } catch (error) {
        userIds.forEach((id) => this.fetchingUsers.delete(id));
        reject(new Error('Failed to send fetch request'));
        return;
      }

      // 设置超时（10秒）
      timeoutId = setTimeout(() => {
        try {
          ipcMain.removeListener(responseChannel, responseHandler);
        } catch (err) {
          // 忽略清理错误
        }
        userIds.forEach((id) => this.fetchingUsers.delete(id));
        reject(new Error('Fetch users timeout'));
      }, 10000);
    });
  }

  /**
   * 设置 IPC 处理器
   */
  private setupIpcHandlers(): void {
    ipcMain.handle('resource:get-all-info', async () => {
      return {
        success: true,
        token: this.token,
        refreshToken: this.refreshToken,
      };
    });
    // 更新 token
    ipcMain.handle('resource:update-token', async (_event, token: string) => {
      this.token = token;
      windowManager.broadcastMessage('resource:update-token', token);
      return { success: true };
    });
    // 更新 refresh token
    ipcMain.handle('resource:update-refreshToken', async (_event, refreshToken: string) => {
      this.refreshToken = refreshToken;
      windowManager.broadcastMessage('resource:update-refreshToken', refreshToken);
      return { success: true };
    });
    // 批量获取用户信息
    ipcMain.handle('resource:get-users', async (event, userIds: string[]) => {
      try {
        let requireIds : string[] = [];
        let resultUsers : UserInfo[] = [];
        userIds.forEach((id) => {
          if (!this.userCache.has(id)) {
            requireIds.push(id);
          } else {
            resultUsers.push(this.getUserInfo(id) as UserInfo);
          }
        });
        if (requireIds.length > 0) {
          const users = await this.fetchUserFromRenderer(event, requireIds);
          resultUsers.push(...users);
        }
        return {
          success: true,
          users: resultUsers,
        };
      } catch (error) {
        console.error('Failed to get users:', error);
        return {
          success: false,
          error: (error as Error).message,
          users: [],
        };
      }
    });

    // 批量更新用户信息
    ipcMain.handle('resource:update-users', async (_event, usersData: UserInfo[]) => {
      try {
        this.setUsersInfo(usersData);
        windowManager.broadcastMessage('resource:update-users', usersData);
        return { success: true };
      } catch (error) {
        console.error('Failed to update users:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    });

    // 清除用户缓存
    ipcMain.handle('resource:clear-user-cache', async () => {
      this.clearUserCache();
      return { success: true };
    });
  }
}

export const resourceManager = new ResourceManager();
export default ResourceManager;

