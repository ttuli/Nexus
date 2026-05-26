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

describe('fileCacheManager', () => {
  let tmpDir: string
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileCacheManager-test'))
    fileCacheManager.setCacheDir(tmpDir) // 设置缓存目录为临时目录
  })
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('url有缓存时返回本地路径', async () => {
    const originalUrl = 'https://img.shetu66.com/2023/06/26/1687770031227597.png'
    const reqUrl = `imcache://${Buffer.from(originalUrl).toString('base64url')}`
    const result = await fileCacheManager.handleProtocolRequest(reqUrl,'sync')
    console.log('result:', result)
    expect(result).not.toBeNull()
  })
})