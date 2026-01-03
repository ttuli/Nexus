import { getUserInfo } from '@/apis/user';
import { useRelationStore } from '@/store/relationMap';
import { useUserStore } from '@/store/user';
import type { UserInfo } from '@/types/user';

/**
 * 资源管理器（渲染进程）
 * 负责与主进程通信，管理用户信息等资源
 */
class ResourceManager {
  private initialized = false;

  /**
   * 初始化资源管理器
   */
  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // 监听主进程的资源更新通知
    this.setupListeners();
  }

  /**
   * 设置监听器
   */
  private setupListeners(): void {
    window.ipcRenderer.on('update-refreshToken',(e,data:string) => {
      const userStore = useUserStore();
      userStore.setRefreshToken(data)
    })
    window.ipcRenderer.on('update-token', (e, data: string) => {
      const userStore = useUserStore();
      userStore.setToken(data)
    })
    // 监听主进程请求获取用户信息
    window.ipcRenderer.on('resource:fetch-users-request', async (_event, payload: {
      requestId: string;
      userIds: string[];
      responseChannel: string;
    }) => {
      try {
        const { userIds, responseChannel } = payload;

        // 调用 API 获取用户信息
        const response = await getUserInfo(userIds);

        // API 返回格式：{ data: { data: UserInfo[] } }
        const usersData = response?.data?.data || response?.data || [];

        if (Array.isArray(usersData) && usersData.length > 0) {
          // 转换用户信息格式（后端格式：支持大小写混合，转换为前端 UserInfo 格式）
          const users: UserInfo[] = usersData.map((user: any) => ({
            user_id: String(user.user_id || user.userID || user.UserID || ''),
            user_name: String(user.user_name || user.UserName || ''),
            avatar: user.avatar || user.Avatar,
            gender: Number(user.gender || user.Gender || 0),
            phone: String(user.phone || user.Phone || ''),
            join_type: Number(user.join_type || user.JoinType || 0),
            personal_signature: user.personal_signature || user.PersonalSignature,
            create_time: Number(user.create_time || user.CreateTime || 0),
            update_time: Number(user.update_time || user.UpdateTime || 0),
          }));

          // 发送响应到主进程
          window.ipcRenderer.send(responseChannel, {
            success: true,
            users,
          });
        } else {
          window.ipcRenderer.send(responseChannel, {
            success: false,
            error: 'Invalid response format',
          });
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
        window.ipcRenderer.send(payload.responseChannel, {
          success: false,
          error: (error as Error).message,
        });
      }
    });

    // 监听主进程的用户信息更新通知
    window.ipcRenderer.on('resource:user-updated', (_event, userData: UserInfo) => {
      try {
        // 更新 Pinia store（需要转换为 bigint 格式）
        const relationStore = useRelationStore();
        const user = {
          user_id: userData.user_id,
          user_name: userData.user_name,
          avatar: userData.avatar,
          gender: userData.gender,
          phone: userData.phone,
          join_type: userData.join_type,
          personal_signature: userData.personal_signature,
          create_time: userData.create_time,
          update_time: userData.update_time,
        };
        relationStore.setUser(user);
      } catch (error) {
        console.error('Failed to update user from main process:', error);
      }
    });
  }

  public async updateToken(token: string): Promise<boolean> {
    try {
      const result = await window.ipcRenderer.invoke('resource:update-token', token);
      return result.success;
    } catch (error) {
      console.error('Failed to update token in main process:', error);
      return false;
    }
  }
  public async updateRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const result = await window.ipcRenderer.invoke('resource:update-refreshToken', refreshToken);
      return result.success;
    } catch (error) {
      console.error('Failed to update refresh token in main process:', error);
      return false;
    }
  }

  /**
   * 从主进程批量获取用户信息（返回前端 UserInfo 格式）
   */
  public async getUsers(userIds: string[]): Promise<UserInfo[]> {
    try {
      const result = await window.ipcRenderer.invoke('resource:get-users', userIds);
      if (result.success && Array.isArray(result.users)) {
        const users: UserInfo[] = result.users;

        // 更新 Pinia store
        const relationStore = useRelationStore();
        users.forEach((user) => {
          relationStore.setUser(user);
        });

        return users;
      }
      return [];
    } catch (error) {
      console.error('Failed to get users from main process:', error);
      return [];
    }
  }

  /**
   * 批量更新主进程的用户信息缓存
   * @param users - 可以是 UserInfo[]（user_id: string）或 store 格式（user_id: bigint）
   */
  public async updateUsers(users: UserInfo[]): Promise<boolean> {
    try {
      // 转换为 UserInfo 格式
      const usersInfo: UserInfo[] = users.map((user) => ({
        user_id: user.user_id,
        user_name: user.user_name,
        avatar: user.avatar,
        gender: user.gender,
        phone: user.phone,
        join_type: user.join_type,
        personal_signature: user.personal_signature,
        create_time: (user as UserInfo).create_time || 0,
        update_time: (user as UserInfo).update_time || 0,
      }));

      // 然后通知主进程更新缓存
      const result = await window.ipcRenderer.invoke('resource:update-users', usersInfo);

      return result.success;
    } catch (error) {
      console.error('Failed to update users in main process:', error);
      return false;
    }
  }

  /**
   * 清除主进程的用户缓存
   */
  public async clearCache(): Promise<boolean> {
    try {
      const result = await window.ipcRenderer.invoke('resource:clear-user-cache');
      return result.success;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  }

  /**
   * 销毁资源管理器（清理监听器）
   */
  public destroy(): void {
    if (!this.initialized) return;

    window.ipcRenderer.removeAllListeners('resource:fetch-users-request');
    window.ipcRenderer.removeAllListeners('resource:user-updated');
    window.ipcRenderer.removeAllListeners('update-token');

    this.initialized = false;
  }
}

export const resourceManager = new ResourceManager();
export default ResourceManager;

