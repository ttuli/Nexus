/**
 * 媒体工具
 * 负责视频帧提取等媒体处理操作
 */

import { APP_CONSTANTS } from '@shared/config/constants';
import { settingService } from '@/src/services/settingService';

/**
 * 计算图片/视频消息气泡容器的显示尺寸：优先缩略图尺寸，其次原图等比缩放，缺省用方形占位
 */
export function calcMediaWrapperStyle(
    size: { thumbnailWidth?: number; thumbnailHeight?: number; width?: number; height?: number },
    fallbackPx = 120
): { width: string; height: string } {
    if (size.thumbnailWidth && size.thumbnailHeight && size.thumbnailWidth > 0 && size.thumbnailHeight > 0) {
        return { width: `${size.thumbnailWidth}px`, height: `${size.thumbnailHeight}px` };
    }

    let width = size.width || 0;
    let height = size.height || 0;
    if (width > 0 && height > 0) {
        if (width > APP_CONSTANTS.maxImageWidth || height > APP_CONSTANTS.maxImageHeight) {
            const ratio = Math.min(APP_CONSTANTS.maxImageWidth / width, APP_CONSTANTS.maxImageHeight / height);
            width *= ratio;
            height *= ratio;
        }
        return { width: `${width}px`, height: `${height}px` };
    }

    return { width: `${fallbackPx}px`, height: `${fallbackPx}px` };
}

/**
 * 提取视频第一帧作为 JPEG 封面，并获取宽高和时长
 * @param file 视频文件对象
 * @returns 封面本地路径、视频宽高和时长
 */
export async function extractVideoFrame(
    file: File
): Promise<{ thumbnailUrl: string; width: number; height: number; duration: number }> {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    const url = URL.createObjectURL(file);

    try {
        await new Promise<void>((resolve, reject) => {
            video.addEventListener('loadeddata', () => {
                if (video.duration <= 0.1) {
                    resolve(); // 无需 seek，直接用当前帧
                } else {
                    video.currentTime = 0.1;
                }
            }, { once: true });

            video.addEventListener('seeked', () => resolve(), { once: true });
            video.addEventListener('error', () => reject(new Error('Video load error')), { once: true });

            video.src = url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

        const savedLocalPath = await new Promise<string>((resolve, reject) => {
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    return reject(new Error('Failed to create blob from canvas'));
                }
                try {
                    const arrayBuffer = await blob.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    const localPath = await settingService.saveImageBuffer(uint8Array);
                    resolve(localPath);
                } catch (e) {
                    reject(e);
                }
            }, 'image/jpeg', APP_CONSTANTS.imageCompressQuality / 100.0);
        });

        return {
            thumbnailUrl: savedLocalPath,
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration > 0 ? Math.floor(video.duration) : 0
        };
    } catch {
        return { thumbnailUrl: '', width: 0, height: 0, duration: 0 };
    } finally {
        // 必须在 revoke 之前切断底层 video 元素的引用，防止浏览器继续去下已被销毁的 blob 块报错
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
    }
}
