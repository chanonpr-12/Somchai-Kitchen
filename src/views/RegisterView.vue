<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { registerEmployee, loginWithEmail, authErrorMessage } from '../auth'

const router = useRouter()

const firstName = ref('')
const lastName = ref('')
const phone = ref('')
const role = ref('Staff') // 'Staff' | 'Kitchen' | 'Admin'
const username = ref('')
const password = ref('')
const confirmPassword = ref('')

const loading = ref(false)
const error = ref('')
const registeredUser = ref(null)

const roleOptions = [
  {
    title: 'พนักงานบริการ (Staff)',
    subtitle: 'รับบริการหน้าร้าน เสิร์ฟอาหาร ปิดบิลเก็บเงิน',
    value: 'Staff',
    icon: 'mdi-account-tie',
    color: 'success'
  },
  {
    title: 'พนักงานครัว (Kitchen)',
    subtitle: 'รับคิวออเดอร์ ปรุงอาหาร เริ่มทำอาหาร',
    value: 'Kitchen',
    icon: 'mdi-pot-steam',
    color: 'info'
  }
]

async function handleRegister() {
  error.value = ''

  if (!firstName.value.trim() || !lastName.value.trim()) {
    error.value = 'กรุณากรอกชื่อและนามสกุลของพนักงาน'
    return
  }

  if (!username.value.trim()) {
    error.value = 'กรุณากำหนดชื่อผู้ใช้ (Username)'
    return
  }

  if (!password.value) {
    error.value = 'กรุณากำหนดรหัสผ่าน (Password)'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน'
    return
  }

  loading.value = true
  try {
    const res = await registerEmployee({
      firstName: firstName.value,
      lastName: lastName.value,
      phone: phone.value,
      role: role.value,
      username: username.value,
      password: password.value
    })

    registeredUser.value = res
  } catch (err) {
    error.value = authErrorMessage(err) || err.message || 'ลงทะเบียนไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

async function autoLoginAndRedirect() {
  if (!registeredUser.value) return
  loading.value = true
  try {
    const user = await loginWithEmail(registeredUser.value.username, password.value)
    const targetPath = user.role === 'Kitchen' ? '/kitchen' : '/staff'
    router.replace(targetPath)
  } catch (err) {
    router.push('/login')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  firstName.value = ''
  lastName.value = ''
  phone.value = ''
  role.value = 'Staff'
  username.value = ''
  password.value = ''
  confirmPassword.value = ''
  error.value = ''
  registeredUser.value = null
}
</script>

<template>
  <v-container class="py-8" style="max-width: 580px">
    <!-- กรณีลงทะเบียนสำเร็จแล้ว -->
    <v-card v-if="registeredUser" class="pa-6 text-center" border elevation="3" rounded="lg">
      <v-avatar color="success" size="64" class="mb-4">
        <v-icon size="36" color="white">mdi-check-circle</v-icon>
      </v-avatar>
      <h2 class="text-h5 font-weight-bold mb-1">ลงทะเบียนพนักงานสำเร็จ!</h2>
      <p class="text-body-2 text-medium-emphasis mb-4">
        ข้อมูลถูกบันทึกลงตาราง <code>employees</code> และ <code>employee_accounts</code> เรียบร้อยแล้ว
      </p>

      <v-card variant="tonal" color="primary" class="pa-4 mb-5 text-start rounded-lg">
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">รหัสพนักงาน (ID):</span>
          <span class="text-caption font-weight-bold">#{{ registeredUser.employeeId }}</span>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">ชื่อ-นามสกุล:</span>
          <span class="text-caption font-weight-bold">{{ registeredUser.displayName }}</span>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">ตำแหน่ง (Role):</span>
          <v-chip size="x-small" color="primary" variant="flat">{{ registeredUser.role }}</v-chip>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">ชื่อผู้ใช้ (Username):</span>
          <span class="text-caption font-mono font-weight-bold">{{ registeredUser.username }}</span>
        </div>
        <div class="d-flex justify-space-between">
          <span class="text-caption text-medium-emphasis">วันที่ลงทะเบียน (dateRegis):</span>
          <span class="text-caption font-weight-bold">{{ registeredUser.dateRegis }}</span>
        </div>
      </v-card>

      <div class="d-flex flex-column ga-2">
        <v-btn
          color="primary"
          size="large"
          variant="flat"
          prepend-icon="mdi-login"
          :loading="loading"
          @click="autoLoginAndRedirect"
        >
          เข้าสู่ระบบด้วยบัญชีนี้ทันที
        </v-btn>

        <div class="d-flex ga-2 mt-2">
          <v-btn class="flex-1-1" variant="tonal" prepend-icon="mdi-account-plus" @click="resetForm">
            ลงทะเบียนเพิ่มอีกคน
          </v-btn>
          <v-btn class="flex-1-1" variant="outlined" to="/database" prepend-icon="mdi-database">
            ดูข้อมูลใน Database
          </v-btn>
        </div>
      </div>
    </v-card>

    <!-- ฟอร์มลงทะเบียนพนักงาน -->
    <v-card v-else class="pa-6" border elevation="2" rounded="lg">
      <div class="text-center mb-6">
        <v-avatar color="primary" size="56" class="mb-3">
          <v-icon size="32" color="white">mdi-account-plus</v-icon>
        </v-avatar>
        <h2 class="text-h5 font-weight-bold">ลงทะเบียนพนักงานใหม่</h2>
        <p class="text-caption text-medium-emphasis">
          เพิ่มข้อมูลประวัติพนักงานและสร้างบัญชีเข้าใช้งานระบบ Somchai Kitchen
        </p>
      </div>

      <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
        {{ error }}
      </v-alert>

      <v-form @submit.prevent="handleRegister">
        <!-- ข้อมูลส่วนตัว -->
        <div class="text-subtitle-2 font-weight-bold mb-2 text-primary d-flex align-center">
          <v-icon start size="small">mdi-badge-account-horizontal-outline</v-icon>
          ข้อมูลส่วนตัวพนักงาน (Table: employees)
        </div>

        <v-row dense class="mb-1">
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="firstName"
              label="ชื่อจริง (employeeFName) *"
              variant="outlined"
              density="comfortable"
              placeholder="เช่น สมศรี"
              required
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="lastName"
              label="นามสกุล (employeeLNAME) *"
              variant="outlined"
              density="comfortable"
              placeholder="เช่น รักบริการ"
              required
            />
          </v-col>
        </v-row>

        <v-text-field
          v-model="phone"
          label="เบอร์โทรศัพท์ (phone)"
          prepend-inner-icon="mdi-phone"
          variant="outlined"
          density="comfortable"
          placeholder="เช่น 0812345678"
          class="mb-3"
        />

        <!-- ตำแหน่งงาน / Role (Dropdown) -->
        <v-select
          v-model="role"
          :items="roleOptions"
          item-title="title"
          item-value="value"
          label="ตำแหน่งงาน (Role) *"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-briefcase-outline"
          class="mb-3"
          hint="เลือกหน้าที่ของพนักงาน (พนักงานบริการหน้าร้าน หรือ พนักงานครัว)"
          persistent-hint
        >
          <template #item="{ props, item }">
            <v-list-item v-bind="props" :subtitle="item.raw.subtitle">
              <template #prepend>
                <v-avatar :color="item.raw.color" size="30" variant="tonal" class="mr-2">
                  <v-icon size="18">{{ item.raw.icon }}</v-icon>
                </v-avatar>
              </template>
            </v-list-item>
          </template>
          <template #selection="{ item }">
            <div class="d-flex align-center">
              <v-icon :icon="item.raw.icon" size="18" :color="item.raw.color" class="mr-2" />
              <span class="font-weight-medium">{{ item.raw.title }}</span>
            </div>
          </template>
        </v-select>

        <!-- บัญชีผู้ใช้ -->
        <div class="text-subtitle-2 font-weight-bold mb-2 text-primary d-flex align-center">
          <v-icon start size="small">mdi-shield-key-outline</v-icon>
          ข้อมูลบัญชีเข้าใช้งาน (Table: employee_accounts)
        </div>

        <v-text-field
          v-model="username"
          label="ชื่อผู้ใช้สำหรับล็อกอิน (employeeUserName) *"
          prepend-inner-icon="mdi-account"
          variant="outlined"
          density="comfortable"
          placeholder="เช่น somsri, chef_noi"
          class="mb-2"
          required
        />

        <v-row dense class="mb-3">
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="password"
              label="รหัสผ่าน (employeePwd) *"
              type="password"
              prepend-inner-icon="mdi-lock"
              variant="outlined"
              density="comfortable"
              placeholder="••••••••"
              required
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="confirmPassword"
              label="ยืนยันรหัสผ่าน *"
              type="password"
              prepend-inner-icon="mdi-lock-check"
              variant="outlined"
              density="comfortable"
              placeholder="••••••••"
              required
            />
          </v-col>
        </v-row>

        <v-btn
          type="submit"
          color="primary"
          block
          size="large"
          prepend-icon="mdi-account-plus"
          :loading="loading"
          class="mb-4"
        >
          ลงทะเบียนพนักงาน
        </v-btn>
      </v-form>

      <v-divider class="my-3" />

      <div class="d-flex justify-space-between align-center text-caption mt-2">
        <span class="text-medium-emphasis">มีบัญชีพนักงานอยู่แล้ว?</span>
        <v-btn variant="text" size="small" color="primary" to="/login" prepend-icon="mdi-login">
          ไปหน้าเข้าสู่ระบบ (Login)
        </v-btn>
      </div>
    </v-card>
  </v-container>
</template>
