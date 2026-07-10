// test/fileCacheManager.unit.test.ts
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

jest.mock('../electron/utils/storage', () => ({
  storage: {
    getResourcePath: jest.fn(() => ''),
    get: jest.fn(),
    set: jest.fn(),
    init: jest.fn(),
  },
}));
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { fileCacheManager } from '../electron/resource/fileCacheManager'
import { CacheOptionType } from '@shared/types/resourceCache'

describe('fileCacheManager', () => {
  let tmpDir: string
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileCacheManager-test'));
    // Set the private cacheDir property for testing
    (fileCacheManager as any).cacheDir = tmpDir;
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should generate local cache path correctly', () => {
    const originalUrl = 'https://img.shetu66.com/2023/06/26/1687770031227597.png'
    const localPath = fileCacheManager.getLocalPath(originalUrl, true)
    expect(localPath).toContain('shared')
    expect(localPath).toContain('cache')
  })

  it('should return cached response when file exists', async () => {
    const originalUrl = 'https://img.shetu66.com/2023/06/26/1687770031227597.png'
    const localPath = fileCacheManager.getLocalPath(originalUrl, true)
    
    // Write mock data to cache
    const mockContent = 'hello world'
    await fs.writeFile(localPath, mockContent)
    
    const result = await fileCacheManager.handleLocalCacheRequest(originalUrl, {
      cacheType: CacheOptionType.AVATAR,
    })
    
    expect(result).not.toBeNull()
    expect(result!.status).toBe(200)
    
    const text = await result!.text()
    expect(text).toBe(mockContent)
  })
})