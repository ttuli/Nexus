import SparkMD5 from 'spark-md5';

/**
 * 计算 ArrayBuffer 的 MD5
 * @param buffer ArrayBuffer 数据
 * @returns MD5 hex 字符串
 */
export function md5ArrayBuffer(buffer: ArrayBuffer): string {
  return SparkMD5.ArrayBuffer.hash(buffer);
}

/**
 * 计算文件的 MD5
 * @param file File 对象
 * @returns MD5 hex 字符串
 */
export async function computeFileMd5(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return SparkMD5.ArrayBuffer.hash(buffer);
}
