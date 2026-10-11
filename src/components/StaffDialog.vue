<script setup>
// หน้าต่างเรียกพนักงาน — เลือก "เหตุผล" ก่อน (ไม่ใช่ปุ่มเดียวรวม ๆ)
// ปุ่มเป็นระบบเดียวกัน มีไอคอน+คำ (ไม่สื่อด้วยสีอย่างเดียว §8.3) กดด้วยคีย์บอร์ดได้
import { STAFF_REASONS } from '../stores/order'

defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'call'])

const icons = {
  'ขอน้ำ': 'mdi-cup-water',
  'ขอช้อนส้อม/อุปกรณ์': 'mdi-silverware-fork-knife',
  'ขอความช่วยเหลือ': 'mdi-hand-back-right-outline',
  'ขอเช็คบิล': 'mdi-receipt-text-outline'
}

function pick(reason) {
  emit('call', reason)
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="400">
    <v-card>
      <v-card-title class="text-h6">เรียกพนักงาน</v-card-title>
      <v-card-subtitle class="pb-1">เลือกสิ่งที่ต้องการ พนักงานจะมาที่โต๊ะ</v-card-subtitle>
      <v-card-text>
        <div class="d-flex flex-column ga-2">
          <v-btn
            v-for="r in STAFF_REASONS"
            :key="r"
            block
            size="large"
            variant="tonal"
            :prepend-icon="icons[r]"
            class="justify-start"
            @click="pick(r)"
          >
            {{ r }}
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">ปิด</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
