<template>
  <TitleBar class="titlebar"></TitleBar>
  <div class="login-wrapper">
    <!-- Back Button -->
    <transition name="scale">
      <button 
        v-if="currentView === 'register'" 
        class="back-btn" 
        @click="currentView = 'login'"
        :disabled="isProcessing"
        aria-label="返回登录"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="back-icon">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
      </button>
    </transition>

    <!-- Left Pane -->
    <div class="left-pane">
      <div class="dot-bg"></div>
      <div class="left-content">
        <!-- Abstract Graph -->
        <div class="graph-container">
          <svg viewBox="0 0 200 120" fill="none" stroke="#1890ff" stroke-width="1.5" class="graph-svg">
            <polyline points="20,20 70,80 110,30 150,80" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>
            <polyline points="40,70 100,20 180,20" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>
            <circle cx="20" cy="20" r="3" fill="#1890ff" />
            <circle cx="70" cy="80" r="3" fill="#1890ff" />
            <circle cx="110" cy="30" r="3" fill="#1890ff" />
            <circle cx="150" cy="80" r="3" fill="#1890ff" />
            <circle cx="40" cy="70" r="3" fill="#1890ff" />
            <circle cx="100" cy="20" r="3" fill="#1890ff" />
            <circle cx="180" cy="20" r="3" fill="#1890ff" />
          </svg>
        </div>
        
        <!-- Blue Arrow Circle -->
         <img :src="icon" class="left-icon" />

        <h1 class="brand-title">{{ APP_CONSTANTS.ApplicationName }} 悦联</h1>
        <p class="brand-subtitle">
          随时随地，即刻触达。<br />
          打破距离界限，让沟通更加纯粹。
        </p>
      </div>
    </div>

    <!-- Right Pane -->
    <div class="right-pane">
      <div class="form-wrapper">
        <AnimatedLoginForm v-if="currentView === 'login'" @switchView="currentView = $event" @update:loading="isProcessing = $event" />
        <AnimatedRegisterForm v-else-if="currentView === 'register'" @switchView="currentView = $event" @update:loading="isProcessing = $event" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AnimatedLoginForm from './components/AnimatedLoginForm.vue';
import AnimatedRegisterForm from './components/AnimatedRegisterForm.vue';
import { APP_CONSTANTS, APP_ICON } from '@shared/config/constants';
import { publicUrl } from '@/src/utils/resourceUrl';

const icon = publicUrl(APP_ICON.normal)
const currentView = ref<'login' | 'register'>('login')
const isProcessing = ref(false)
</script>

<style scoped lang="scss">
.titlebar {
  position: fixed;
  z-index: 100;
}

.login-wrapper {
  position: relative;
  display: flex;
  width: 100%;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: $color-text-primary;
  box-sizing: border-box;

  * {
    box-sizing: border-box;
  }

  /* Back Button */
  .back-btn {
    position: absolute;
    top: 35px;
    left: 30px;
    z-index: 90;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background-color: var(--surface-default, #ffffff);
    border: 1px solid $color-border-divider;
    box-shadow: var(--shadow-sm);
    display: flex;
    justify-content: center;
    align-items: center;
    color: $color-text-secondary;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-app-region: no-drag;

    &:not(:disabled):hover {
      color: $color-primary;
      border-color: var(--color-primary-light);
      background-color: $color-primary-bg;
      transform: scale(1.1);
      box-shadow: var(--shadow-md);
    }

    &:not(:disabled):active {
      transform: scale(0.95);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .back-icon {
      width: 20px;
      height: 20px;
    }
  }

  /* Left Pane */
  .left-pane {
    position: relative;
    width: 50%;
    background-color: $color-primary-bg;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;

    .dot-bg {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(var(--color-primary-light) 1.5px, transparent 1.5px);
      background-size: 24px 24px;
      background-position: center;
      opacity: 0.8;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 90%);
      -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 90%);
    }

    .left-content {
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 0 2rem;

      .graph-container {
        width: 200px;
        height: 120px;
        margin-bottom: 2rem;
        color: $color-primary;

        svg {
          stroke: currentColor;
          circle {
            fill: currentColor;
          }
        }
      }

      .left-icon {
          width: 52px;
          height: 52px;
          border: none;
          margin-bottom: 20px;
          margin-top: 30px;
        }

      .brand-title {
        font-size: 2.2rem;
        font-weight: 800;
        color: $color-primary;
        margin: 0 0 0.5rem 0;
      }

      .brand-subtitle {
        font-size: 0.95rem;
        color: $color-text-secondary;
        line-height: 1.6;
        margin: 0;
      }
    }
  }

  /* Right Pane */
  .right-pane {
    width: 50%;
    background-color: var(--surface-default, #ffffff);
    display: flex;
    justify-content: center;
    align-items: center;

    .form-wrapper {
      width: 100%;
      max-width: 380px;
      padding: 2rem;
    }
  }
}

@media (max-width: 768px) {
  .login-wrapper {
    .left-pane {
      display: none;
    }
    .right-pane {
      width: 100%;
    }
    .back-btn {
      top: 45px;
      left: 20px;
      width: 36px;
      height: 36px;
      
      .back-icon {
        width: 18px;
        height: 18px;
      }
    }
  }
}

/* Scale transition */
.scale-enter-from {
  transform: scale(0);
  opacity: 0;
}
.scale-enter-to {
  transform: scale(1);
  opacity: 1;
}
.scale-leave-from {
  transform: scale(1);
  opacity: 1;
}
.scale-leave-to {
  transform: scale(0);
  opacity: 0;
}
.scale-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.scale-leave-active {
  transition: all 0.3s cubic-bezier(0.36, 0, 0.66, -0.56);
}
</style>
