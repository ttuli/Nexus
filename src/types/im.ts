// TS Compatibility Bridge
// This file aggregates and explicitly re-exports all business types and enums
// from the split modular proto typescript files.
// Explicit exports avoid name collisions of ts-proto helper types like DeepPartial, Exact, etc.

// 1. Group Types (from proto/group/group)
export {
  GroupInfo,
  GroupMember,
  GroupRole,
  groupRoleFromJSON,
  groupRoleToJSON,
  JoinType,
  joinTypeFromJSON,
  joinTypeToJSON
} from './proto/group/group';

// 2. Message Types (from proto/message/message)
export {
  BaseMessage,
  MessageStatus,
  messageStatusFromJSON,
  messageStatusToJSON,
  TextMessage,
  AtInfo,
  ImageMessage,
  VideoMessage,
  AudioMessage,
  FileMessage,
  LocationMessage,
  CustomMessage,
  MessageAck,
  AckStatus,
  ackStatusFromJSON,
  ackStatusToJSON,
  MessageRead,
  MessageRecall,
  Conversation,
  ConversationType,
  conversationTypeFromJSON,
  conversationTypeToJSON,
  SystemNotification,
  NotificationType,
  notificationTypeFromJSON,
  notificationTypeToJSON
} from './proto/message/message';

// 3. Social Types (from proto/social/social)
export {
  GroupApply,
  GroupApplyStatus,
  groupApplyStatusFromJSON,
  groupApplyStatusToJSON,
  GroupNotification,
  GroupOperationType,
  groupOperationTypeFromJSON,
  groupOperationTypeToJSON,
  FriendSource,
  friendSourceFromJSON,
  friendSourceToJSON,
  Friend,
  FriendRequest,
  ApplyStatus,
  applyStatusFromJSON,
  applyStatusToJSON,
  ApplySource,
  applySourceFromJSON,
  applySourceToJSON
} from './proto/social/social';

// 4. Transport Types (from proto/transport/transport)
export {
  ApiResponse,
  WSMessage,
  TargetType,
  targetTypeFromJSON,
  targetTypeToJSON,
  ConnectionState,
  connectionStateFromJSON,
  connectionStateToJSON,
  MessageType,
  messageTypeFromJSON,
  messageTypeToJSON,
  ErrorMessage,
  ErrorCode,
  errorCodeFromJSON,
  errorCodeToJSON
} from './proto/transport/transport';

// 5. User Types (from proto/user/user)
export {
  UserInfo,
  Gender,
  genderFromJSON,
  genderToJSON,
  UserStatus,
  userStatusFromJSON,
  userStatusToJSON,
  UserOnlineStatus,
  OnlineStatus,
  onlineStatusFromJSON,
  onlineStatusToJSON,
  TypingStatus,
  UserKickoff
} from './proto/user/user';
