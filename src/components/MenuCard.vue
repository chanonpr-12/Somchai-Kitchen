<script setup>
// การ์ดเมนู 1 ใบ — ทุกใบรูปแบบเดียวกัน มีลำดับชั้นชัด (skill §2)
// รูปกำหนดขนาดคงที่ (กัน layout shift, skill §8.4) · ราคาเป็นจุดเด่นด้วยสี+ขนาด
// ป้าย "แนะนำ" มีทั้งไอคอน+คำ (ไม่สื่อด้วยสีอย่างเดียว §8.3) · กดการ์ด -> เปิดหน้าเลือกตัวเลือก
defineProps({
  item: { type: Object, required: true }
})
const emit = defineEmits(['open'])
</script>

<template>
  <v-card class="d-flex flex-column" height="100%" border style="cursor:pointer" @click="emit('open', item)">
    <!-- รูป: สูงคงที่ + cover + ข้อความแทนรูป (alt) · ป้ายแนะนำวางมุมบนซ้าย -->
    <div class="position-relative">
      <v-img :src="item.img" :alt="item.name" height="160" cover />
      <v-chip
        v-if="item.rec"
        color="primary"
        size="small"
        variant="flat"
        prepend-icon="mdi-star"
        class="position-absolute ma-2"
        style="top:0; left:0"
      >
        แนะนำ
      </v-chip>
      <v-chip
        v-if="item.status === 'SOLD_OUT'"
        color="error"
        size="small"
        variant="flat"
        prepend-icon="mdi-cancel"
        class="position-absolute ma-2"
        style="top:0; right:0"
      >
        สินค้าหมด
      </v-chip>
    </div>

    <v-card-text class="pb-2">
      <v-chip size="x-small" variant="tonal" color="primary" class="mb-2">{{ item.cat }}</v-chip>
      <!-- ชื่อจาน: เด่น (น้ำหนักตัวหนา) — จุดที่สายตามองก่อน -->
      <div class="text-body-1 font-weight-medium">{{ item.name }}</div>
      <!-- ราคา: จุดเด่นด้วยสีหลัก + ขนาดใหญ่ -->
      <div class="text-h6 text-primary font-weight-bold mt-1">{{ item.price }} บาท</div>
    </v-card-text>

    <v-spacer />

    <v-card-actions class="px-4 pb-4 pt-0">
      <v-btn
        block
        variant="flat"
        :color="item.status === 'SOLD_OUT' ? 'grey' : 'primary'"
        :prepend-icon="item.status === 'SOLD_OUT' ? 'mdi-cancel' : 'mdi-plus'"
        :disabled="item.status === 'SOLD_OUT'"
        @click.stop="item.status !== 'SOLD_OUT' && emit('open', item)"
      >
        {{ item.status === 'SOLD_OUT' ? 'สินค้าหมด' : 'เลือกตัวเลือก' }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
