import { cacheManager } from '../electron/resource/cacheManager';
import { ResourceType, IpcChannels } from '@shared/types';
import { windowManager } from '../electron/windows/windowManager';

// 1. Mock electron-store (避免真实的磁盘读写)
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => {
    return {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      store: {}, // 模拟内部存储对象
    };
  });
});

// 2. Mock windowManager (避免触发真实的 Electron IPC 广播)
jest.mock('../electron/windows/windowManager', () => ({
  windowManager: {
    broadcastMessage: jest.fn(),
  },
}));

// 3. Mock config (固定超时时间等配置，保证测试结果稳定且可预期)
jest.mock('@shared/config/constants', () => ({
  LOCAL_CACHE_SCHEME: 'localcache',
  Main_Config: {
    maxCacheItems: 100,
    cacheExpirationMs: 1000 * 60, // 固定 1 分钟
  },
  APP_CONSTANTS: {
    ApplicationName: 'Nexus',
    maxImageWidth: 280,
    maxImageHeight: 380,
    imageCompressQuality: 85,
  },
}));

describe('CacheManager', () => {
  beforeEach(() => {
    // 每次测试前清理所有 mock 函数的调用记录
    jest.clearAllMocks();
    
    // 每次测试前清空一下缓存管理器里的内容，保证每个测试用例独立
    cacheManager.clearMemory();
    
    // 这里因为 CacheManager 是个单例，如果有私有变量需要重置，
    // 可以通过强制设值或者通过重新 init()
    cacheManager.init();
  });

  it('应该能够成功设置和获取内存缓存', () => {
    const mockUser = { id: 1, name: 'Test User' };
    
    // 设置缓存
    cacheManager.setItem(ResourceType.USER, mockUser);
    
    // 获取缓存
    const user = cacheManager.getItem(ResourceType.USER, 1);
    
    // 断言结果
    expect(user).toEqual(mockUser);
  });

  it('调用 setItemsAndBroadcast 时应该触发窗口的 IPC 广播', () => {
    const mockUsers = [{ id: 2, name: 'Bob' }];
    
    cacheManager.setItemsAndBroadcast(ResourceType.USER, mockUsers);
    
    // 断言 windowManager.broadcastMessage 被正确调用
    expect(windowManager.broadcastMessage).toHaveBeenCalledWith(
        IpcChannels.RESOURCE_UPDATE, 
        { type: ResourceType.USER, items: mockUsers }
    );
  });
});
