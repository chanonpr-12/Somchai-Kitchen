<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOrderStore } from '../stores/order'
import StaffDialog from '../components/StaffDialog.vue'
import { authDeniedMessage } from '../auth' // ★ สัปดาห์ที่ 9 — แยกการถูกปฏิเสธเรื่องสิทธิ์ออกจากความล้มเหลวทั่วไป

const order = useOrderStore()
const router = useRouter()
const route = useRoute()

const snackbar = ref(false)
const snackText = ref('')
const staffOpen = ref(false)
const sending = ref(false) // กำลังส่งออเดอร์ผ่านชั้น API (รอเซิร์ฟเวอร์ตอบ) — ใช้ทำปุ่มขึ้นสถานะกำลังโหลด

function showSnack(text) {
  snackText.value = text
  snackbar.value = true
}

// สรุปตัวเลือกของรายการเป็นข้อความสั้น ๆ
function optionText(item) {
  const parts = []
  if (item.spice) parts.push(item.spice)
  if (item.sweet) parts.push(item.sweet)
  if (item.toppings && item.toppings.length) parts.push('+ ' + item.toppings.map((t) => t.name).join(', '))
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

// ส่งเข้าครัว: ต้องเลือกโต๊ะก่อน และตะกร้าต้องไม่ว่าง
// หมายเหตุ: การตรวจฝั่งหน้าเว็บนี้เพื่อความสะดวก — ของจริงเซิร์ฟเวอร์ต้องตรวจซ้ำ (สัปดาห์ที่ 6)
// ตอนนี้ส่ง "ผ่านชั้น API" (async) จึงต้อง await + รองรับกรณีล้มเหลว (ARCHITECTURE.md §4.1, §5)
async function sendKitchen() {
  if (!order.table) {
    showSnack('กรุณาเลือกโต๊ะก่อนส่งอาหาร')
    return
  }
  sending.value = true
  try {
    const o = await order.sendToKitchen(route.query.failorder === '1')
    if (o) {
      showSnack('ส่งออเดอร์ #' + o.no + ' เข้าครัวแล้ว')
      router.push('/orders')
    }
  } catch (e) {
    showSnack(authDeniedMessage(e) || 'ส่งออเดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <div class="text-h4 font-weight-bold mb-4">ตะกร้าของคุณ</div>

    <!-- สถานะว่าง: ไอคอน + ข้อความ + ทางออก (§8.1) -->
    <div v-if="order.cart.length === 0" class="text-center py-12 text-medium-emphasis">
      <v-icon size="56" class="mb-2">mdi-cart-outline</v-icon>
      <div class="text-body-1 mb-4">ยังไม่มีอาหารในตะกร้า</div>
      <v-btn to="/menu" prepend-icon="mdi-silverware-fork-knife">ไปเลือกเมนู</v-btn>
    </div>

    <template v-else>
      <!-- รายการในตะกร้า: แต่ละแถวจัดเป็นระบบ ปรับตามจอ · แสดงตัวเลือกใต้ชื่อ -->
      <v-card
        v-for="item in order.cart"
        :key="item.lineId"
        variant="flat"
        border
        class="mb-2 pa-3"
      >
        <div class="d-flex align-center ga-3">
          <v-avatar rounded="lg" size="56">
            <v-img :src="item.img" :alt="item.name" cover />
          </v-avatar>
          <div class="flex-grow-1" style="min-width:0">
            <div class="text-body-1 font-weight-medium">{{ item.name }}</div>
            <div v-if="optionText(item)" class="text-caption text-medium-emphasis">{{ optionText(item) }}</div>
            <div v-if="item.note" class="text-caption text-secondary">หมายเหตุ: {{ item.note }}</div>
            <div class="text-caption text-medium-emphasis">{{ item.unitPrice }} บาท / จาน</div>
          </div>
          <div class="text-body-1 text-primary font-weight-bold text-right" style="min-width:88px">
            {{ item.unitPrice * item.qty }} บาท
          </div>
        </div>

        <div class="d-flex align-center ga-2 mt-2">
          <v-btn icon="mdi-minus" size="x-small" variant="tonal" aria-label="ลดจำนวน"
                 @click="order.decrease(item.lineId)" />
          <span class="text-body-1" style="min-width:2em;text-align:center">{{ item.qty }}</span>
          <v-btn icon="mdi-plus" size="x-small" variant="tonal" aria-label="เพิ่มจำนวน"
                 @click="order.increase(item.lineId)" />
          <v-spacer />
          <v-btn size="small" variant="text" color="error" prepend-icon="mdi-delete-outline"
                 @click="order.removeLine(item.lineId)">ลบ</v-btn>
        </div>
      </v-card>

      <!-- สรุปยอด: ยอดสุทธิเป็นจุดเด่น (ขนาด+สี) -->
      <v-card class="mt-4 pa-4" border>
        <div class="d-flex justify-space-between text-body-2 mb-1">
          <span>ราคารวม</span><span>{{ order.subtotal }} บาท</span>
        </div>
        <div class="d-flex justify-space-between text-body-2 mb-2">
          <span>VAT 7%</span><span>{{ order.vat }} บาท</span>
        </div>
        <v-divider class="mb-2" />
        <div class="d-flex justify-space-between align-center">
          <span class="text-body-1">ยอดสุทธิ</span>
          <span class="text-h6 text-primary font-weight-bold">{{ order.grandTotal }} บาท</span>
        </div>
      </v-card>

      <!-- ปุ่มการกระทำ: ปุ่มหลัก (ส่งครัว) เด่นสุด · เรียงลงบนมือถือ -->
      <div class="d-flex flex-column flex-sm-row ga-3 mt-4">
        <v-btn variant="tonal" prepend-icon="mdi-bell-outline" @click="staffOpen = true">
          เรียกพนักงาน
        </v-btn>
        <v-spacer class="d-none d-sm-block" />
        <v-btn :loading="sending" prepend-icon="mdi-send" @click="sendKitchen">ส่งอาหารเข้าครัว</v-btn>
      </div>
    </template>

    <!-- หน้าต่างเรียกพนักงาน (คำขอถูกส่งไปที่จอพนักงานผ่าน server) -->
    <StaffDialog v-model="staffOpen" @call="onStaffCall" />

    <!-- แจ้งเตือน (toast) -->
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
