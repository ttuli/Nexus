<template>
  <CusModal 
    :visible="visible" 
    :title="searchType === 'user' ? '申请添加好友' : '申请加入群聊'" 
    width="360px" 
    @close="handleClose"
  >
    <div class="dialog-content" v-if="targetUser || targetGroup">
      <div class="user-preview">
        <Avatar 
          :uid="targetUser ? targetUser.user_id : (targetGroup?.id || 0)"
          :type="targetUser ? 'user' : 'group'" 
          class="avatar" 
        />
        <div class="info">
          <div class="name">{{ (targetUser ? targetUser.user_name : targetGroup?.name) || '未命名' }}</div>
          <div class="sub-info">
            <span>{{ targetUser ? '账号: ' + targetUser.user_id : '群号: ' + targetGroup?.id }}</span>
            <template v-if="targetUser">
              <img :src="maleIcon" class="gender-icon" v-if="targetUser.gender === ImTypes.Gender.GENDER_MALE" />
              <img :src="femaleIcon" class="gender-icon" v-else-if="targetUser.gender === ImTypes.Gender.GENDER_FEMALE" />
            </template>
          </div>
          <div class="sub-info" v-if="targetUser && targetUser.phone">手机: {{ targetUser.phone }}</div>
        </div>
      </div>

      <div class="input-form">
        <div class="label">验证信息</div>
        <textarea v-model="localApplyMessage" class="msg-input" placeholder="请输入验证信息，例如：我是..." rows="3"></textarea>
      </div>
    </div>
    
    <template #footer>
      <div class="dialog-footer">
        <CusButton class="dialog-btn" type="normal" :show-icon="false" @click="handleClose">取消</CusButton>
        <CusButton class="dialog-btn" type="primary" :show-icon="false" @click="handleSubmit">确认</CusButton>
      </div>
    </template>
  </CusModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ImTypes } from '@shared/types';
import maleIcon from '@/src/assets/gender/male.svg?url';
import femaleIcon from '@/src/assets/gender/female.svg?url';

defineOptions({ name: 'ApplyRelationModal' });

const props = defineProps<{
  visible: boolean;
  searchType: 'user' | 'group';
  targetUser: ImTypes.UserInfo | null;
  targetGroup: ImTypes.GroupInfo | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', message: string): void;
}>();

const localApplyMessage = ref('');

// Reset message on visible changes
watch(() => props.visible, (newVal) => {
  if (newVal) {
    localApplyMessage.value = '';
  }
});

const handleClose = () => {
  emit('close');
};

const handleSubmit = () => {
  emit('submit', localApplyMessage.value);
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;

  .user-preview {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    background-color: var(--bg-body, #f8fafc);
    padding: $spacing-md;
    border-radius: 8px;

    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid var(--border-color, #e2e8f0);
    }

    .info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;

      .name {
        font-size: $font-size-lg;
        font-weight: bold;
        color: var(--text-title, #1d2129);
        @include ellipsis;
      }

      .sub-info {
        font-size: $font-size-sm;
        color: var(--text-secondary, #86909c);
        display: flex;
        align-items: center;
        gap: 6px;

        .gender-icon {
          width: 14px;
          height: 14px;
          object-fit: contain;
        }
      }
    }
  }

  .input-form {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .label {
      font-size: $font-size-sm;
      color: var(--text-title, #1d2129);
      font-weight: $font-weight-medium;
    }

    .msg-input {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--border-divider, #e5e6eb);
      border-radius: 8px;
      font-size: $font-size-sm;
      color: var(--text-primary, #1d2129);
      background-color: var(--bg-body, #f8fafc);
      resize: none;
      outline: none;
      transition: all $transition-base;
      font-family: inherit;
      box-sizing: border-box;

      &:focus {
        border-color: $color-primary;
        background-color: var(--surface-default, #ffffff);
        box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.1);
      }

      &::placeholder {
        color: var(--text-placeholder, #86909c);
      }
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;

  .dialog-btn {
    width: 72px;
    height: 32px;
    padding: 0;
  }
}
</style>
