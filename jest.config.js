export default {

  // 使用 ts-jest 预设，让 Jest 能直接运行 TypeScript
  // ts-jest 会在运行前将 .ts 文件编译为 JS
  preset: 'ts-jest',

  // 测试运行环境
  // 'node'    → Node.js 环境（后端/Electron主进程用这个）
  // 'jsdom'   → 模拟浏览器环境（前端组件测试用这个）
  testEnvironment: 'node',

  // Jest 从哪些根目录开始查找测试文件
  // <rootDir> 是项目根目录的占位符
  roots: ['<rootDir>/__tests__', '<rootDir>/electron'],

  // 匹配哪些文件作为测试文件（满足任一即可）
  // **/__tests__/**/*.ts   → __tests__ 目录下所有 .ts 文件
  // **/*.unit.test.ts      → 任意位置的 .unit.test.ts 文件
  testMatch: ['**/__tests__/**/*.ts', '**/*.unit.test.ts'],

  // 模块文件后缀解析顺序
  // import './foo' 会依次尝试 foo.ts → foo.js → foo.json
  moduleFileExtensions: ['ts', 'js', 'json'],

  // 路径别名映射，对应 tsconfig 里的 paths 配置
  // import something from '@/utils' 会被解析为 src/utils
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // 收集覆盖率时包含哪些文件（运行 --coverage 时生效）
  collectCoverageFrom: [
    'electron/**/*.ts',   // 包含 electron 目录下所有 ts 文件
    '!electron/**/*.d.ts', // 排除类型声明文件（! 表示排除）
    '!dist-electron/**',   // 排除构建产物目录
  ],

  // 忽略这些路径下的测试文件，不会被执行
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
}