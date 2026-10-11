<script setup>
// ============================================================================
// จอครัว (/kitchen) — เห็นคิวออเดอร์ทุกโต๊ะที่ยังทำไม่เสร็จ + เลื่อนสถานะอาหารทีละจาน
//
// ★ เลื่อนสถานะ = เรียก Cloud Function updateItemStatus "จริง" (ไม่ใช่ client mock)
//   server เลื่อนค่าตาม OrderStatus แล้วบันทึกลง Firestore → จอลูกค้าอ่านค่าเดียวกันเห็นตรง
// ★ การอ่านคิวมาแสดง = อ่าน Firestore ตรงผ่าน db.js (readKitchenQueue) กรองด้วย OrderStatus.SERVED
//
// ★ สัปดาห์ที่ 9 (การยืนยันตัวตน): ตอนนี้จอนี้ยัง "เปิดได้เลย" โดยไม่ต้องบอกว่าตัวเองเป็นใคร
//   งานของคุณคือทำให้จอนี้เข้าได้เฉพาะบัญชีของร้าน (งานข้อ ①) และให้ server ปฏิเสธผู้เรียก
//   ที่ไม่ใช่บทบาทครัว (งานข้อ ②) — ตัวไฟล์จอนี้ไม่ต้องแก้
//   จอพร้อมแล้วสำหรับทั้งสองอย่าง: มีแถบบอกตัวตนอยู่บนสุด และเมื่อ server ปฏิเสธด้วยรหัสสิทธิ์
//   จอจะแสดงข้อความจาก server ให้ผู้ใช้เห็น (ไม่พังเงียบ ๆ)
// ============================================================================
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { readKitchenQueue } from '../db'
import { updateItemStatus } from '../api/ops'
import { OrderStatus } from '../constant' // ★ ค่ากลางสถานะอาหาร — คีย์เดียวกับจอลูกค้า
import { currentUserRef, authDeniedMessage } from '../auth'
import IdentityBar from '../components/IdentityBar.vue'

const queue = ref([])
const loading = ref(true)
const error = ref(false)
const busyKey = ref('')   // คีย์ของรายการที่กำลังเลื่อนสถานะ (กันกดซ้ำ)

const snackbar = ref(false)
const snackText = ref('')
function showSnack(text) { snackText.value = text; snackbar.value = true }

function itemKey(orderNo, lineId) { return orderNo + '-' + lineId }

async function load() {
  loading.value = true
  error.value = false
  try {
    queue.value = await readKitchenQueue()
  } catch (e) {
    error.value = true
  } finally {
    loading.value = false
  }
}

let pollTimer = null

onMounted(() => {
  // ดึงคิวอาหารในครัวอัตโนมัติทุก 2 วินาทีโดยไม่ต้องกดรีเฟรช
  pollTimer = setInterval(async () => {
    if (currentUserRef.value && !loading.value) {
      try {
        const fresh = await readKitchenQueue()
        queue.value = fresh
      } catch {}
    }
  }, 2000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

// โหลดคิวเมื่อมีตัวตนแล้ว และโหลดใหม่ทุกครั้งที่เปลี่ยนผู้ใช้ (เข้าสู่ระบบ/ออกจากระบบ)
watch(currentUserRef, (user) => {
  if (user) load()
  else loading.value = false   // ยังไม่มีตัวตน — หน้าต่างเข้าสู่ระบบขึ้นทับอยู่แล้ว
}, { immediate: true })

async function refresh() {
  await load()
  if (!error.value) showSnack('อัปเดตคิวล่าสุดแล้ว')
}

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

const nextActionLabel = {
  PENDING: 'เริ่มทำ',
  [OrderStatus.TO_KITCHEN]: 'เริ่มทำ',
  COOKING: 'เสิร์ฟแล้ว',
  [OrderStatus.COOKING]: 'เสิร์ฟแล้ว'
}

function thaiTime(d) {
  if (!d) return ''
  const dt = typeof d?.toDate === 'function' ? d.toDate() : (d instanceof Date ? d : new Date(d))
  return new Intl.DateTimeFormat('th-TH', { timeStyle: 'short' }).format(dt)
}

function optionText(it) {
  const parts = []
  if (it.spice) parts.push(it.spice)
  if (it.sweet) parts.push(it.sweet)
  if (it.toppings && it.toppings.length) parts.push('+ ' + it.toppings.map((t) => t.name).join(', '))
  return parts.join(' · ')
}

// เลื่อนสถานะอาหาร (พ่อครัวเปลี่ยนเฉพาะ PENDING -> COOKING)
async function advance(orderNo, lineId) {
  const key = itemKey(orderNo, lineId)
  busyKey.value = key
  try {
    const res = await updateItemStatus(orderNo, lineId, 'COOKING')
    await load()
    showSnack(`ออเดอร์ #${orderNo} เริ่มปรุงอาหารแล้ว`)
  } catch (e) {
    showSnack(authDeniedMessage(e) || 'เลื่อนสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  } finally {
    busyKey.value = ''
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 960px">
    <div class="d-flex align-center flex-wrap ga-2 mb-1">
      <v-icon color="primary" class="me-1">mdi-pot-steam</v-icon>
      <span class="text-h4 font-weight-bold">จอครัว</span>
      <v-spacer />
      <v-btn v-if="!loading && !error" variant="text" prepend-icon="mdi-refresh" @click="refresh">รีเฟรช</v-btn>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-5">คิวออเดอร์ทุกโต๊ะที่ยังทำไม่เสร็จ — กดเลื่อนสถานะเมื่อรับมาทำ/เสิร์ฟแล้ว</p>

    <!-- ใครใช้งานจออยู่ · เข้ามาด้วยวิธีไหน · บทบาทอะไร + ปุ่มออกจากระบบ -->
    <IdentityBar />

    <!-- กำลังโหลด -->
    <div v-if="loading" class="text-center py-12 text-medium-emphasis">
      <v-progress-circular indeterminate color="primary" size="48" width="4" class="mb-3" />
      <div class="text-body-1">กำลังดึงคิวออเดอร์...</div>
    </div>

    <!-- ผิดพลาด -->
    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
      title="ดึงคิวไม่สำเร็จ"
      text="เกิดปัญหาระหว่างติดต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง"
      class="my-4"
    >
      <template #append>
        <v-btn color="error" variant="flat" @click="load">ลองใหม่</v-btn>
      </template>
    </v-alert>

    <!-- ว่าง — ไม่มีออเดอร์ในคิว -->
    <div v-else-if="queue.length === 0" class="text-center py-12 text-medium-emphasis">
      <v-icon size="56" class="mb-2">mdi-pot-outline</v-icon>
      <div class="text-body-1">ยังไม่มีออเดอร์ในคิว</div>
      <div class="text-caption">เมื่อมีลูกค้าส่งออเดอร์เข้าครัว จะแสดงที่นี่</div>
    </div>

    <!-- สำเร็จ — มีคิว -->
    <template v-else>
      <v-card v-for="o in queue" :key="o.no" border class="mb-4">
        <v-card-item>
          <div class="d-flex align-center flex-wrap ga-2">
            <v-chip color="primary" size="small" prepend-icon="mdi-silverware">ออเดอร์ #{{ o.no }}</v-chip>
            <v-chip color="secondary" size="small" variant="tonal" prepend-icon="mdi-table-chair">โต๊ะ {{ o.table }}</v-chip>
            <v-spacer />
            <span class="text-caption text-medium-emphasis">รับเมื่อ {{ thaiTime(o.at) }}</span>
          </div>
        </v-card-item>
        <v-divider />

        <v-list lines="two" density="comfortable">
          <template v-for="(it, idx) in o.items" :key="it.lineId">
            <v-divider v-if="idx > 0" />
            <v-list-item>
              <v-list-item-title class="font-weight-medium">{{ it.name }} × {{ it.qty }}</v-list-item-title>
              <v-list-item-subtitle v-if="optionText(it)">{{ optionText(it) }}</v-list-item-subtitle>
              <v-list-item-subtitle v-if="it.note" class="text-secondary">หมายเหตุ: {{ it.note }}</v-list-item-subtitle>

              <template #append>
                <div class="d-flex flex-column flex-sm-row align-end align-sm-center ga-2">
                  <v-chip
                    :color="getStatusMeta(it.status).color"
                    :prepend-icon="getStatusMeta(it.status).icon"
                    size="small"
                    variant="tonal"
                  >
                    {{ it.status }}
                  </v-chip>
                  <v-btn
                    v-if="it.status === 'PENDING' || it.status === OrderStatus.TO_KITCHEN"
                    size="small"
                    color="primary"
                    prepend-icon="mdi-pot-steam"
                    :loading="busyKey === (o.no + '-' + it.lineId)"
                    :disabled="!!busyKey"
                    @click="advance(o.no, it.lineId)"
                  >
                    เริ่มทำ
                  </v-btn>
                  <span
                    v-else-if="it.status === 'COOKING'"
                    class="text-caption text-medium-emphasis font-italic"
                  >
                    (รอพนักงานเสิร์ฟ)
                  </span>
                </div>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card>
    </template>

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
