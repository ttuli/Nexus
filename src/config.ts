/**
 * 渲染进程统一配置
 * 集中管理所有 server URL，避免各 api 文件分散定义
 */

export const config = {
    /** Auth 服务器地址 */
    authServer: import.meta.env.VITE_AUTH_SERVER || 'http://localhost:8022',

    /** User 服务器地址 */
    userServer: import.meta.env.VITE_USER_SERVER || 'http://localhost:8021',

    /** ImTypes.GroupInfo 服务器地址 */
    groupServer: import.meta.env.VITE_GROUP_SERVER || 'http://localhost:8022',

    /** Message 服务器地址 */
    messageServer: import.meta.env.VITE_MESSAGE_SERVER || 'http://localhost:8024',

    /** File 服务器地址 */
    fileServer: import.meta.env.VITE_FILE_SERVER || 'http://localhost:8023',

    /** WS消息版本 */
    wsMessageVersion: 1,

    maxChatListCount: 40
};
