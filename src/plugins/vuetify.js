// ============================================================================
// ระบบสีของทั้งเว็บ — กำหนด "ค่าจริง" ที่เดียวในไฟล์นี้ (design.md §1)
// ทั้งเว็บอ้างด้วย "ชื่อตามหน้าที่" (primary/secondary/error/surface) ไม่ระบุ #hex ในหน้าใด
// เปลี่ยนสีทั้งเว็บ = แก้ไฟล์นี้ไฟล์เดียว
//
// 🎯 ธีม = โทน "ม่วง (violet)" ของเว็บรายวิชา CP422021 (Platform globals.css: --hazard #7C3AED)
//    primary กับ secondary อยู่ตระกูลม่วงเดียวกัน — แถบบน + ปุ่มหลัก + ลิงก์ ใช้ primary สีเดียวกันหมด
// ============================================================================
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// โหมดสว่าง — โทนม่วงของแบรนด์วิชา (ทุกคู่สี/ตัวอักษรผ่านเกณฑ์คอนทราสต์ WCAG AA)
const light = {
  dark: false,
  colors: {
    primary:      '#7C3AED', // ม่วง (violet) — สีแบรนด์วิชา · แถบบน/ปุ่มหลัก/ลิงก์ ใช้สีนี้ทั้งหมด (คู่ตัวอักษรขาว ผ่าน AA ≥4.5:1)
    secondary:    '#6D28D9', // ม่วงเข้มกว่า (โทนเดียวกัน) — ใช้เสริมเฉพาะจุด (เช่น snackbar) ไม่ใช่ปุ่มหลัก
    error:        '#DC2626',
    info:         '#1565C0',
    success:      '#16A34A',
    warning:      '#F59E0B',
    background:   '#F7F5FC', // ม่วงจางมาก (ไม่ใช่ขาวจัด)
    surface:      '#FFFFFF',
    'on-surface':    '#241B33', // ดำอมม่วง (โทนเย็น เข้ากับม่วง)
    'on-background': '#241B33',
  },
  // ยกความเข้ม "ข้อความรอง" (medium-emphasis) จากค่าปริยาย 0.6 → 0.68 (design.md §10)
  // ค่าเดิมให้คอนทราสต์ ~4.39:1 บนพื้นอ่อน = ต่ำกว่า 4.5 · 0.68 → ~5.5:1 (ยังจางกว่าตัวหลัก แต่ผ่าน AA)
  // ต้องตั้งผ่าน theme.variables (Vuetify inject ตัวแปรนี้ตอน runtime) ไม่ใช่ override ใน CSS ธรรมดา
  variables: {
    'medium-emphasis-opacity': 0.68,
  },
}

// โหมดมืด — ชื่อสีเดิม ค่าอีกชุด (ไม่ใช่สลับขาวดำ) · พื้นม่วงเข้มเกือบดำ ไม่ใช่ดำสนิท
const dark = {
  dark: true,
  colors: {
    primary:      '#A78BFA', // ม่วงอ่อน (โทนเดียวกับโหมดสว่าง) — สว่างพอบนพื้นมืด
    secondary:    '#C4B5FD', // ม่วงอ่อนกว่า (โทนเดียวกัน)
    error:        '#EF9A9A',
    info:         '#90CAF9',
    success:      '#A5D6A7',
    warning:      '#E6B980',
    background:   '#17131F',
    surface:      '#211B2E',
    'on-surface':    '#ECE6F5',
    'on-background': '#ECE6F5',
  },
}

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: { light, dark },
  },
  // ค่าเริ่มต้นรวม — ตั้งครั้งเดียว ทุกปุ่ม/ช่องกรอกเป็นแบบเดียวกัน
  // ⚠️ VBtn.color='primary' ทำให้ "ทุกปุ่มที่ไม่ระบุสี" เป็นม่วง = แถบบนกับปุ่มสีเดียวกัน (design.md §1)
  //    แต่บนแถบสี primary ต้องใส่ prop color="white" ทับที่ปุ่ม/ไอคอน ให้ตัดพื้น (design.md §2)
  defaults: {
    VBtn:       { color: 'primary', variant: 'flat', rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VSelect:    { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VTextarea:  { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VCard:      { rounded: 'lg' },
    VChip:      { rounded: 'lg' },
  },
})
