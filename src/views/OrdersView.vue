<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useOrderStore } from '../stores/order'
import { OrderStatus } from '../constant' // ★ ค่ากลางสถานะอาหาร — จอลูกค้าใช้แสดง/เทียบด้วยคำชุดเดียวกับครัว
import StaffDialog from '../components/StaffDialog.vue'
import BillDialog from '../components/BillDialog.vue'
import { authDeniedMessage } from '../auth' // ★ สัปดาห์ที่ 9 — แยกการถูกปฏิเสธเรื่องสิทธิ์ออกจากความล้มเหลวทั่วไป

const order = useOrderStore()
const route = useRoute()

// สี่สถานะของการดึงออเดอร์ (ARCHITECTURE.md §6): กำลังโหลด / ผิดพลาด / ว่าง / สำเร็จ
const loading = ref(true) // เริ่ม true ให้เฟรมแรกเป็นจอโหลด ไม่วูบเป็นจอว่างก่อน
const error = ref(false)

const snackbar = ref(false)
const snackText = ref('')
const staffOpen = ref(false)
const billOpen = ref(false)

function showSnack(text) {
  snackText.value = text
  snackbar.value = true
}

// ดึงออเดอร์ของโต๊ะนี้ "ผ่านชั้น API" — ห่อ try/catch/finally เพื่อรองรับสี่สถานะ
async function load(isSilent = false) {
  if (!isSilent) loading.value = true
  error.value = false
  try {
    if (order.table) {
      await order.loadOrders(order.table, route.query.failorder === '1')
    }
  } catch (e) {
    if (!isSilent) error.value = true
  } finally {
    if (!isSilent) loading.value = false
  }
}

let pollTimer = null

onMounted(() => {
  load()
  // อัปเดตสถานะของเมนูและออเดอร์อัตโนมัติในเบื้องหลังทุก 1.5 วินาที โดยไม่ต้องกดรีเฟรชเอง
  pollTimer = setInterval(() => {
    if (order.table && !billOpen.value) {
      load(true)
    }
  }, 1500)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

// รีเฟรชด้วยตนเอง (หากต้องการกด)
async function refresh() {
  await load()
  if (!error.value) showSnack('อัปเดตสถานะล่าสุดแล้ว')
}

// สถานะแต่ละขั้นของอาหาร: มีทั้งสี + ไอคอน + คำ (ไม่สื่อด้วยสีอย่างเดียว เพื่อการเข้าถึง)
//   ★ คีย์ = ค่าจาก OrderStatus (convention 2.1) — ถ้าครัวตั้งค่านอกชุดนี้ (เช่น 'cooking' พิมพ์สด)
//     การเปิด statusMeta[it.status] จะไม่เจอ = จานนั้นแสดงผิด · ยึดค่ากลางทั้งสองฝั่งจึงเห็นตรงกัน
const statusMeta = {
  PENDING: { color: 'info', icon: 'mdi-clipboard-text-clock-outline' },
  [OrderStatus.TO_KITCHEN]: { color: 'info', icon: 'mdi-clipboard-text-clock-outline' },
  COOKING: { color: 'warning', icon: 'mdi-pot-steam-outline' },
  [OrderStatus.COOKING]: { color: 'warning', icon: 'mdi-pot-steam-outline' },
  DONE: { color: 'secondary', icon: 'mdi-check-circle-outline' },
  SERVED: { color: 'success', icon: 'mdi-check-all' },
  [OrderStatus.SERVED]: { color: 'success', icon: 'mdi-check-all' }
}

function getStatusMeta(status) {
  return statusMeta[status] || { color: 'info', icon: 'mdi-clock-outline' }
}

// เวลารูปแบบไทย (ปีพุทธ) ให้ระบบทำเอง ไม่บวก +543
function thaiDateTime(d) {
  if (!d) return ''
  try {
    const dt = typeof d?.toDate === 'function' ? d.toDate() : (d instanceof Date ? d : new Date(d))
    if (isNaN(dt.getTime())) return String(d)
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(dt)
  } catch {
    return String(d)
  }
}

function optionText(it) {
  const parts = []
  if (it.spice) parts.push(it.spice)
  if (it.sweet) parts.push(it.sweet)
  if (it.toppings && it.toppings.length) parts.push('+ ' + it.toppings.map((t) => t.name).join(', '))
  return parts.join(' · ')
}

// เรียกพนักงาน = เขียนของกลางผ่าน server (async) → จอพนักงานเห็นคำขอนี้
async function onStaffCall(reason) {
  try {
    await order.callStaff(reason)
    showSnack('เรียกพนักงานแล้ว: ' + reason)
  } catch (e) {
    showSnack(authDeniedMessage(e) || 'เรียกพนักงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <div class="d-flex align-center flex-wrap ga-2 mb-4">
      <span class="text-h4 font-weight-bold">ติดตามออเดอร์</span>
      <v-chip size="small" color="success" variant="tonal" class="d-none d-sm-inline-flex">
        <v-icon start size="x-small">mdi-circle</v-icon>
        อัปเดตสถานะสด (Live)
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="!loading && !error"
        variant="text"
        prepend-icon="mdi-refresh"
        @click="refresh"
      >รีเฟรช</v-btn>
      <v-btn
        v-if="!loading && !error && order.hasOrders"
        variant="tonal"
        prepend-icon="mdi-plus"
        to="/menu"
      >สั่งเพิ่ม</v-btn>
    </div>

    <!-- สถานะ 1: กำลังโหลด — ระหว่างรอชั้น API ตอบ (ARCHITECTURE.md §6) -->
    <div v-if="loading" class="text-center py-12 text-medium-emphasis">
      <v-progress-circular indeterminate color="primary" size="48" width="4" class="mb-3" />
      <div class="text-body-1">กำลังดึงออเดอร์ของโต๊ะนี้...</div>
    </div>

    <!-- สถานะ 2: ผิดพลาด — เรียกชั้น API ล้มเหลว · บอกผู้ใช้ + มีปุ่มลองใหม่ -->
    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
      title="ดึงออเดอร์ไม่สำเร็จ"
      text="เกิดปัญหาระหว่างติดต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง"
      class="my-4"
    >
      <template #append>
        <v-btn color="error" variant="flat" @click="load">ลองใหม่</v-btn>
      </template>
    </v-alert>

    <!-- สถานะ 3: ว่าง — โต๊ะนี้ยังไม่มีออเดอร์ (บอกผู้ใช้ + ทางออก ไม่ใช่จอเปล่า) -->
    <div v-else-if="!order.hasOrders" class="text-center py-12 text-medium-emphasis">
      <v-icon size="56" class="mb-2">mdi-receipt-text-clock-outline</v-icon>
      <div class="text-body-1 mb-4">โต๊ะนี้ยังไม่มีออเดอร์ที่ส่งเข้าครัว</div>
      <v-btn to="/menu" prepend-icon="mdi-silverware-fork-knife">ไปสั่งอาหาร</v-btn>
    </div>

    <!-- สถานะ 4: สำเร็จ — มีรายการออเดอร์ที่ดึงผ่านชั้น API -->
    <template v-else>
      <p class="text-body-2 text-medium-emphasis mb-4">
        สถานะอาหารเลื่อนโดยครัว — กด "รีเฟรช" เพื่อดูสถานะล่าสุด
      </p>

      <!-- แต่ละออเดอร์ -->
      <v-card v-for="o in order.orders" :key="o.no" border class="mb-4">
        <v-card-item>
          <div class="d-flex align-center flex-wrap ga-2">
            <v-chip color="primary" size="small" prepend-icon="mdi-silverware">ออเดอร์ #{{ o.no }}</v-chip>
            <span class="text-body-2">โต๊ะ {{ o.table }}</span>
            <v-spacer />
            <span class="text-caption text-medium-emphasis">ส่งเมื่อ {{ thaiDateTime(o.at) }}</span>
          </div>
        </v-card-item>
        <v-divider />

        <!-- รายการในออเดอร์ + สถานะรายเมนู (ลูกค้าดูอย่างเดียว — ครัวเป็นผู้เลื่อนสถานะ) -->
        <v-list lines="two" density="comfortable">
          <template v-for="(it, idx) in o.items" :key="it.lineId">
            <v-divider v-if="idx > 0" />
            <v-list-item>
              <v-list-item-title class="font-weight-medium">{{ it.name }} × {{ it.qty }}</v-list-item-title>
              <v-list-item-subtitle v-if="optionText(it)">{{ optionText(it) }}</v-list-item-subtitle>
              <v-list-item-subtitle v-if="it.note" class="text-secondary">หมายเหตุ: {{ it.note }}</v-list-item-subtitle>

              <template #append>
                <v-chip
                  :color="getStatusMeta(it.status).color"
                  :prepend-icon="getStatusMeta(it.status).icon"
                  size="small"
                  variant="tonal"
                >
                  {{ it.status }}
                </v-chip>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card>

      <!-- ปุ่มการกระทำ: เรียกพนักงาน + เช็คบิล -->
      <div class="d-flex flex-column flex-sm-row ga-3 mt-2">
        <v-btn variant="tonal" prepend-icon="mdi-bell-outline" @click="staffOpen = true">เรียกพนักงาน</v-btn>
        <v-spacer class="d-none d-sm-block" />
        <v-btn prepend-icon="mdi-receipt-text-outline" @click="billOpen = true">เช็คบิล / แยกบิล</v-btn>
      </div>
    </template>

    <StaffDialog v-model="staffOpen" @call="onStaffCall" />
    <BillDialog v-model="billOpen" />
    <!-- แถบข้อความ: วางไว้ด้านบนเพื่อไม่ให้แถบเตือนของ emulator ที่อยู่ด้านล่างบัง ·
         ตั้งเวลาแสดงไว้ 6 วินาทีและมีปุ่มปิด เพื่อให้อ่านข้อความปฏิเสธได้ทันและเก็บภาพหลักฐานได้ -->
    <v-snackbar v-model="snackbar" :timeout="6000" location="top">
      {{ snackText }}
      <template #actions>
        <v-btn variant="text" @click="snackbar = false">ปิด</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>
