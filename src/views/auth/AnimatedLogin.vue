<template>
  <div class="login-wrapper">
    <!-- Left Pane -->
    <div class="left-pane">
      <div class="dot-bg"></div>
      <div class="left-content">
        <!-- Abstract Graph -->
        <div class="graph-container">
          <svg viewBox="0 0 200 120" fill="none" stroke="#424eeb" stroke-width="1.5" class="graph-svg">
            <polyline points="20,20 70,80 110,30 150,80" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>
            <polyline points="40,70 100,20 180,20" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>
            <circle cx="20" cy="20" r="3" fill="#424eeb" />
            <circle cx="70" cy="80" r="3" fill="#424eeb" />
            <circle cx="110" cy="30" r="3" fill="#424eeb" />
            <circle cx="150" cy="80" r="3" fill="#424eeb" />
            <circle cx="40" cy="70" r="3" fill="#424eeb" />
            <circle cx="100" cy="20" r="3" fill="#424eeb" />
            <circle cx="180" cy="20" r="3" fill="#424eeb" />
          </svg>
        </div>
        
        <!-- Blue Arrow Circle -->
        <div class="arrow-circle">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>

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
        <h2 class="title">欢迎回来</h2>
        <p class="subtitle">登录您的账号</p>



        <form class="login-form" @submit.prevent="handleSubmit">
          <div class="input-group">
            <label for="email">账号 <span class="required">*</span></label>
            <input id="email" type="text" placeholder="请输入账号" v-model="formData.email" required />
          </div>

          <div class="input-group">
            <label for="password">密码 <span class="required">*</span></label>
            <div class="password-wrapper">
              <input id="password" :type="showPassword ? 'text' : 'password'" placeholder="请输入密码" v-model="formData.password" required />
              <button type="button" class="eye-btn" @click="showPassword = !showPassword">
                <svg v-if="!showPassword" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
            </div>
          </div>

          <button class="submit-btn" type="submit">
            登 录 &nbsp; &rarr;
          </button>

          <div class="forgot-wrapper">
            <button class="forgot-btn" type="button">注册账号</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { signalWindowReady } from '@/src/utils/windowReady';
import { APP_CONSTANTS } from '@/src/config/constants';
import { ref, reactive, onMounted } from 'vue';

const showPassword = ref(false);
const formData = reactive({
  email: '',
  password: ''
});

onMounted(() => {
  setTimeout(() => {
    signalWindowReady();
  }, 100);
});

const handleSubmit = () => {
  console.log('Login attempt:', formData);
};
</script>

<style scoped lang="scss"> 
.login-wrapper {
  display: flex;
  width: 100%;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1e293b;
  box-sizing: border-box;

  * {
    box-sizing: border-box;
  }

  /* Left Pane */
  .left-pane {
    position: relative;
    width: 50%;
    background-color: #eaf0ff;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;

    .dot-bg {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(#b4c6ef 1.5px, transparent 1.5px);
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
      }

      .arrow-circle {
        width: 52px;
        height: 52px;
        background: linear-gradient(135deg, #5162ff, #424eeb);
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        color: #fff;
        margin-bottom: 1.5rem;
        box-shadow: 0 6px 16px rgba(66, 78, 235, 0.35);
      }

      .brand-title {
        font-size: 2.2rem;
        font-weight: 800;
        color: #424eeb;
        margin: 0 0 0.5rem 0;
      }

      .brand-subtitle {
        font-size: 0.95rem;
        color: #556075;
        line-height: 1.6;
        margin: 0;
      }
    }
  }

  /* Right Pane */
  .right-pane {
    width: 50%;
    background-color: #ffffff;
    display: flex;
    justify-content: center;
    align-items: center;

    .form-wrapper {
      width: 100%;
      max-width: 380px;
      padding: 2rem;

      .title {
        font-size: 2.2rem;
        font-weight: 800;
        color: #0f172a;
        margin: 0 0 0.5rem 0;
      }

      .subtitle {
        font-size: 0.95rem;
        color: #64748b;
        margin: 0 0 2.5rem 0;
      }



      .login-form {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;

          label {
            font-size: 0.9rem;
            font-weight: 600;
            color: #1e293b;

            .required {
              color: #60a5fa;
            }
          }

          input {
            width: 100%;
            height: 3rem;
            padding: 0 1rem;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            background-color: #fcfcfc;
            font-size: 0.95rem;
            color: #0f172a;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;

            &::placeholder {
              color: #94a3b8;
            }

            &:focus {
              border-color: #424eeb;
              box-shadow: 0 0 0 3px rgba(66, 78, 235, 0.1);
              background-color: #ffffff;
            }
          }

          .password-wrapper {
            position: relative;
            display: flex;
            align-items: center;

            .eye-btn {
              position: absolute;
              right: 1rem;
              background: none;
              border: none;
              color: #94a3b8;
              cursor: pointer;
              display: flex;
              align-items: center;
              padding: 0;

              &:hover {
                color: #64748b;
              }
            }
          }
        }

        .submit-btn {
          width: 100%;
          height: 3rem;
          background: linear-gradient(90deg, #5162ff, #424eeb);
          color: #fff;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          justify-content: center;
          align-items: center;
          transition: opacity 0.2s, box-shadow 0.2s;
          margin-top: 1rem;
          box-shadow: 0 4px 12px rgba(66, 78, 235, 0.2);

          &:hover {
            opacity: 0.9;
            box-shadow: 0 6px 16px rgba(66, 78, 235, 0.3);
          }
        }

        .forgot-wrapper {
          display: flex;
          justify-content: center;
          margin-top: 0.5rem;

          .forgot-btn {
            background: none;
            border: none;
            color: #424eeb;
            font-size: 0.95rem;
            font-weight: 500;
            cursor: pointer;

            &:hover {
              text-decoration: underline;
            }
          }
        }
      }
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
  }
}
</style>
