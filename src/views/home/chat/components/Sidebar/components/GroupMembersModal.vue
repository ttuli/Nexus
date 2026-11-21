<template>
  <CusModal :visible="visible" :title="modalTitle" width="460px" @close="emit('close')">
    <div class="members-modal-container">
      <div class="search-box">
        <CusInput v-model="searchQuery" placeholder="搜索群成员..." class="search-input" />
      </div>

      <div class="member-list scroll-bar-normal">
        <div
          v-for="member in filteredMembers"
          :key="member.user_id"
          class="member-item"
          :class="{ selectable: isRemoveMode }"
          @click="isRemoveMode && toggleSelect(member.user_id)"
        >
          <CusCheckBox
            v-if="isRemoveMode"
            :model-value="selectedIds.has(member.user_id)"
            @click.stop
            @change="toggleSelect(member.user_id)"
          />

          <Avatar :uid="member.user_id" width="36px" height="36px" disable-click class="member-avatar" />

          <div class="member-info">
            <span class="name">
              {{ member.nickname || userStore.getUser(member.user_id)?.user_name }}
            </span>
            <span class="user-id">ID: {{ member.user_id }}</span>
          </div>

          <div class="role-badges">
            <span v-if="!isRemoveMode && member.user_id === userStore.getUserID()" class="role-badge me">我</span>
            <span v-if="!isRemoveMode && member.role === ImTypes.GroupRole.GROUP_ROLE_OWNER" class="role-badge owner">群主</span>
            <span v-else-if="member.role === ImTypes.GroupRole.GROUP_ROLE_ADMIN" class="role-badge admin">管理员</span>
          </div>
        </div>

        <div v-if="filteredMembers.length === 0" class="empty-search">
          {{ isRemoveMode ? '没有可移除的群成员' : '没有找到匹配的群成员' }}
        </div>
      </div>
    </div>

    <template v-if="isRemoveMode" #footer>
      <div class="dialog-footer">
        <CusButton class="dialog-btn" type="normal" :show-icon="false" @click="emit('close')">取消</CusButton>
        <CusButton
          class="dialog-btn"
          type="primary"
          :show-icon="false"
          :disabled="selectedIds.size === 0"
          :loading="submitLoading"
          @click="emit('submit', Array.from(selectedIds))"
        >
          确认{{ selectedIds.size > 0 ? ` (${selectedIds.size})` : '' }}
        </CusButton>
      </div>
    </template>
  </CusModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';
import { getGroupRoleWeight, sortGroupMembersByRole } from '@/src/utils/displayName';

const userStore = useUserStore();

const props = withDefaults(defineProps<{
  visible: boolean;
  members: ImTypes.GroupMember[];
  mode?: 'view' | 'remove';
  submitLoading?: boolean;
}>(), {
  mode: 'view',
  submitLoading: false,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', userIds: number[]): void;
}>();

const isRemoveMode = computed(() => props.mode === 'remove');
const modalTitle = computed(() =>
  isRemoveMode.value ? '移除群成员' : `全部群成员(${props.members.length})`
);

const searchQuery = ref('');
const selectedIds = ref<Set<number>>(new Set());

watch(() => props.visible, (newVal) => {
  if (newVal) {
    searchQuery.value = '';
    selectedIds.value.clear();
  }
});

const baseMembers = computed(() => {
  if (!isRemoveMode.value) {
    return sortGroupMembersByRole(props.members);
  }
  const myId = userStore.getUserID();
  const myRole = props.members.find(m => m.user_id === myId)?.role ?? ImTypes.GroupRole.GROUP_ROLE_MEMBER;
  const myWeight = getGroupRoleWeight(myRole);
  return sortGroupMembersByRole(
    props.members.filter(m => m.user_id !== myId && getGroupRoleWeight(m.role) > myWeight)
  );
});

const filteredMembers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return baseMembers.value;
  return baseMembers.value.filter(member => {
    const name = (member.nickname || userStore.getUser(member.user_id)?.user_name || '').toLowerCase();
    return name.includes(query) || member.user_id.toString().includes(query);
  });
});

const toggleSelect = (userId: number) => {
  if (selectedIds.value.has(userId)) {
    selectedIds.value.delete(userId);
  } else {
    selectedIds.value.add(userId);
  }
};
</script>

<style scoped lang="scss">
.members-modal-container {
  display: flex;
  flex-direction: column;
  height: 50vh;
  max-height: 500px;
  overflow: hidden;
}

.search-box {
  margin-bottom: 16px;

  .search-input {
    :deep(.chat-input-wrapper) {
      height: 38px;
      background-color: var(--bg-body, #f8fafc);

      &:focus-within {
        background-color: var(--surface-default, #ffffff);
      }

      .chat-input-field {
        font-size: 14px;
        padding: 8px 0;
      }
    }
  }
}

.member-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;

  .member-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 6px;
    transition: background-color 0.2s ease;

    &.selectable {
      cursor: pointer;
    }

    &:hover {
      background-color: var(--bg-hover, #f2f3f5);
    }

    .member-avatar {
      flex-shrink: 0;
    }

    .member-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .name {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-title, #1d2129);
        @include ellipsis;
      }

      .user-id {
        font-size: 11px;
        color: var(--text-secondary, #86909c);
      }
    }

    .role-badges {
      display: flex;
      gap: 4px;
      align-items: center;

      .role-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        color: #ffffff;
        font-weight: 500;

        &.me {
          background-color: #10b981;
        }

        &.owner {
          background-color: #f59e0b;
        }

        &.admin {
          background-color: #3b82f6;
        }
      }
    }
  }
}

.empty-search {
  text-align: center;
  color: var(--text-placeholder, #86909c);
  margin-top: 40px;
  font-size: 14px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;

  .dialog-btn {
    width: 80px;
    height: 32px;
    padding: 0;
  }
}
</style>
