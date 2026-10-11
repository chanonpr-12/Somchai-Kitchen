<script setup>
// หน้าต่างเช็คบิล + แยกบิล — คิดจากทุกออเดอร์ที่สั่งทั้งมื้อ (billLines ใน store)
// จัดเป็นระบบ: ยอดสุทธิเป็นจุดเด่น · เลือกวิธีแยกบิล (หารเท่ากัน/แยกตามรายการ) · จำนวนคนตรวจด้วย :rules
import { ref, computed, watch } from 'vue'
import { useOrderStore } from '../stores/order'
import { VAT_RATE } from '../constant' // ★ อัตรา VAT ค่ากลาง (convention 2.3) ไม่ฝัง 0.07
import PaymentDialog from './PaymentDialog.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const order = useOrderStore()
const paymentOpen = ref(false)
const receiptOpen = ref(false)
const receipt = ref(null)

async function onPaymentSuccess(res) {
  receipt.value = res
  receiptOpen.value = true
  emit('update:modelValue', false)
  await order.loadOrders(order.table)
}

const mode = ref('equal')     // 'equal' = หารเท่ากัน · 'byitem' = แยกตามรายการ
const people = ref(2)
const assign = ref({})        // lineKey -> เลขคน (1..people)
const issuedAt = ref('')

function lineKey(l) {
  return l.orderNo + '-' + l.lineId
}

// แปลงเวลาเป็นรูปแบบไทย (ปีพุทธ) ให้ระบบทำเอง ไม่บวก +543 (skill §3.4)
function thaiDateTime(d) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(d)
}

// จำนวนคนต้องเป็นจำนวนเต็ม 1–20 — ข้อความบอกวิธีแก้
const peopleRules = [
  (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 20) || 'จำนวนคนต้องเป็นตัวเลข 1–20'
]

// ตั้งค่าเริ่มต้นเมื่อเปิดหน้าต่าง
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      mode.value = 'equal'
      people.value = 2
      const a = {}
      order.billLines.forEach((l) => { a[lineKey(l)] = 1 })
      assign.value = a
      issuedAt.value = thaiDateTime(new Date())
    }
  }
)

// แบ่งยอดรวมให้ N คนแบบจำนวนเต็ม (เศษบาทกระจายให้คนแรก ๆ)
function equalShares(total, n) {
  if (n < 1) return []
  const base = Math.floor(total / n)
  const rem = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}

const peopleN = computed(() => Math.max(1, Math.min(20, Math.floor(Number(people.value) || 1))))
const shares = computed(() => equalShares(order.billTotal, peopleN.value))

// แยกตามรายการ: รวมยอดของแต่ละคนตามที่ระบุ + VAT ต่อคน
const byItemTotals = computed(() => {
  const n = peopleN.value
  const subtotals = Array.from({ length: n }, () => 0)
  order.billLines.forEach((l) => {
    const p = (assign.value[lineKey(l)] || 1) - 1
    if (p >= 0 && p < n) subtotals[p] += l.unitPrice * l.qty
  })
  return subtotals.map((sub) => {
    const vat = Math.round(sub * VAT_RATE)
    return { sub, vat, total: sub + vat }
  })
})

const peopleOptions = computed(() => Array.from({ length: peopleN.value }, (_, i) => i + 1))

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="560"
    scrollable
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <span class="text-h6 font-weight-bold">บิล · โต๊ะ {{ order.table || '-' }}</span>
      </v-card-title>

      <v-card-text>
        <!-- ยังไม่มีออเดอร์ -->
        <div v-if="!order.hasOrders" class="text-center py-8 text-medium-emphasis">
          <v-icon size="48" class="mb-2">mdi-receipt-text-outline</v-icon>
          <div class="text-body-1">ยังไม่มีออเดอร์ที่สั่ง</div>
          <div class="text-caption">เลือกเมนูและส่งเข้าครัวก่อน จึงจะเช็คบิลได้</div>
        </div>

        <template v-else>
          <div class="text-caption text-medium-emphasis mb-2">ออกบิลเมื่อ {{ issuedAt }}</div>

          <!-- รายการทั้งหมดในบิล -->
          <div
            v-for="l in order.billLines"
            :key="l.orderNo + '-' + l.lineId"
            class="d-flex justify-space-between text-body-2 mb-1"
          >
            <span class="me-2" style="min-width:0">
              {{ l.name }} × {{ l.qty }}
              <span v-if="l.toppings && l.toppings.length" class="text-medium-emphasis">
                (+{{ l.toppings.map(t => t.name).join(', ') }})
              </span>
            </span>
            <span class="text-no-wrap">{{ l.unitPrice * l.qty }} บาท</span>
          </div>

          <v-divider class="my-2" />
          <div class="d-flex justify-space-between text-body-2"><span>ราคารวม</span><span>{{ order.billSubtotal }} บาท</span></div>
          <div class="d-flex justify-space-between text-body-2 mb-1"><span>VAT 7%</span><span>{{ order.billVat }} บาท</span></div>
          <div class="d-flex justify-space-between align-center">
            <span class="text-body-1">ยอดสุทธิ</span>
            <span class="text-h6 text-primary font-weight-bold">{{ order.billTotal }} บาท</span>
          </div>

          <!-- เลือกวิธีแยกบิล -->
          <div class="text-subtitle-2 mt-5 mb-2">แยกบิล</div>
          <div class="d-flex flex-column flex-sm-row ga-3 align-sm-center">
            <v-btn-toggle v-model="mode" mandatory density="comfortable" color="primary" variant="outlined">
              <v-btn value="equal" prepend-icon="mdi-account-group">หารเท่ากัน</v-btn>
              <v-btn value="byitem" prepend-icon="mdi-format-list-checks">แยกตามรายการ</v-btn>
            </v-btn-toggle>
            <v-text-field
              v-model.number="people"
              label="จำนวนคน"
              type="number"
              :rules="peopleRules"
              min="1"
              max="20"
              density="comfortable"
              hide-details="auto"
              style="max-width:140px"
            />
          </div>

          <!-- หารเท่ากัน: ยอดต่อคน -->
          <v-row v-if="mode === 'equal'" dense class="mt-2">
            <v-col v-for="(s, i) in shares" :key="i" cols="6" sm="4">
              <v-card variant="tonal" class="pa-3 text-center" color="primary">
                <div class="text-caption">คนที่ {{ i + 1 }}</div>
                <div class="text-h6 font-weight-bold">{{ s }} บาท</div>
              </v-card>
            </v-col>
          </v-row>

          <!-- แยกตามรายการ: เลือกว่ารายการไหนเป็นของใคร -->
          <template v-else>
            <div
              v-for="l in order.billLines"
              :key="'a-' + l.orderNo + '-' + l.lineId"
              class="d-flex align-center ga-2 mt-2"
            >
              <span class="text-body-2 flex-grow-1" style="min-width:0">
                {{ l.name }} × {{ l.qty }}
                <span class="text-medium-emphasis text-no-wrap">({{ l.unitPrice * l.qty }} บาท)</span>
              </span>
              <v-select
                v-model="assign[l.orderNo + '-' + l.lineId]"
                :items="peopleOptions"
                density="compact"
                hide-details
                style="max-width:130px"
                :label="'คน'"
              >
                <template #selection="{ item }">คนที่ {{ item.value }}</template>
                <template #item="{ props: itemProps, item }">
                  <v-list-item v-bind="itemProps" :title="'คนที่ ' + item.value" />
                </template>
              </v-select>
            </div>

            <v-row dense class="mt-3">
              <v-col v-for="(t, i) in byItemTotals" :key="'t-' + i" cols="12" sm="6">
                <v-card variant="tonal" class="pa-3" color="primary">
                  <div class="d-flex justify-space-between">
                    <span class="text-body-2">คนที่ {{ i + 1 }}</span>
                    <span class="text-h6 font-weight-bold">{{ t.total }} บาท</span>
                  </div>
                  <div class="text-caption text-medium-emphasis">รวม VAT {{ t.vat }} บาท</div>
                </v-card>
              </v-col>
            </v-row>
          </template>
        </template>
      </v-card-text>

      <v-divider />
      <v-card-actions class="px-4 py-3 d-flex justify-space-between">
        <v-btn variant="text" @click="close">ปิด</v-btn>
        <v-btn
          v-if="order.hasOrders"
          color="success"
          variant="flat"
          prepend-icon="mdi-cash-register"
          @click="paymentOpen = true"
        >
          ชำระเงิน
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Popup ชำระเงินสำหรับลูกค้า -->
  <PaymentDialog
    v-model="paymentOpen"
    :table="order.table"
    :items="order.billLines"
    :subtotal="order.billSubtotal"
    :vat="order.billVat"
    :total="order.billTotal"
    @success="onPaymentSuccess"
  />

  <!-- ใบเสร็จหลังลูกค้าชำระเงินสำเร็จ -->
  <v-dialog v-model="receiptOpen" max-width="440">
    <v-card v-if="receipt">
      <v-card-title class="d-flex align-center ga-2 bg-success text-white py-3">
        <v-icon>mdi-check-circle</v-icon>
        <span class="text-h6 font-weight-bold">ชำระเงินสำเร็จ</span>
      </v-card-title>
      <v-card-text class="pt-4">
        <div class="d-flex justify-space-between text-body-2 mb-1"><span>บิลเลขที่</span><span>#{{ receipt.billNo }}</span></div>
        <div class="d-flex justify-space-between text-body-2 mb-3"><span>โต๊ะ</span><span>{{ receipt.table }}</span></div>
        <v-divider class="mb-2" />
        <div class="d-flex justify-space-between text-body-2"><span>ราคารวม</span><span>฿{{ (receipt.subtotal || 0).toLocaleString() }}</span></div>
        <div class="d-flex justify-space-between text-body-2 mb-1"><span>VAT 7%</span><span>฿{{ (receipt.vat || 0).toLocaleString() }}</span></div>
        <div class="d-flex justify-space-between align-center mb-2">
          <span class="text-body-1 font-weight-bold">ยอดสุทธิ</span>
          <span class="text-h6 text-primary font-weight-bold">฿{{ (receipt.total || 0).toLocaleString() }}</span>
        </div>
        <v-divider class="mb-2" />
        <div class="d-flex justify-space-between text-body-2 mb-1">
          <span>วิธีชำระ</span>
          <span class="font-weight-medium text-primary">{{ receipt.methodSummary || 'เงินสด' }}</span>
        </div>
        <template v-if="receipt.cashReceived > 0">
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span>รับเงินสดมา</span>
            <span>฿{{ (receipt.cashReceived || 0).toLocaleString() }}</span>
          </div>
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span>เงินทอน</span>
            <span class="font-weight-bold text-success">฿{{ (receipt.change || 0).toLocaleString() }}</span>
          </div>
        </template>
        <p class="text-caption text-medium-emphasis mt-3 text-center">ขอบคุณที่ใช้บริการสมชายคิทเช่น!</p>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn color="primary" variant="flat" to="/" @click="receiptOpen = false; order.clearTable()">กลับหน้าหลัก</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
