import { session } from 'electron'

/**
 * 显式放行麦克风 / 摄像头权限。
 *
 * 为什么必须显式设置：Electron 未注册 `setPermissionRequestHandler` 时，
 * `getUserMedia` 的授权行为随版本与打包形态漂移，被拒时渲染层只拿到一个
 * `NotAllowedError`，与「用户在系统隐私设置里关了摄像头」的报错完全一致 ——
 * 排查时极易误判成系统问题。显式声明后行为确定，也便于将来收紧。
 *
 * 只放行通话真正需要的 `media`（含 mic/camera）与 `audioCapture`/`videoCapture`，
 * 其余（通知、地理位置、剪贴板读取等）一律拒绝，不做无条件 `callback(true)`。
 */
const ALLOWED_PERMISSIONS = new Set(['media', 'audioCapture', 'videoCapture'])

/** 仅信任应用自身页面：dev 为 vite server，生产为 file:// 加载的本地页面 */
function isAppOrigin(url: string): boolean {
    if (!url) return false
    if (url.startsWith('file://')) return true
    const devServer = process.env['VITE_DEV_SERVER_URL']
    return !!devServer && url.startsWith(devServer)
}

export function setupMediaPermission(): void {
    const ses = session.defaultSession

    // 异步授权请求（getUserMedia 走这里）
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
        const url = webContents?.getURL() ?? ''
        callback(ALLOWED_PERMISSIONS.has(permission) && isAppOrigin(url))
    })

    // 同步权限查询（navigator.permissions.query / 部分设备枚举路径走这里）。
    // 只设 RequestHandler 的话，查询侧可能先返回 denied 导致上层直接不发起请求
    ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
        return ALLOWED_PERMISSIONS.has(permission) && isAppOrigin(requestingOrigin)
    })
}
