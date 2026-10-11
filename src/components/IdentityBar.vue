<script setup>
// ============================================================================
// IdentityBar — แถบบอกว่า "ตอนนี้ใครใช้งานจอนี้อยู่"  ★ ใหม่ในสัปดาห์ที่ 9
//
// ใช้ที่จอครัว (/kitchen) และจอพนักงาน (/staff) — ให้มาแล้ว ไม่ต้องแก้ไฟล์นี้
//   เข้าสู่ระบบแล้ว : แสดงอีเมล · วิธีที่ใช้เข้าสู่ระบบ (อีเมลและรหัสผ่าน / บัญชี Google) · บทบาท + ปุ่มออกจากระบบ
//   ยังไม่เข้าสู่ระบบ: แสดงว่า "ยังไม่ได้เข้าสู่ระบบ" — สภาพตั้งต้นของสตาร์ตเตอร์นี้
//
// ★ ทำไมต้องแสดง "บทบาท" ไว้บนจอตลอด
//   การเข้าสู่ระบบสำเร็จให้แค่ตัวตน ไม่ได้ให้บทบาท — บัญชีที่ยังไม่ถูกแต่งตั้งจะเข้าจอได้
//   แต่กดปุ่มแล้วถูก server ปฏิเสธ แถบนี้ทำให้เห็นสาเหตุทันทีว่า "ยังไม่ได้รับแต่งตั้งบทบาท"
//
// ★ แถบนี้ไม่ใช่การบังคับสิทธิ์ — เป็นการแสดงผล การบังคับอยู่ที่ server เสมอ
// ============================================================================
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentUserRef, currentRoleRef, authReadyRef, signInMethodRef, logout } from '../auth'

const route = useRoute()
const router = useRouter()

// แสดงแถบเมื่อเข้าสู่ระบบด้วยบัญชีจริงแล้วเท่านั้น
//   รอ authReadyRef ก่อนเสมอ — ระหว่างที่ระบบยังอ่านสถานะการเข้าสู่ระบบค้างอยู่ ยังตัดสินไม่ได้
const signedIn = computed(() =>
  authReadyRef.value && currentUserRef.value && !currentUserRef.value.isAnonymous)

const roleText = computed(() => currentRoleRef.value || 'ยังไม่ได้รับแต่งตั้งบทบาท')

// ออกจากระบบแล้วกลับไปหน้าเข้าสู่ระบบ พร้อมจำหน้าปัจจุบันไว้ให้กลับมาหลังเข้าสู่ระบบใหม่
//   ★ แถบนี้พาไปที่เส้นทาง /login และส่งหน้าเดิมไปกับพารามิเตอร์ next
//     หน้าเข้าสู่ระบบที่คุณสร้าง (งานข้อ ①) ต้องอยู่ที่เส้นทางนี้และอ่านค่า next ไปใช้
async function onLogout() {
  await logout()
  router.replace({ path: '/login', query: { next: route.fullPath } })
}
</script>

<template>
  <!-- ยังไม่ได้เข้าสู่ระบบ — จอนี้ยังเปิดใช้งานได้ทั้งที่ระบบไม่รู้ว่าใครเป็นผู้ใช้ -->
  <v-alert v-if="authReadyRef && !signedIn" variant="tonal" color="warning" density="compact" class="mb-4"
    data-testid="identity-bar-anonymous">
    <div class="d-flex align-center flex-wrap ga-2">
      <v-icon size="small">mdi-account-question-outline</v-icon>
      <span class="text-body-2">ยังไม่ได้เข้าสู่ระบบ</span>
    </div>
  </v-alert>

  <v-alert v-if="signedIn" variant="tonal" color="primary" density="compact" class="mb-4"
    data-testid="identity-bar">
    <div class="d-flex align-center flex-wrap ga-2">
      <v-icon size="small">mdi-account-check-outline</v-icon>
      <span class="text-body-2">
        เข้าสู่ระบบเป็น <strong>{{ currentUserRef.email || currentUserRef.displayName || currentUserRef.username }}</strong>
        · ผ่าน <strong>{{ signInMethodRef }}</strong>
        · บทบาท <strong>{{ roleText }}</strong>
      </span>
      <v-spacer />
      <v-btn size="small" variant="text" prepend-icon="mdi-logout"
        data-testid="btn-logout" @click="onLogout">
        ออกจากระบบ
      </v-btn>
    </div>
  </v-alert>
</template>
