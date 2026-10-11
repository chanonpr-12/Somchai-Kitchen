<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { loginWithEmail, authErrorMessage } from '../auth'

const router = useRouter()
const route = useRoute()

const username = ref('staff')
const password = ref('1234')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'
    return
  }

  loading.value = true
  error.value = ''
  try {
    const user = await loginWithEmail(username.value, password.value)
    const nextPath = route.query.next || (user.role === 'Kitchen' ? '/kitchen' : '/staff')
    router.replace(nextPath)
  } catch (e) {
    error.value = authErrorMessage(e)
  } finally {
    loading.value = false
  }
}

function quickSelect(u, p) {
  username.value = u
  password.value = p
}
</script>

<template>
  <v-container class="py-10" style="max-width: 480px">
    <v-card class="pa-6" border elevation="2" rounded="lg">
      <div class="text-center mb-6">
        <v-avatar color="primary" size="56" class="mb-3">
          <v-icon size="32" color="white">mdi-account-lock</v-icon>
        </v-avatar>
        <h2 class="text-h5 font-weight-bold">เข้าสู่ระบบพนักงาน</h2>
        <p class="text-caption text-medium-emphasis">ระบบจัดการร้าน Somchai Kitchen</p>
      </div>

      <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
        {{ error }}
      </v-alert>

      <v-form @submit.prevent="handleLogin">
        <v-text-field
          v-model="username"
          label="ชื่อผู้ใช้ (Username)"
          prepend-inner-icon="mdi-account"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          required
        />

        <v-text-field
          v-model="password"
          label="รหัสผ่าน (Password)"
          type="password"
          prepend-inner-icon="mdi-lock"
          variant="outlined"
          density="comfortable"
          class="mb-5"
          required
        />

        <v-btn
          type="submit"
          color="primary"
          block
          size="large"
          :loading="loading"
          class="mb-3"
        >
          เข้าสู่ระบบ
        </v-btn>

        <v-btn
          variant="tonal"
          color="secondary"
          block
          size="default"
          to="/register"
          prepend-icon="mdi-account-plus"
          class="mb-4"
        >
          สมัคร / ลงทะเบียนพนักงานใหม่
        </v-btn>
      </v-form>

      <v-divider class="my-4" />

      <div class="text-caption text-medium-emphasis mb-2 text-center">
        ทางลัดบัญชีสำหรับสาธิต (Demo Accounts):
      </div>
      <div class="d-flex ga-2 justify-center flex-wrap">
        <v-btn size="small" variant="tonal" color="info" @click="quickSelect('kitchen', '1234')">
          ครัว (Kitchen)
        </v-btn>
        <v-btn size="small" variant="tonal" color="success" @click="quickSelect('staff', '1234')">
          พนักงาน (Staff)
        </v-btn>
        <v-btn size="small" variant="tonal" color="warning" @click="quickSelect('admin', '1234')">
          ผู้จัดการ (Admin)
        </v-btn>
      </div>

      <div class="text-center mt-6">
        <v-btn variant="text" size="small" to="/" prepend-icon="mdi-arrow-left">
          กลับไปหน้าเลือกลูกค้าหน้าร้าน
        </v-btn>
      </div>
    </v-card>
  </v-container>
</template>
