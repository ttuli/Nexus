import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { WindowState } from '@/electron/windows/windowAttribute';

/**
 * 窗口状态管理器
 * 负责保存和恢复窗口的位置、大小和状态
 */
class WindowStateManager {
  private stateFile: string;
  private states: Map<string, WindowState> = new Map();

  constructor() {
    const userDataPath = app.getPath('userData');
    this.stateFile = join(userDataPath, 'window-state.json');
    this.loadStates();
  }

  /**
   * 从文件加载窗口状态
   */
  private loadStates(): void {
    try {
      if (existsSync(this.stateFile)) {
        const data = readFileSync(this.stateFile, 'utf-8');
        const parsed = JSON.parse(data);
        this.states = new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.error('Failed to load window states:', error);
      this.states = new Map();
    }
  }

  /**
   * 保存窗口状态到文件
   */
  private saveStates(): void {
    try {
      const data = Object.fromEntries(this.states);
      writeFileSync(this.stateFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save window states:', error);
    }
  }

  /**
   * 获取窗口状态
   */
  public getState(key: string): WindowState | undefined {
    return this.states.get(key);
  }

  /**
   * 保存窗口状态
   */
  public saveState(key: string, state: WindowState): void {
    this.states.set(key, state);
    this.saveStates();
  }

  /**
   * 删除窗口状态
   */
  public deleteState(key: string): void {
    this.states.delete(key);
    this.saveStates();
  }

  /**
   * 清除所有状态
   */
  public clearStates(): void {
    this.states.clear();
    this.saveStates();
  }
}

export const windowStateManager = new WindowStateManager();
export default WindowStateManager;

