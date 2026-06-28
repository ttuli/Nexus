/**
 * chat.ts — Barrel re-export (向后兼容入口)
 *
 * 此文件已被拆分为以下专注模块，请在新代码中直接导入对应模块：
 *   - @/src/utils/resourceUrl      → toResourceUrl
 *   - @/src/utils/sessionUtils     → generateSessionId / generateGroupSessionId / extractTargetIdFromSessionId
 *   - @/src/utils/messageConverter → convertWSMessageToIChatMessage / convertNotificationToChatMessage /
 *                                    checkAndClearInvalidLocalPath / convertApplySrc2FriendSrc
 *   - @/src/utils/messageBuilder   → buildTextWsMessage / buildImage* / buildFile* / buildAudio* / buildVideo* /
 *                                    ImageContent / FileContent / AudioContent / VideoContent / WsMessageResult
 *   - @/src/utils/systemMessage    → formatSystemMessage / getLastContent
 *   - @/src/utils/mediaUtils       → extractVideoFrame
 *
 * 以下 re-export 保证所有已存在的 `import ... from '@/src/utils/chat'` 继续正常工作。
 */

export { toResourceUrl } from './resourceUrl';

export {
    generateSessionId,
    generateGroupSessionId,
    extractTargetIdFromSessionId,
} from './sessionUtils';

export {
    convertWSMessageToIChatMessage,
    convertNotificationToChatMessage,
    checkAndClearInvalidLocalPath,
    convertApplySrc2FriendSrc,
} from './messageConverter';

export type {
    ImageContent,
    FileContent,
    AudioContent,
    VideoContent,
    WsMessageResult,
} from './messageBuilder';

export {
    buildTextWsMessage,
    buildImageLocalMsg,
    buildImageWsPayload,
    buildFileLocalMsg,
    buildFileWsPayload,
    buildAudioWsMessage,
    buildVideoLocalMsg,
    buildVideoWsPayload,
} from './messageBuilder';

export { formatSystemMessage, getLastContent } from './systemMessage';

export { extractVideoFrame } from './mediaUtils';
