<template>
  <CusModal :visible="visible" title="移除群成员" width="460px" @close="handleClose">
    <div class="remove-members-container">
      <!-- Search Box -->
      <div class="search-box">
        <CusInput v-model="searchQuery" placeholder="搜索群成员..." class="search-input" />
      </div>

      <!-- Member List -->
      <div class="member-list scroll-bar-normal">
        <div 
          v-for="member in filteredMembers" 
          :key="member.user_id" 
          class="member-item"
          @click="toggleSelect(member.user_id)"
        >
          <!-- Checkbox -->
          <CusCheckBox 
            :model-value="selectedIds.has(member.user_id)" 
            @click.stop
            @change="toggleSelect(member.user_id)"
          />

          <!-- Avatar -->
          <Avatar :uid="member.user_id" width="36px" height="36px" class="member-avatar" />

          <!-- Info -->
          <div class="member-info">
            <span class="name">
              {{ member.nickname || userStore.getUser(member.user_id)?.user_name }}
            </span>
            <span class="user-id">ID: {{ member.user_id }}</span>
          </div>
          
          <!-- Role Badges -->
          <div class="role-badges" v-if="member.role === ImTypes.GroupRole.GROUP_ROLE_ADMIN">
            <span class="role-badge admin">管理员</span>
          </div>
        </div>

        <div v-if="filteredMembers.length === 0" class="empty-search">
          没有可移除的群成员
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <CusButton class="dialog-btn" type="normal" :show-icon="false" @click="handleClose">取消</CusButton>
        <CusButton 
          class="dialog-btn" 
          type="primary" 
          :show-icon="false" 
          :disabled="selectedIds.size === 0"
          :loading="submitLoading" 
          @click="handleSubmit"
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

defineOptions({ name: 'RemoveGroupMembersModal' });

const userStore = useUserStore();

const props = withDefaults(
  defineProps<{
    visible: boolean;
    members: ImTypes.GroupMember[];
    submitLoading?: boolean;
  }>(),
  {
    submitLoading: false,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', userIds: number[]): void;
}>();

const searchQuery = ref('');
const selectedIds = ref<Set<number>>(new Set());

// Reset state when modal is opened/closed
watch(() => props.visible, (newVal) => {
  if (newVal) {
    searchQuery.value = '';
    selectedIds.value.clear();
  }
});

const myMemberObj = computed(() => {
  return props.members.find(m => m.user_id === userStore.getUserID());
});

const myRole = computed(() => myMemberObj.value?.role ?? ImTypes.GroupRole.GROUP_ROLE_MEMBER);

const getWeight = (role: ImTypes.GroupRole) => {
  if (role === ImTypes.GroupRole.GROUP_ROLE_OWNER) return 0;
  if (role === ImTypes.GroupRole.GROUP_ROLE_ADMIN) return 1;
  return 2;
};

// Filter out: self and anyone with role weight <= myWeight
const displayMembers = computed(() => {
  const myWeight = getWeight(myRole.value);
  return props.members.filter(m => {
    if (m.user_id === userStore.getUserID()) return false;
    return getWeight(m.role) > myWeight;
  });
});

const filteredMembers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return displayMembers.value;
  return displayMembers.value.filter(member => {
    const name = (member.nickname || userStore.getUser(member.user_id)?.user_name || '').toLowerCase();
    const id = member.user_id.toString();
    return name.includes(query) || id.includes(query);
  });
});

const toggleSelect = (userId: number) => {
  if (selectedIds.value.has(userId)) {
    selectedIds.value.delete(userId);
  } else {
    selectedIds.value.add(userId);
  }
};

const handleClose = () => {
  emit('close');
};

const handleSubmit = () => {
  emit('submit', Array.from(selectedIds.value));
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.remove-members-container {
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
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 6px;
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--bg-hover, #f2f3f5);
    }

    .member-avatar {
      margin: 0 12px;
    }

    .member-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .name {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-title, #1d2129);
      }

      .user-id {
        font-size: 11px;
        color: var(--text-secondary, #86909c);
      }
    }

    .role-badges {
      .role-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        color: #ffffff;
        font-weight: 500;

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
