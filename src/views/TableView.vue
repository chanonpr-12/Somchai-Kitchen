<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useOrderStore } from '../stores/order'
import { readTables, occupyTable } from '../db'

const router = useRouter()
const order = useOrderStore()

// รายชื่อโต๊ะพร้อมสถานะ (อ่านจากฐานข้อมูลจริง หรือ fallback เป็น 1-8)
const tables = ref([
  { no: '1', status: 'AVAILABLE' },
  { no: '2', status: 'AVAILABLE' },
  { no: '3', status: 'AVAILABLE' },
  { no: '4', status: 'AVAILABLE' },
  { no: '5', status: 'AVAILABLE' },
  { no: '6', status: 'AVAILABLE' },
  { no: '7', status: 'AVAILABLE' },
  { no: '8', status: 'AVAILABLE' }
])
const picked = ref(null)
const confirming = ref(false)

// State สำหรับ Popup แจ้งเตือนเมื่อโต๊ะมีคนอยู่แล้ว
const occupiedDialog = ref(false)
const occupiedTableNum = ref('')

async function loadTables() {
  try {
    const list = await readTables()
    if (list && list.length > 0) {
      tables.value = list.map((t) => ({
        no: t.table_num || String(t.no),
        status: t.status || 'AVAILABLE'
      }))
    }
  } catch (e) {
    console.warn('Could not load tables from database:', e)
  }
}

onMounted(() => {
  loadTables()
  picked.value = null
})

// เมื่อคลิกเลือกโต๊ะใด ๆ (กดเลือกได้ แต่ถ้ามีคนอยู่แล้วจะขึ้น popup)
async function handlePickTable(t) {
  await loadTables()
  const fresh = tables.value.find((item) => item.no === t.no) || t
  if (fresh.status === 'OCCUPIED') {
    occupiedTableNum.value = t.no
    occupiedDialog.value = true
    if (picked.value === t.no) {
      picked.value = null
    }
    return
  }
  picked.value = t.no
}

// เลือกโต๊ะแล้วไปหน้าเมนู (เปลี่ยนสถานะโต๊ะเป็น OCCUPIED ทันทีที่เลือก)
async function confirmTable() {
  if (!picked.value || confirming.value) return
  confirming.value = true
  try {
    await loadTables()
    const fresh = tables.value.find((item) => item.no === picked.value)
    if (fresh && fresh.status === 'OCCUPIED') {
      occupiedTableNum.value = picked.value
      occupiedDialog.value = true
      picked.value = null
      return
    }

    // ปรับสถานะโต๊ะในฐานข้อมูลเป็น OCCUPIED ทันทีโดยไม่ต้องรอสั่งอาหาร
    await occupyTable(picked.value)
    order.selectTable(picked.value)
    router.push('/menu')
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <v-container class="py-8" style="max-width: 760px">
    <!-- ส่วนหัว -->
    <div class="text-h4 font-weight-bold mb-1">ยินดีต้อนรับ</div>
    <p class="text-body-1 text-medium-emphasis mb-6">
      กรุณาเลือกโต๊ะของคุณก่อนเริ่มสั่งอาหาร
    </p>

    <v-alert
      v-if="!order.table"
      type="info"
      variant="tonal"
      class="mb-6 rounded-lg"
      icon="mdi-table-chair"
    >
      กรุณาเลือกโต๊ะที่นั่งของคุณด้านล่าง แล้วกด <strong>"เลือกโต๊ะนี้"</strong> เพื่อเริ่มสั่งอาหาร (ระบบล็อคไม่ให้เข้าหน้าอื่นก่อนเลือกโต๊ะ)
    </v-alert>

    <v-card class="pa-6" border>
      <div class="text-subtitle-1 font-weight-bold mb-3">
        เลือกโต๊ะที่นั่ง
      </div>

      <!-- ตารางโต๊ะ: กดเลือกได้ทุกโต๊ะ แต่ถ้ามีคนอยู่แล้วจะเด้ง popup -->
      <v-row dense>
        <v-col v-for="t in tables" :key="t.no" cols="3" sm="2">
          <v-btn
            block
            :variant="picked === t.no ? 'flat' : 'outlined'"
            :color="picked === t.no ? 'primary' : undefined"
            :aria-pressed="picked === t.no"
            @click="handlePickTable(t)"
          >
            {{ t.no }}
          </v-btn>
        </v-col>
      </v-row>

      <!-- ยืนยัน: กดได้เมื่อเลือกแล้ว (ปิดกันพลาด) -->
      <v-expand-transition>
        <div v-if="picked" class="mt-6 d-flex flex-column flex-sm-row align-sm-center ga-3">
          <span class="text-body-2">
            กำลังจะสั่งอาหารสำหรับ <strong>โต๊ะ {{ picked }}</strong>
          </span>
          <v-spacer />
          <v-btn
            append-icon="mdi-arrow-right"
            color="primary"
            :loading="confirming"
            :disabled="confirming"
            @click="confirmTable"
          >
            เลือกโต๊ะนี้
          </v-btn>
        </div>
      </v-expand-transition>
    </v-card>

    <!-- Popup แจ้งเตือนเมื่อโต๊ะมีคนอยู่แล้ว -->
    <v-dialog v-model="occupiedDialog" max-width="400">
      <v-card class="rounded-lg pa-2">
        <v-card-item>
          <template #prepend>
            <v-avatar color="error" variant="tonal" size="44">
              <v-icon color="error" size="24">mdi-account-cancel</v-icon>
            </v-avatar>
          </template>
          <v-card-title class="text-h6 font-weight-bold text-error">
            โต๊ะ {{ occupiedTableNum }} ไม่ว่าง
          </v-card-title>
        </v-card-item>

        <v-card-text class="pt-1 text-body-1">
          มีคนอยู่โต๊ะนี้ไปแล้ว กรุณาเลือกโต๊ะอื่น
        </v-card-text>

        <v-card-actions class="justify-end pt-2">
          <v-btn color="primary" variant="flat" @click="occupiedDialog = false">
            ตกลง
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
