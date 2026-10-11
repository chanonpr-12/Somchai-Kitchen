<script setup>
// ============================================================================
// จอพนักงาน (/staff) — คำขอเรียกจากทุกโต๊ะ + สถานะโต๊ะทั้งผัง + ปิดบิล
//
// ★ ปิดบิล = เรียก Cloud Function checkout "จริง" — server รวมเงินจากราคาที่บันทึกไว้ + คิด VAT (VAT_RATE)
//   ออกเลขบิลไม่ซ้ำ แล้วคืนโต๊ะเป็น TableStatus.FREE → ยอดตรงกับที่ sendOrder บันทึก (เชื่อ client ไม่ได้)
// ★ อ่านคำขอ/ผังโต๊ะมาแสดง = อ่าน Firestore ตรงผ่าน db.js · การจัดการคำขอ/ปิดบิล = ผ่าน Cloud Function
//
// ★ สัปดาห์ที่ 9 (การยืนยันตัวตน): ตอนนี้จอนี้ยัง "เปิดได้เลย" โดยไม่ต้องบอกว่าตัวเองเป็นใคร
//   และปุ่มปิดบิลก็ทำงานสำเร็จกับทุกคนที่กด — ระบบยังไม่ตรวจอะไรทั้งสิ้น
//   งานของคุณคือทำให้จอนี้เข้าได้เฉพาะบัญชีของร้าน (งานข้อ ①) และให้ server ปฏิเสธผู้เรียก
//   ที่ไม่ใช่บทบาทพนักงาน (งานข้อ ②) — ตัวไฟล์จอนี้ไม่ต้องแก้
//   จอพร้อมแล้วสำหรับทั้งสองอย่าง: มีแถบบอกตัวตนอยู่บนสุด และเมื่อ server ปฏิเสธด้วยรหัสสิทธิ์
//   จอจะแสดงข้อความจาก server ให้ผู้ใช้เห็น (ไม่พังเงียบ ๆ)
// ============================================================================
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { readTables, readStaffCalls, readKitchenQueue, readOrders } from '../db'
import { checkout as apiCheckout, resolveStaffCall, updateItemStatus } from '../api/ops'
import { TableStatus } from '../constant' // ★ ค่ากลางสถานะโต๊ะ (ว่าง/ใช้งานอยู่)
import { currentUserRef, authDeniedMessage } from '../auth'
import IdentityBar from '../components/IdentityBar.vue'
import PaymentDialog from '../components/PaymentDialog.vue'

const tables = ref([])
const calls = ref([])
const servingQueue = ref([])
const loading = ref(true)
const error = ref(false)
const busyTable = ref('')  // โต๊ะที่กำลังปิดบิล
const busyCall = ref('')   // คำขอที่กำลังปิด
const busyServe = ref('')  // รายการที่กำลังกดยกเสิร์ฟ

const snackbar = ref(false)
const snackText = ref('')
function showSnack(text) { snackText.value = text; snackbar.value = true }

// ใบเสร็จหลังปิดบิล (แสดงในหน้าต่าง)
const billOpen = ref(false)
const bill = ref(null)

const occupiedCount = computed(() => tables.value.filter((t) => t.status === TableStatus.OCCUPIED).length)

async function load() {
  loading.value = true
  error.value = false
  try {
    const [t, c, q] = await Promise.all([readTables(), readStaffCalls(), readKitchenQueue()])
    tables.value = t
    calls.value = c
    // ดึงเฉพาะรายการที่พ่อครัวเริ่มทำแล้ว (COOKING) เพื่อให้พนักงานยกเสิร์ฟ
    servingQueue.value = (q || []).flatMap((ord) =>
      (ord.items || [])
        .filter((it) => it.status === 'COOKING')
        .map((it) => ({
          orderNo: ord.no,
          table: ord.table,
          ...it
        }))
    )
  } catch (e) {
    error.value = true
  } finally {
    loading.value = false
  }
}

let pollTimer = null

onMounted(() => {
  // ดึงข้อมูลโต๊ะ คำขอเรียก และคิวเสิร์ฟอัตโนมัติทุก 2.5 วินาที
  pollTimer = setInterval(async () => {
    if (currentUserRef.value && !loading.value && !billOpen.value) {
      try {
        const [t, c, q] = await Promise.all([readTables(), readStaffCalls(), readKitchenQueue()])
        tables.value = t
        calls.value = c
        servingQueue.value = (q || []).flatMap((ord) =>
          (ord.items || [])
            .filter((it) => it.status === 'COOKING')
            .map((it) => ({
              orderNo: ord.no,
              table: ord.table,
              ...it
            }))
        )
      } catch {}
    }
  }, 2500)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

// โหลดข้อมูลเมื่อมีตัวตนแล้ว และโหลดใหม่ทุกครั้งที่เปลี่ยนผู้ใช้ (เข้าสู่ระบบ/ออกจากระบบ)
watch(currentUserRef, (user) => {
  if (user) load()
  else loading.value = false   // ยังไม่มีตัวตน — หน้าต่างเข้าสู่ระบบขึ้นทับอยู่แล้ว
}, { immediate: true })

async function refresh() {
  await load()
  if (!error.value) showSnack('อัปเดตข้อมูลล่าสุดแล้ว')
}

const tableStatusMeta = {
  [TableStatus.FREE]: { color: 'success', icon: 'mdi-table-check' },
  [TableStatus.AVAILABLE]: { color: 'success', icon: 'mdi-table-check' },
  [TableStatus.OCCUPIED]: { color: 'warning', icon: 'mdi-account-group' },
  'AVAILABLE': { color: 'success', icon: 'mdi-table-check' },
  'OCCUPIED': { color: 'warning', icon: 'mdi-account-group' }
}

function thaiTime(d) {
  if (!d) return ''
  const dt = typeof d?.toDate === 'function' ? d.toDate() : (d instanceof Date ? d : new Date(d))
  return new Intl.DateTimeFormat('th-TH', { timeStyle: 'short' }).format(dt)
}

const callIcon = {
  'ขอน้ำ': 'mdi-cup-water',
  'ขอช้อนส้อม/อุปกรณ์': 'mdi-silverware-fork-knife',
  'ขอความช่วยเหลือ': 'mdi-hand-back-right-outline',
  'ขอเช็คบิล': 'mdi-receipt-text-outline'
}

// หน้าต่างชำระเงินก่อนปิดโต๊ะ
const paymentDialogOpen = ref(false)
const checkoutTable = ref('')
const checkoutItems = ref([])
const checkoutSubtotal = ref(0)
const checkoutVat = ref(0)
const checkoutTotal = ref(0)

// เริ่มต้นกระบวนการชำระเงินและปิดบิล (เปิด PaymentDialog ให้เลือกวิธีจ่ายเงิน)
async function startCheckout(table) {
  busyTable.value = table
  try {
    const orders = await readOrders(table)
    const items = []
    let sub = 0
    for (const ord of (orders || [])) {
      for (const it of (ord.items || [])) {
        items.push(it)
        const optPrice = (it.toppings || []).reduce((acc, top) => acc + Number(top.price || 0), 0)
        sub += (Number(it.unitPrice || 0) + optPrice) * Number(it.qty || 1)
      }
    }
    const vat = Math.round(sub * 0.07)
    const tot = sub + vat

    checkoutTable.value = table
    checkoutItems.value = items
    checkoutSubtotal.value = sub
    checkoutVat.value = vat
    checkoutTotal.value = tot
    paymentDialogOpen.value = true
  } catch (e) {
    showSnack('ไม่สามารถดึงข้อมูลออเดอร์ของโต๊ะได้: ' + (e?.message || 'ลองใหม่อีกครั้ง'))
  } finally {
    busyTable.value = ''
  }
}

// เมื่อชำระเงินสำเร็จจาก PaymentDialog
async function onPaymentSuccess(result) {
  bill.value = result
  billOpen.value = true
  await load()
  showSnack(`ชำระเงินและปิดโต๊ะ ${result.table} สำเร็จแล้ว`)
}

// ปิดคำขอเรียกที่จัดการแล้ว
async function resolve(id) {
  busyCall.value = id
  try {
    await resolveStaffCall(id)
    await load()
  } catch (e) {
    showSnack(authDeniedMessage(e) || 'ปิดคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  } finally {
    busyCall.value = ''
  }
}

// เปลี่ยนสถานะอาหารที่ปรุงเสร็จเป็น เสิร์ฟแล้ว (COOKING -> SERVED)
async function serveItem(orderNo, lineId) {
  busyServe.value = orderNo + '-' + lineId
  try {
    await updateItemStatus(orderNo, lineId, 'SERVED')
    showSnack(`เสิร์ฟอาหารออเดอร์ #${orderNo} เรียบร้อยแล้ว`)
    await load()
  } catch (e) {
    showSnack(authDeniedMessage(e) || 'อัปเดตสถานะไม่สำเร็จ')
  } finally {
    busyServe.value = ''
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 960px">
    <div class="d-flex align-center flex-wrap ga-2 mb-1">
      <v-icon color="primary" class="me-1">mdi-account-tie</v-icon>
      <span class="text-h4 font-weight-bold">จอพนักงาน</span>
      <v-spacer />
      <v-btn v-if="!loading && !error" variant="text" prepend-icon="mdi-refresh" @click="refresh">รีเฟรช</v-btn>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-5">คำขอเรียกจากทุกโต๊ะ · สถานะโต๊ะ · ปิดบิล (เก็บเงิน)</p>

    <!-- ใครใช้งานจออยู่ · เข้ามาด้วยวิธีไหน · บทบาทอะไร + ปุ่มออกจากระบบ -->
    <IdentityBar />

    <!-- กำลังโหลด -->
    <div v-if="loading" class="text-center py-12 text-medium-emphasis">
      <v-progress-circular indeterminate color="primary" size="48" width="4" class="mb-3" />
      <div class="text-body-1">กำลังดึงข้อมูล...</div>
    </div>

    <!-- ผิดพลาด -->
    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
      title="ดึงข้อมูลไม่สำเร็จ"
      text="เกิดปัญหาระหว่างติดต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง"
      class="my-4"
    >
      <template #append>
        <v-btn color="error" variant="flat" @click="load">ลองใหม่</v-btn>
      </template>
    </v-alert>

    <template v-else>
      <!-- ── คำขอเรียกจากโต๊ะ ── -->
      <div class="d-flex align-center ga-2 mb-3">
        <v-icon>mdi-bell-ring-outline</v-icon>
        <span class="text-h6 font-weight-bold">คำขอเรียก</span>
        <v-chip v-if="calls.length" color="error" size="small">{{ calls.length }}</v-chip>
      </div>

      <div v-if="calls.length === 0" class="text-body-2 text-medium-emphasis mb-8">
        ไม่มีคำขอเรียกค้างอยู่
      </div>
      <v-row v-else dense class="mb-6">
        <v-col v-for="c in calls" :key="c.id" cols="12" sm="6">
          <v-card border class="pa-3 d-flex align-center ga-3">
            <v-avatar color="warning" variant="tonal" size="44">
              <v-icon>{{ callIcon[c.reason] || 'mdi-bell-ring-outline' }}</v-icon>
            </v-avatar>
            <div class="flex-grow-1" style="min-width:0">
              <div class="text-body-1 font-weight-medium">{{ c.reason }}</div>
              <div class="text-caption text-medium-emphasis">โต๊ะ {{ c.table }} · {{ thaiTime(c.at) }}</div>
            </div>
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-check"
              :loading="busyCall === c.id"
              :disabled="!!busyCall"
              @click="resolve(c.id)"
            >จัดการแล้ว</v-btn>
          </v-card>
        </v-col>
      </v-row>

      <!-- ── อาหารรอเสิร์ฟ (ครัวทำเสร็จแล้ว) ── -->
      <div class="d-flex align-center ga-2 mb-3">
        <v-icon color="secondary">mdi-tray-full</v-icon>
        <span class="text-h6 font-weight-bold">อาหารรอเสิร์ฟ</span>
        <v-chip v-if="servingQueue.length" color="info" size="small">{{ servingQueue.length }}</v-chip>
      </div>

      <div v-if="servingQueue.length === 0" class="text-body-2 text-medium-emphasis mb-8">
        ไม่มีรายการอาหารรอเสิร์ฟในขณะนี้
      </div>
      <v-row v-else dense class="mb-6">
        <v-col v-for="item in servingQueue" :key="item.orderNo + '-' + item.lineId" cols="12" sm="6">
          <v-card border class="pa-3">
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="text-subtitle-1 font-weight-bold">{{ item.name }}</span>
              <v-chip size="small" color="primary" variant="flat">โต๊ะ {{ item.table }}</v-chip>
            </div>
            <div class="text-caption text-medium-emphasis mb-2">
              ออเดอร์ #{{ item.orderNo }} · จำนวน {{ item.qty }}
              <span v-if="item.toppings && item.toppings.length">
                · {{ item.toppings.map(t => t.name).join(', ') }}
              </span>
              <span v-if="item.note" class="d-block text-secondary">หมายเหตุ: {{ item.note }}</span>
            </div>
            <div class="d-flex justify-end">
              <v-btn
                size="small"
                color="success"
                variant="flat"
                prepend-icon="mdi-check-all"
                :loading="busyServe === (item.orderNo + '-' + item.lineId)"
                :disabled="!!busyServe"
                @click="serveItem(item.orderNo, item.lineId)"
              >
                เสิร์ฟแล้ว
              </v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- ── ผังโต๊ะ + สถานะ ── -->
      <div class="d-flex align-center ga-2 mb-3">
        <v-icon>mdi-floor-plan</v-icon>
        <span class="text-h6 font-weight-bold">ผังโต๊ะ</span>
        <span class="text-caption text-medium-emphasis">ใช้งานอยู่ {{ occupiedCount }} / {{ tables.length }} โต๊ะ</span>
      </div>

      <!-- ยังไม่มีข้อมูลผังโต๊ะ — ข้อมูลตั้งต้นมาจากสคริปต์ฝั่ง server ไม่ใช่จากหน้าเว็บ -->
      <div v-if="tables.length === 0" class="text-body-2 text-medium-emphasis">
        ยังไม่มีข้อมูลผังโต๊ะ — รันคำสั่ง npm run seed:base เพื่อสร้างข้อมูลตั้งต้นของร้าน
      </div>

      <v-row v-else dense>
        <v-col v-for="t in tables" :key="t.id" cols="6" sm="4" md="3">
          <v-card border class="pa-3 text-center">
            <div class="text-h6 font-weight-bold">{{ t.id }}</div>
            <v-chip
              :color="tableStatusMeta[t.status].color"
              :prepend-icon="tableStatusMeta[t.status].icon"
              size="small"
              variant="tonal"
              class="my-2"
            >
              {{ t.status }}
            </v-chip>
            <v-btn
              v-if="t.status === TableStatus.OCCUPIED"
              block
              size="small"
              prepend-icon="mdi-cash-register"
              :loading="busyTable === t.id"
              :disabled="!!busyTable"
              @click="startCheckout(t.id)"
            >ปิดบิล</v-btn>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- ใบเสร็จหลังปิดบิล (ยอดจาก server + วิธีชำระเงิน) -->
    <v-dialog v-model="billOpen" max-width="440">
      <v-card v-if="bill">
        <v-card-title class="d-flex align-center ga-2 bg-success text-white py-3">
          <v-icon>mdi-check-circle</v-icon>
          <span class="text-h6 font-weight-bold">ปิดบิล & ชำระเงินสำเร็จ</span>
        </v-card-title>
        <v-card-text class="pt-4">
          <div class="d-flex justify-space-between text-body-2 mb-1"><span>บิลเลขที่</span><span>#{{ bill.billNo }}</span></div>
          <div class="d-flex justify-space-between text-body-2 mb-3"><span>โต๊ะ</span><span>{{ bill.table }}</span></div>
          <v-divider class="mb-2" />
          <div class="d-flex justify-space-between text-body-2"><span>ราคารวม</span><span>฿{{ (bill.subtotal || 0).toLocaleString() }}</span></div>
          <div class="d-flex justify-space-between text-body-2 mb-1"><span>VAT 7%</span><span>฿{{ (bill.vat || 0).toLocaleString() }}</span></div>
          <div class="d-flex justify-space-between align-center mb-2">
            <span class="text-body-1 font-weight-bold">ยอดสุทธิ</span>
            <span class="text-h6 text-primary font-weight-bold">฿{{ (bill.total || 0).toLocaleString() }}</span>
          </div>
          <v-divider class="mb-2" />
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span>ช่องทางชำระ</span>
            <span class="font-weight-medium text-primary">{{ bill.methodSummary || 'เงินสด' }}</span>
          </div>
          <template v-if="bill.cashReceived > 0">
            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span>รับเงินสดมา</span>
              <span>฿{{ (bill.cashReceived || 0).toLocaleString() }}</span>
            </div>
            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span>เงินทอน</span>
              <span class="font-weight-bold text-success">฿{{ (bill.change || 0).toLocaleString() }}</span>
            </div>
          </template>
          <p class="text-caption text-medium-emphasis mt-3 text-center">โต๊ะ {{ bill.table }} กลับเป็น "ว่าง" พร้อมรับลูกค้าใหม่แล้ว</p>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="billOpen = false">เรียบร้อย</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Popup ชำระเงิน (Payment Modal) -->
    <PaymentDialog
      v-model="paymentDialogOpen"
      :table="checkoutTable"
      :items="checkoutItems"
      :subtotal="checkoutSubtotal"
      :vat="checkoutVat"
      :total="checkoutTotal"
      @success="onPaymentSuccess"
    />

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
