<template>
  <CusModal :visible="visible" :title="`全部群成员(${props.members.length})`" width="460px" @close="handleClose">
    <div class="all-members-container">
      <!-- Search Box -->
      <div class="search-box">
        <CusInput v-model="searchQuery" placeholder="搜索群成员..." class="search-input" />
      </div>

      <!-- Member List -->
      <div class="member-list scroll-bar-normal">
        <div v-for="member in filteredMembers" :key="member.user_id" class="member-item">
          <Avatar :uid="member.user_id" width="36px" height="36px" class="member-avatar" />
          <div class="member-info">
            <span class="name">
              {{ member.nickname || userStore.getUser(member.user_id)?.user_name }}
            </span>
            <span class="user-id">ID: {{ member.user_id }}</span>
          </div>
          
          <!-- Role Badges -->
          <div class="role-badges">
            <span v-if="member.user_id === userStore.getUserID()" class="role-badge me">我</span>
            <span v-if="member.role === ImTypes.GroupRole.GROUP_ROLE_OWNER" class="role-badge owner">群主</span>
            <span v-else-if="member.role === ImTypes.GroupRole.GROUP_ROLE_ADMIN" class="role-badge admin">管理员</span>
          </div>
        </div>

        <div v-if="filteredMembers.length === 0" class="empty-search">
          没有找到匹配的群成员
        </div>
      </div>
    </div>
  </CusModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';

const userStore = useUserStore();

const props = defineProps<{
  visible: boolean;
  members: ImTypes.GroupMember[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const searchQuery = ref('');

// Sort members: Owner first, then Admin, then regular members
const sortedMembers = computed(() => {
  return [...props.members].sort((a, b) => {
    const getWeight = (role: ImTypes.GroupRole) => {
      if (role === ImTypes.GroupRole.GROUP_ROLE_OWNER) return 0;
      if (role === ImTypes.GroupRole.GROUP_ROLE_ADMIN) return 1;
      return 2;
    };
    return getWeight(a.role) - getWeight(b.role);
  });
});

const filteredMembers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return sortedMembers.value;
  return sortedMembers.value.filter(member => {
    const name = (member.nickname || userStore.getUser(member.user_id)?.user_name || '').toLowerCase();
    const id = member.user_id.toString();
    return name.includes(query) || id.includes(query);
  });
});

const handleClose = () => {
  emit('close');
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.all-members-container {
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
    transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--bg-hover, #f2f3f5);
    }

    .member-avatar {
      margin-right: 12px;
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
</style>
