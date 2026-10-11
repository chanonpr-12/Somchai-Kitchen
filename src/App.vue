<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useOrderStore } from './stores/order'
import { CATEGORIES } from './data/menu'
import { currentUserRef, logout } from './auth'

const order = useOrderStore()
const router = useRouter()
const route = useRoute()

// ตรวจสอบสถานะการเข้าสู่ระบบของพนักงาน
const isStaff = computed(() => {
  const u = currentUserRef.value
  return !!(u && !u.isAnonymous && (u.role === 'Staff' || u.role === 'Kitchen' || u.role === 'Admin'))
})
const userRole = computed(() => currentUserRef.value?.role || '')

// โครงหน้ามาตรฐาน: แถบข้างเป็นหมวดหมู่ — permanent บนจอกว้าง, hamburger บนมือถือ
const { mdAndUp } = useDisplay()
const drawer = ref(mdAndUp.value)

// คลิก 3 ครั้งที่ชื่อร้าน เพื่อเปิดหน้าเข้าสู่ระบบของพนักงาน (Secret Trigger)
let clickTimer = null
const secretClicks = ref(0)
function handleTitleClick() {
  secretClicks.value++
  if (clickTimer) clearTimeout(clickTimer)
  if (secretClicks.value >= 3) {
    secretClicks.value = 0
    router.push('/login')
    return
  }
  clickTimer = setTimeout(() => {
    secretClicks.value = 0
  }, 1000)
}

async function handleLogout() {
  await logout()
  if (!mdAndUp.value) drawer.value = false
  router.push('/menu')
}

// ไอคอนประจำหมวด
const catIcon = {
  'ทั้งหมด': 'mdi-silverware-fork-knife',
  'จานหลัก': 'mdi-rice',
  'ของทานเล่น': 'mdi-food-drumstick',
  'ของหวาน': 'mdi-cupcake',
  'เครื่องดื่ม': 'mdi-cup',
  'ต้มและแกง': 'mdi-pot-steam-outline',
  'เมนูเส้น': 'mdi-noodles'
}

// เลือกหมวด: ตั้งค่าที่ store แล้วพาไปหน้าเมนู (ลูกค้าต้องเลือกโต๊ะก่อน)
function pickCategory(cat) {
  if (!isStaff.value && !order.table) {
    if (route.path !== '/') router.push('/')
    if (!mdAndUp.value) drawer.value = false
    return
  }
  order.setCategory(cat)
  if (route.path !== '/menu') router.push('/menu')
  if (!mdAndUp.value) drawer.value = false
}
</script>

<template>
  <v-app>
    <!-- แถบบน: แบรนด์ + โต๊ะปัจจุบัน + ตะกร้า -->
    <v-app-bar color="primary" flat>
      <v-app-bar-nav-icon color="white" class="d-md-none" aria-label="เปิดเมนูหมวดหมู่" @click="drawer = !drawer" />

      <!-- ชื่อร้าน: เคาะ 3 ครั้งติดกันเพื่อเข้าหน้า Login ของพนักงาน (ซ่อนจากลูกค้า 100%) -->
      <v-app-bar-title class="text-white user-select-none cursor-pointer" @click="handleTitleClick">
        <span class="font-weight-bold">ครัวคุณสมชาย</span>
        <span class="text-caption d-none d-sm-inline ms-2" style="opacity:.85">สั่งอาหารที่โต๊ะ</span>
      </v-app-bar-title>

      <!-- ปุ่ม Database จะแสดงเฉพาะเมื่อพนักงานล็อกอินแล้วเท่านั้น -->
      <v-btn v-if="isStaff" to="/database" variant="text" color="white" prepend-icon="mdi-database" class="d-none d-sm-inline-flex">
        <span>Database</span>
      </v-btn>

      <!-- โต๊ะปัจจุบัน -->
      <v-btn to="/" variant="text" color="white" prepend-icon="mdi-table-chair" aria-label="เลือกโต๊ะ">
        <span class="d-none d-sm-inline">{{ order.table ? 'โต๊ะ ' + order.table : 'เลือกโต๊ะ' }}</span>
        <span class="d-sm-none">{{ order.table || '' }}</span>
      </v-btn>

      <!-- ตะกร้า พร้อมป้ายจำนวน (เปิดได้เมื่อเลือกโต๊ะแล้ว หรือเป็นพนักงาน) -->
      <v-btn
        to="/cart"
        icon
        aria-label="ตะกร้า"
        color="white"
        :disabled="!isStaff && !order.table"
      >
        <v-badge :content="order.cartCount" :model-value="order.cartCount > 0" color="error">
          <v-icon>mdi-cart</v-icon>
        </v-badge>
      </v-btn>
    </v-app-bar>

    <!-- แถบนำทางด้านข้าง -->
    <v-navigation-drawer v-model="drawer" :permanent="mdAndUp">
      <v-list nav density="comfortable">
        <!-- เมนูของลูกค้า -->
        <v-list-item to="/" prepend-icon="mdi-table-chair" title="เลือกโต๊ะ" @click="!mdAndUp && (drawer = false)" />
        <v-list-item
          to="/menu"
          prepend-icon="mdi-silverware-fork-knife"
          title="เมนูอาหาร"
          :disabled="!isStaff && !order.table"
          @click="!mdAndUp && (drawer = false)"
        />
        <v-list-item
          to="/orders"
          prepend-icon="mdi-receipt-text-clock-outline"
          title="ติดตามออเดอร์"
          :disabled="!isStaff && !order.table"
          @click="!mdAndUp && (drawer = false)"
        />
        <v-divider class="my-2" />
        <v-list-subheader>หมวดหมู่</v-list-subheader>
        <v-list-item
          v-for="c in CATEGORIES"
          :key="c"
          :prepend-icon="catIcon[c]"
          :title="c"
          :disabled="!isStaff && !order.table"
          :active="route.path === '/menu' && order.activeCat === c"
          color="primary"
          @click="pickCategory(c)"
        />

        <!-- ส่วนของพนักงาน: แสดงเฉพาะเมื่อล็อกอินแล้วเท่านั้น ซ่อนจากลูกค้า 100% -->
        <template v-if="isStaff">
          <v-divider class="my-2" />
          <v-list-subheader class="text-primary font-weight-bold d-flex align-center">
            <v-icon start size="small">mdi-badge-account-horizontal</v-icon>
            {{ currentUserRef?.displayName || currentUserRef?.username }} ({{ userRole }})
          </v-list-subheader>

          <v-list-item
            v-if="userRole === 'Kitchen' || userRole === 'Admin'"
            to="/kitchen"
            prepend-icon="mdi-pot-steam"
            title="จอครัว"
            @click="!mdAndUp && (drawer = false)"
          />
          <v-list-item
            v-if="userRole === 'Staff' || userRole === 'Admin'"
            to="/staff"
            prepend-icon="mdi-account-tie"
            title="จอพนักงาน"
            @click="!mdAndUp && (drawer = false)"
          />
          <v-list-item
            v-if="userRole === 'Staff' || userRole === 'Admin'"
            to="/register"
            prepend-icon="mdi-account-plus"
            title="สมัครพนักงานใหม่"
            @click="!mdAndUp && (drawer = false)"
          />
          <v-list-item
            to="/database"
            prepend-icon="mdi-database"
            title="Database"
            @click="!mdAndUp && (drawer = false)"
          />
          <v-list-item
            prepend-icon="mdi-logout"
            title="ออกจากระบบ"
            color="error"
            class="text-error"
            @click="handleLogout"
          />
        </template>
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <router-view :key="$route.fullPath" />
    </v-main>

    <v-footer color="surface" class="border-t">
      <div class="text-center text-caption text-medium-emphasis w-100 py-2">
        ครัวคุณสมชาย · ระบบสั่งอาหารที่โต๊ะ
      </div>
    </v-footer>
  </v-app>
</template>
