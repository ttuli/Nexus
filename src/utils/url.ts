export function normalizeLocalPath(localPath: string) {
  // 1. 将所有反斜杠 "\" 替换为正斜杠 "/"
  const normalizedPath = localPath.replace(/\\/g, '/');

  return 'imag:///' + normalizedPath;
} 