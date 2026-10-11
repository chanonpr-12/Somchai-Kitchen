<script setup>
// หน้าต่างเลือกตัวเลือกของเมนู 1 จาน — จัดเป็นระบบตาม design skill
// ตัวเลือกใช้ component จริง (v-radio-group / v-checkbox / v-textarea) · ราคารวมเป็นจุดเด่น
// หมายเหตุถึงครัวเป็นฟอร์มที่ตรวจด้วย :rules (skill §7)
import { ref, computed, watch } from 'vue'
import { SPICE_LEVELS, SWEET_LEVELS } from '../data/menu'

const props = defineProps({
  item: { type: Object, default: null },
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'add'])

const spice = ref('เผ็ดน้อย')
const sweet = ref('หวานปกติ')
const picked = ref([])   // ท็อปปิ้งที่เลือก (เก็บเป็น name)
const note = ref('')
const qty = ref(1)
const valid = ref(true)

// เปิดหน้าต่างใหม่ทีไร รีเซ็ตตัวเลือกให้ค่าเริ่มต้น
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      spice.value = 'เผ็ดน้อย'
      sweet.value = 'หวานปกติ'
      picked.value = []
      note.value = ''
      qty.value = 1
    }
  }
)

// หมายเหตุ: ไม่บังคับ แต่ถ้ากรอกต้องไม่เกิน 60 ตัวอักษร — ข้อความบอกวิธีแก้ (ไม่ใช่ "invalid")
// (ฝั่งหน้าเว็บเพื่อความสะดวก — ของจริงเซิร์ฟเวอร์ต้องตรวจซ้ำ · skill §7)
const noteRules = [(v) => !v || v.length <= 60 || 'หมายเหตุยาวเกินไป (ไม่เกิน 60 ตัวอักษร)']

const selectedToppings = computed(() => {
  if (!props.item) return []
  return props.item.toppings.filter((t) => picked.value.includes(t.name))
})
const unitPrice = computed(() => {
  if (!props.item) return 0
  return props.item.price + selectedToppings.value.reduce((s, t) => s + t.price, 0)
})
const total = computed(() => unitPrice.value * qty.value)

function close() {
  emit('update:modelValue', false)
}

function confirm() {
  emit('add', {
    item: props.item,
    spice: props.item.spice ? spice.value : null,
    sweet: props.item.sweet ? sweet.value : null,
    toppings: selectedToppings.value,
    note: note.value,
    qty: qty.value
  })
  close()
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="520"
    scrollable
  >
    <v-card v-if="item">
      <!-- รูป: สูงคงที่ + cover + alt -->
      <v-img :src="item.img" :alt="item.name" height="180" cover />

      <v-card-title class="d-flex align-center ga-2">
        <span class="text-h6 font-weight-bold text-truncate">{{ item.name }}</span>
        <v-spacer />
        <span class="text-h6 text-primary font-weight-bold text-no-wrap">{{ item.price }} บาท</span>
      </v-card-title>

      <v-card-text>
        <v-form v-model="valid">
          <!-- ระดับความเผ็ด -->
          <template v-if="item.spice">
            <div class="text-subtitle-2 mb-1">ระดับความเผ็ด</div>
            <v-radio-group v-model="spice" inline density="comfortable" hide-details class="mb-3">
              <v-radio v-for="s in SPICE_LEVELS" :key="s" :label="s" :value="s" />
            </v-radio-group>
          </template>

          <!-- ระดับความหวาน -->
          <template v-if="item.sweet">
            <div class="text-subtitle-2 mb-1">ระดับความหวาน</div>
            <v-radio-group v-model="sweet" inline density="comfortable" hide-details class="mb-3">
              <v-radio v-for="s in SWEET_LEVELS" :key="s" :label="s" :value="s" />
            </v-radio-group>
          </template>

          <!-- ท็อปปิ้งเพิ่ม (มีราคา) -->
          <template v-if="item.toppings.length">
            <div class="text-subtitle-2 mb-1">ท็อปปิ้งเพิ่ม</div>
            <v-checkbox
              v-for="t in item.toppings"
              :key="t.name"
              v-model="picked"
              :value="t.name"
              density="comfortable"
              hide-details
            >
              <template #label>
                <span>{{ t.name }}</span>
                <span class="text-primary font-weight-medium ms-2">+{{ t.price }} บาท</span>
              </template>
            </v-checkbox>
          </template>

          <!-- หมายเหตุถึงครัว (ฟอร์มตรวจด้วย :rules) -->
          <v-textarea
            v-model="note"
            label="หมายเหตุถึงครัว (ไม่บังคับ)"
            placeholder="เช่น ไม่ใส่ผักชี / เผ็ดพิเศษ"
            :rules="noteRules"
            rows="2"
            auto-grow
            counter
            maxlength="60"
            prepend-inner-icon="mdi-message-text-outline"
            class="mt-3"
          />
        </v-form>

        <!-- จำนวน: ปุ่มเป็นระบบเดียวกับตะกร้า -->
        <div class="d-flex align-center mt-1">
          <span class="text-body-2 me-3">จำนวน</span>
          <v-btn icon="mdi-minus" size="x-small" variant="tonal" aria-label="ลดจำนวน" @click="qty > 1 && qty--" />
          <span class="text-body-1 mx-3" style="min-width:2em;text-align:center">{{ qty }}</span>
          <v-btn icon="mdi-plus" size="x-small" variant="tonal" aria-label="เพิ่มจำนวน" @click="qty++" />
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-4 py-3">
        <span class="text-body-2">รวม
          <span class="text-h6 text-primary font-weight-bold ms-1">{{ total }} บาท</span>
        </span>
        <v-spacer />
        <v-btn variant="text" @click="close">ยกเลิก</v-btn>
        <v-btn variant="flat" :disabled="!valid" prepend-icon="mdi-cart-plus" @click="confirm">ใส่ตะกร้า</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
