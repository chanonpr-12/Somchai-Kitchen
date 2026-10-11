<script setup>
import { ref, computed, watch } from 'vue'
import { checkout as apiCheckout } from '../api/ops'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  table: { type: [String, Number], default: '' },
  items: { type: Array, default: () => [] },
  subtotal: { type: Number, default: 0 },
  vat: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
})

const emit = defineEmits(['update:modelValue', 'success'])

// รูปแบบการชำระเงิน: 'CASH' (เงินสด) | 'TRANSFER' (โอน/QR) | 'SPLIT' (ทั้งคู่/ผสม) | 'CREDIT' (บัตรเครดิต)
const method = ref('CASH')

// เงินสด
const cashReceived = ref(0)

// โอน / QR
const transferRef = ref('')

// ทั้งคู่ / ผสม (Split)
const splitCash = ref(0)
const splitTransfer = ref(0)
const splitCashReceived = ref(0)

// สถานะการบันทึก
const submitting = ref(false)
const errorMsg = ref('')

// กำหนดค่าเริ่มต้นเมื่อเปิด popup
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      errorMsg.value = ''
      method.value = 'CASH'
      cashReceived.value = props.total
      // แบ่งจ่ายเริ่มต้น: สดครึ่งหนึ่ง โอนครึ่งหนึ่ง
      const half = Math.floor(props.total / 2)
      splitCash.value = half
      splitTransfer.value = props.total - half
      splitCashReceived.value = half
      transferRef.value = 'TXN-' + Math.floor(100000 + Math.random() * 900000)
    }
  }
)

// คำนวณเงินทอน (กรณีเงินสด)
const cashChange = computed(() => {
  const diff = Number(cashReceived.value || 0) - props.total
  return diff >= 0 ? diff : 0
})

const isCashEnough = computed(() => {
  return Number(cashReceived.value || 0) >= props.total
})

// คำนวณยอด Split
const splitTotal = computed(() => {
  return Number(splitCash.value || 0) + Number(splitTransfer.value || 0)
})

const splitDiff = computed(() => {
  return props.total - splitTotal.value
})

const splitChange = computed(() => {
  const diff = Number(splitCashReceived.value || 0) - Number(splitCash.value || 0)
  return diff >= 0 ? diff : 0
})

// ปรับยอด Split อัตโนมัติ
function balanceSplit(target) {
  if (target === 'transfer') {
    splitTransfer.value = Math.max(0, props.total - Number(splitCash.value || 0))
  } else {
    splitCash.value = Math.max(0, props.total - Number(splitTransfer.value || 0))
    splitCashReceived.value = splitCash.value
  }
}

// ปุ่มลัดเงินสด
function setExactCash() {
  cashReceived.value = props.total
}
function addCash(amount) {
  cashReceived.value = (Number(cashReceived.value) || 0) + amount
}
function setRoundBanknote(denom) {
  const t = props.total
  cashReceived.value = Math.ceil(t / denom) * denom || denom
}

// ตรวจสอบความถูกต้องก่อนกดชำระ
const canSubmit = computed(() => {
  if (props.total <= 0) return true
  if (method.value === 'CASH') {
    return isCashEnough.value
  }
  if (method.value === 'TRANSFER') {
    return true
  }
  if (method.value === 'SPLIT') {
    return (
      splitTotal.value === props.total &&
      Number(splitCash.value) > 0 &&
      Number(splitTransfer.value) > 0 &&
      Number(splitCashReceived.value || 0) >= Number(splitCash.value)
    )
  }
  return false
})

async function confirmPayment() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  errorMsg.value = ''

  try {
    let paymentDetailsInput = []
    let methodSummary = ''
    let returnCashReceived = 0
    let returnChange = 0

    if (method.value === 'CASH') {
      paymentDetailsInput = [{ payment_type_id: 1, amount: props.total }]
      methodSummary = 'เงินสด'
      returnCashReceived = Number(cashReceived.value)
      returnChange = cashChange.value
    } else if (method.value === 'TRANSFER') {
      paymentDetailsInput = [{ payment_type_id: 2, amount: props.total }]
      methodSummary = 'โอน / สแกน QR'
      returnCashReceived = props.total
      returnChange = 0
    } else if (method.value === 'SPLIT') {
      paymentDetailsInput = [
        { payment_type_id: 1, amount: Number(splitCash.value) },
        { payment_type_id: 2, amount: Number(splitTransfer.value) }
      ]
      methodSummary = `เงินสด ${Number(splitCash.value).toLocaleString()} บ. + โอน ${Number(splitTransfer.value).toLocaleString()} บ.`
      returnCashReceived = Number(splitCashReceived.value)
      returnChange = splitChange.value
    }

    const res = await apiCheckout(props.table, paymentDetailsInput)

    emit('success', {
      ...res,
      cashReceived: returnCashReceived,
      change: returnChange,
      methodSummary: methodSummary,
      methodType: method.value
    })
    emit('update:modelValue', false)
  } catch (err) {
    errorMsg.value = err.message || 'บันทึกการชำระเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
  } finally {
    submitting.value = false
  }
}

function close() {
  if (!submitting.value) {
    emit('update:modelValue', false)
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="close"
    max-width="540"
    persistent
    scrollable
  >
    <v-card class="rounded-lg">
      <!-- ส่วนหัว Header -->
      <v-card-title class="pa-4 bg-primary text-white d-flex align-center justify-space-between">
        <div class="d-flex align-center ga-2">
          <v-icon>mdi-cash-register</v-icon>
          <span class="text-h6 font-weight-bold">ชำระเงิน & ปิดบิล โต๊ะ {{ table }}</span>
        </div>
        <v-btn icon="mdi-close" variant="text" density="comfortable" :disabled="submitting" @click="close" />
      </v-card-title>

      <v-card-text class="pa-4">
        <!-- ยอดรวมที่ต้องชำระ -->
        <v-card variant="tonal" color="primary" class="pa-4 mb-4 text-center">
          <div class="text-caption text-medium-emphasis mb-1">ยอดชำระสุทธิ (รวม VAT 7%)</div>
          <div class="text-h4 font-weight-black text-primary">
            ฿{{ total.toLocaleString() }}
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            ค่าอาหาร ฿{{ subtotal.toLocaleString() }} · VAT 7% ฿{{ vat.toLocaleString() }}
          </div>
        </v-card>

        <!-- สรุปรายการอาหาร (Accordion พับได้) -->
        <v-expansion-panels class="mb-4" density="compact" variant="accordion">
          <v-expansion-panel elevation="0" border>
            <v-expansion-panel-title class="text-body-2 font-weight-medium">
              <v-icon start size="small">mdi-receipt-text-outline</v-icon>
              ดูรายการอาหาร ({{ items.length }} รายการ)
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div
                v-for="(it, i) in items"
                :key="i"
                class="d-flex justify-space-between text-caption py-1 border-bottom"
              >
                <span>{{ it.name }} × {{ it.qty }}</span>
                <span class="font-weight-medium">฿{{ ((it.unitPrice || 0) * (it.qty || 1)).toLocaleString() }}</span>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <!-- วิธีชำระเงิน (Tabs / Buttons) -->
        <div class="text-subtitle-2 font-weight-bold mb-2">
          เลือกช่องทางการชำระเงิน
        </div>
        <v-btn-toggle
          v-model="method"
          mandatory
          divided
          color="primary"
          variant="outlined"
          class="w-100 mb-4"
          density="comfortable"
        >
          <v-btn value="CASH" class="flex-1-1">
            <v-icon start>mdi-cash</v-icon>เงินสด
          </v-btn>
          <v-btn value="TRANSFER" class="flex-1-1">
            <v-icon start>mdi-qrcode-scan</v-icon>โอน / QR
          </v-btn>
          <v-btn value="SPLIT" class="flex-1-1">
            <v-icon start>mdi-call-split</v-icon>ทั้งคู่ (สด+โอน)
          </v-btn>
        </v-btn-toggle>

        <!-- ══════════════ 1. ชำระด้วย เงินสด ══════════════ -->
        <div v-if="method === 'CASH'" class="pa-3 border rounded-lg bg-surface">
          <div class="text-body-2 font-weight-bold mb-2 d-flex align-center">
            <v-icon color="success" class="me-1">mdi-cash-multiple</v-icon>
            รับเงินสด
          </div>

          <v-text-field
            v-model.number="cashReceived"
            label="รับเงินมา (บาท)"
            type="number"
            density="comfortable"
            variant="outlined"
            prefix="฿"
            hide-details="auto"
            class="mb-3"
            :error="!isCashEnough"
            :error-messages="!isCashEnough ? `เงินสดไม่พอ ขาดอีก ฿${(total - (cashReceived || 0)).toLocaleString()}` : ''"
          />

          <!-- ปุ่มลัดเลือกจำนวนเงิน -->
          <div class="d-flex flex-wrap ga-2 mb-3">
            <v-btn size="x-small" variant="tonal" @click="setExactCash">พอดี (฿{{ total }})</v-btn>
            <v-btn size="x-small" variant="tonal" @click="setRoundBanknote(100)">แบงก์ 100</v-btn>
            <v-btn size="x-small" variant="tonal" @click="setRoundBanknote(500)">แบงก์ 500</v-btn>
            <v-btn size="x-small" variant="tonal" @click="setRoundBanknote(1000)">แบงก์ 1,000</v-btn>
            <v-btn size="x-small" variant="tonal" color="primary" @click="addCash(20)">+20</v-btn>
            <v-btn size="x-small" variant="tonal" color="primary" @click="addCash(50)">+50</v-btn>
            <v-btn size="x-small" variant="tonal" color="primary" @click="addCash(100)">+100</v-btn>
          </div>

          <!-- กล่องแสดงเงินทอน -->
          <v-card variant="flat" color="surface-variant" class="pa-3 text-center rounded-lg">
            <div class="text-caption text-medium-emphasis">เงินทอนที่ต้องคืนลูกค้า</div>
            <div class="text-h5 font-weight-bold" :class="cashChange > 0 ? 'text-success' : 'text-primary'">
              ฿{{ cashChange.toLocaleString() }}
            </div>
          </v-card>
        </div>

        <!-- ══════════════ 2. ชำระด้วย โอน / สแกน QR ══════════════ -->
        <div v-else-if="method === 'TRANSFER'" class="pa-4 border rounded-lg bg-surface text-center">
          <div class="text-body-2 font-weight-bold mb-3 d-flex align-center justify-center">
            <v-icon color="info" class="me-1">mdi-qrcode</v-icon>
            สแกน QR พร้อมเพย์ / โอนเงิน
          </div>

          <!-- Mock PromptPay QR Visual -->
          <v-card border variant="flat" class="pa-3 d-inline-block mx-auto mb-3 bg-white" max-width="200">
            <div class="bg-primary-darken-1 text-white text-caption font-weight-bold py-1 px-3 rounded-t mb-2">
              PromptPay พร้อมเพย์
            </div>
            <v-icon size="130" color="grey-darken-3">mdi-qrcode</v-icon>
            <div class="text-caption text-grey-darken-1 mt-1 font-weight-medium">
              สมชายคิทเช่น (พร้อมเพย์)
            </div>
          </v-card>

          <div class="text-body-1 font-weight-bold text-primary mb-1">
            ยอดโอน: ฿{{ total.toLocaleString() }}
          </div>
          <div class="text-caption text-medium-emphasis">
            อ้างอิง: {{ transferRef }} · ให้ลูกค้าสแกน QR จากแอปพลิเคชันธนาคาร
          </div>
        </div>

        <!-- ══════════════ 3. ชำระด้วย ทั้งคู่ (Split: สด + โอน) ══════════════ -->
        <div v-else-if="method === 'SPLIT'" class="pa-3 border rounded-lg bg-surface">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-body-2 font-weight-bold d-flex align-center">
              <v-icon color="secondary" class="me-1">mdi-call-split</v-icon>
              แบ่งจ่าย (เงินสด + โอน)
            </span>
            <v-chip
              size="x-small"
              :color="splitDiff === 0 ? 'success' : 'warning'"
              variant="flat"
            >
              {{ splitDiff === 0 ? '✓ ยอดรวมตรงพอดี' : `ส่วนต่าง: ฿${Math.abs(splitDiff).toLocaleString()}` }}
            </v-chip>
          </div>

          <v-row dense class="mb-2">
            <v-col cols="6">
              <v-text-field
                v-model.number="splitCash"
                label="ยอดจ่ายเงินสด (฿)"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
                @input="splitCashReceived = splitCash"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model.number="splitTransfer"
                label="ยอดโอน / QR (฿)"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
          </v-row>

          <!-- ปุ่มช่วยปรับสมดุล -->
          <div class="d-flex ga-2 mb-3">
            <v-btn
              size="x-small"
              variant="tonal"
              color="primary"
              @click="balanceSplit('transfer')"
            >
              ใส่ส่วนที่เหลือในยอดโอน
            </v-btn>
            <v-btn
              size="x-small"
              variant="tonal"
              color="secondary"
              @click="balanceSplit('cash')"
            >
              ใส่ส่วนที่เหลือในเงินสด
            </v-btn>
          </div>

          <!-- ช่องรับเงินสดสำหรับส่วนเงินสด (เพื่อคำนวณเงินทอน) -->
          <div class="pa-2 bg-surface-variant rounded">
            <div class="d-flex align-center justify-space-between mb-1">
              <span class="text-caption">รับเงินสดมา (สำหรับส่วนเงินสด):</span>
              <span class="text-caption font-weight-bold text-success">
                เงินทอน: ฿{{ splitChange.toLocaleString() }}
              </span>
            </div>
            <v-text-field
              v-model.number="splitCashReceived"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              prefix="฿"
            />
          </div>

          <!-- PromptPay QR Code สำหรับสแกนส่วนยอดโอน (เฉพาะเมื่อมียอดโอน > 0) -->
          <v-card
            v-if="splitTransfer > 0"
            border
            variant="flat"
            class="pa-3 my-3 text-center bg-white rounded-lg"
          >
            <div class="bg-primary text-white text-caption font-weight-bold py-1 px-3 rounded-t mb-2 d-inline-block">
              PromptPay พร้อมเพย์ (ส่วนยอดโอน)
            </div>
            <div class="my-1">
              <v-icon size="110" color="grey-darken-3">mdi-qrcode</v-icon>
            </div>
            <div class="text-subtitle-1 font-weight-bold text-primary">
              สแกนจ่ายยอดโอน: ฿{{ Number(splitTransfer).toLocaleString() }}
            </div>
            <div class="text-caption text-medium-emphasis">
              อ้างอิง: {{ transferRef }} · ให้ลูกค้าสแกนจ่ายผ่านแอปธนาคาร
            </div>
          </v-card>

          <div v-if="splitDiff !== 0" class="text-caption text-error mt-2">
            * ยอดรวมเงินสด + โอน ต้องเท่ากับ ฿{{ total.toLocaleString() }} พอดี (ปัจจุบันได้ ฿{{ splitTotal.toLocaleString() }})
          </div>
        </div>

        <!-- แจ้งเตือนข้อผิดพลาดถ้ามี -->
        <v-alert
          v-if="errorMsg"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3 text-caption"
        >
          {{ errorMsg }}
        </v-alert>
      </v-card-text>

      <v-divider />

      <!-- ปุ่มดำเนินการ -->
      <v-card-actions class="pa-4 bg-surface-variant d-flex justify-space-between">
        <v-btn variant="text" :disabled="submitting" @click="close">
          ยกเลิก
        </v-btn>
        <v-btn
          color="success"
          variant="flat"
          size="large"
          prepend-icon="mdi-check-circle"
          :loading="submitting"
          :disabled="!canSubmit || submitting"
          @click="confirmPayment"
        >
          ยืนยันชำระเงิน (฿{{ total.toLocaleString() }})
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.border-bottom {
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
}
</style>
