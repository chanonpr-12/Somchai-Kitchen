<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { fetchMenu, CATEGORIES } from '../data/menu'
import { useOrderStore } from '../stores/order'
import MenuCard from '../components/MenuCard.vue'
import MenuDetailDialog from '../components/MenuDetailDialog.vue'

const order = useOrderStore()
const route = useRoute()

const menu = ref([])
const loading = ref(true)   // สถานะกำลังโหลด
const error = ref(false)    // สถานะผิดพลาด (สี่สถานะ skill §8.1)
const snackbar = ref(false)
const snackText = ref('')

const detailOpen = ref(false)
const selected = ref(null)

// หมวดที่เลือก — แชร์กับแถบนำทางด้านข้างผ่าน store
const selectedCat = computed({
  get: () => order.activeCat,
  set: (v) => order.setCategory(v || 'ทั้งหมด'),
})

// โหลดเมนู (จำลอง fetch) — ห่อ try/catch เพื่อรองรับสถานะผิดพลาด (เปิด /menu?fail=1 เพื่อลอง)
async function load(isSilent = false) {
  if (!isSilent) loading.value = true
  error.value = false
  try {
    const fresh = await fetchMenu(route.query.fail === '1')
    menu.value = fresh
  } catch (e) {
    if (!isSilent) error.value = true
  } finally {
    if (!isSilent) loading.value = false
  }
}

let pollTimer = null

onMounted(() => {
  load()
  // อัปเดตข้อมูลและสถานะเมนูอาหารอัตโนมัติในเบื้องหลังทุก 2.5 วินาที
  pollTimer = setInterval(() => {
    if (!detailOpen.value) {
      load(true)
    }
  }, 2500)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

// กรองตามหมวดที่เลือก
const filtered = computed(() => {
  if (order.activeCat === 'ทั้งหมด') return menu.value
  return menu.value.filter((m) => m.cat === order.activeCat)
})

function openDetail(item) {
  selected.value = item
  detailOpen.value = true
}

function onAdd(payload) {
  order.addConfigured(payload)
  snackText.value = `ใส่ "${payload.item.name}" × ${payload.qty} ลงตะกร้าแล้ว`
  snackbar.value = true
}
</script>

<template>
  <v-container class="py-6">
    <!-- ส่วนหัว: ลำดับชั้นชัด + บอกหมวดที่กำลังดู -->
    <div class="d-flex align-center flex-wrap ga-2 mb-4">
      <span class="text-h4 font-weight-bold">เมนูอาหาร</span>
      <v-chip v-if="order.activeCat !== 'ทั้งหมด'" color="primary" variant="tonal">
        {{ order.activeCat }}
      </v-chip>
    </div>

    <!-- หมวดหมู่บนมือถือ: แถบ chip เลื่อนแนวนอน (จอกว้างใช้แถบข้างแทน — จัดวางใหม่ตามจอ §6) -->
    <v-chip-group
      v-model="selectedCat"
      mandatory
      selected-class="text-primary font-weight-bold"
      class="d-md-none mb-2"
      show-arrows
    >
      <v-chip v-for="c in CATEGORIES" :key="c" :value="c" filter>{{ c }}</v-chip>
    </v-chip-group>

    <!-- สถานะ 1: กำลังโหลด (โครงร่างการ์ด ไม่ใช่ข้อความเปล่า) -->
    <v-row v-if="loading">
      <v-col v-for="n in 8" :key="n" cols="12" sm="6" md="4" lg="3">
        <v-skeleton-loader type="image, article" />
      </v-col>
    </v-row>

    <!-- สถานะ 2: ผิดพลาด -->
    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
      title="โหลดเมนูไม่สำเร็จ"
      text="กรุณาลองใหม่อีกครั้ง"
      class="my-4"
    >
      <template #append>
        <v-btn color="error" variant="flat" @click="load">ลองใหม่</v-btn>
      </template>
    </v-alert>

    <!-- สถานะ 3ก: ฐานข้อมูลยังไม่มีเมนูเลย (ยังไม่ได้สร้างข้อมูลตั้งต้น) -->
    <!--   สัปดาห์ที่ 9: หน้าเว็บเขียนข้อมูลตั้งต้นเองไม่ได้แล้ว (กฎความปลอดภัยปิดการเขียนตรง)
           ข้อมูลตั้งต้นมาจากสคริปต์ฝั่ง server แทน — จอจึงต้องบอกให้ชัดว่าต้องทำอะไรต่อ -->
    <div v-else-if="menu.length === 0" class="text-center py-12 text-medium-emphasis">
      <v-icon size="56" class="mb-2">mdi-database-off-outline</v-icon>
      <div class="text-body-1 mb-1">ยังไม่มีข้อมูลเมนูในฐานข้อมูล</div>
      <div class="text-body-2">รันคำสั่ง npm run seed:base เพื่อสร้างข้อมูลตั้งต้นของร้าน</div>
    </div>

    <!-- สถานะ 3ข: ว่างเฉพาะหมวดที่เลือก (มีไอคอน + ข้อความ + ทางออก) -->
    <div v-else-if="filtered.length === 0" class="text-center py-12 text-medium-emphasis">
      <v-icon size="56" class="mb-2">mdi-food-off</v-icon>
      <div class="text-body-1 mb-4">ไม่มีรายการในหมวดนี้</div>
      <v-btn variant="tonal" @click="order.setCategory('ทั้งหมด')">ดูเมนูทั้งหมด</v-btn>
    </div>

    <!-- สถานะ 4: มีข้อมูล — กริดปรับตามจอ (มือถือ 1 / sm 2 / md 3 / lg 4 คอลัมน์) -->
    <v-row v-else>
      <v-col v-for="m in filtered" :key="m.id" cols="12" sm="6" md="4" lg="3">
        <MenuCard :item="m" @open="openDetail" />
      </v-col>
    </v-row>

    <!-- หน้าต่างเลือกตัวเลือกของเมนู -->
    <MenuDetailDialog v-model="detailOpen" :item="selected" @add="onAdd" />

    <!-- แจ้งเตือนใส่ตะกร้า: toast (เรื่องทั่วไป ไม่วิกฤต §8.2) -->
    <v-snackbar v-model="snackbar" :timeout="1800" color="secondary" location="bottom">
      {{ snackText }}
      <template #actions>
        <!-- color="white" ให้ตัดกับพื้น snackbar สี secondary (กันปัญหาเดียวกับ §2 บน app-bar) -->
        <v-btn variant="text" color="white" to="/cart">ดูตะกร้า</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>
