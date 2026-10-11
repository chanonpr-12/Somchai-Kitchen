import { defineStore } from 'pinia'
import { sendOrder, fetchOrders } from '../api/orders' // API layer ฝั่งออเดอร์ (ARCHITECTURE.md §7)
import { callStaff as apiCallStaff } from '../api/ops'  // เรียกพนักงาน = เขียนของกลาง → ผ่าน Cloud Function
import { VAT_RATE } from '../constant'                  // ★ อัตรา VAT ค่ากลาง (convention 2.3) ไม่ฝัง 0.07

// ล้างค่าเลขโต๊ะเดิมที่อาจค้างอยู่ใน localStorage เพื่อให้ตอนเข้าเว็บไม่มีเลขโต๊ะค้างไว้
const TABLE_KEY = 'lab8-table'
try {
  localStorage.removeItem(TABLE_KEY)
} catch { /* ไม่มี localStorage ก็ข้ามไป */ }

// เหตุผลในการเรียกพนักงาน (เลือกได้ ไม่ใช่ปุ่มเดียวรวม ๆ)
export const STAFF_REASONS = ['ขอน้ำ', 'ขอช้อนส้อม/อุปกรณ์', 'ขอความช่วยเหลือ', 'ขอเช็คบิล']

// "ลายเซ็น" ของรายการในตะกร้า: เมนูเดียวกัน + ตัวเลือกเหมือนกัน = รวมเป็นรายการเดียว (เพิ่มจำนวน)
function lineSignature(menuId, spice, sweet, toppings, note) {
  const t = toppings.map((x) => x.name).sort().join(',')
  return [menuId, spice || '', sweet || '', t, (note || '').trim()].join('|')
}

// ศูนย์กลาง state ของ "จอลูกค้า"
// เก็บ: โต๊ะที่เลือก, ตะกร้า (พร้อมตัวเลือกของแต่ละรายการ), สำเนาออเดอร์ที่ดึงมาแสดง
// - table / cart = ของหน้าเว็บ (ชั่วคราว หายได้)
// - orders (ออเดอร์ที่ส่งแล้ว) = ของเซิร์ฟเวอร์ · ช่องนี้เป็นแค่ "สำเนาที่ดึงมาแสดง" (ARCHITECTURE.md §2)
// - สถานะอาหารเลื่อนโดย "จอครัว" (Cloud Function updateItemStatus) — จอลูกค้าอ่านอย่างเดียว
export const useOrderStore = defineStore('order', {
  state: () => ({
    table: null,            // ตอนเข้าเว็บไม่มีเลขโต๊ะค้างไว้ — ลูกค้าต้องเลือกโต๊ะก่อนถึงจะสั่งอาหารได้
    cart: [],               // รายการในตะกร้า (ยังไม่ส่งครัว) — เก็บตัวเลือกของแต่ละรายการด้วย
    orders: [],             // สำเนาออเดอร์ที่ดึงจากชั้น API มาแสดง · เลข no/เวลา at เซิร์ฟเวอร์ออกให้
    lineCounter: 0,         // ตัวนับ id ของรายการในตะกร้า
    activeCat: 'ทั้งหมด'    // หมวดที่เลือกอยู่ (แชร์ระหว่างแถบนำทางกับหน้าเมนู)
  }),

  getters: {
    // จำนวนชิ้นรวมในตะกร้า (เอาไว้โชว์ badge)
    cartCount: (state) => state.cart.reduce((sum, item) => sum + item.qty, 0),

    // ราคารวมย่อยของตะกร้า (unitPrice = ราคาเมนู + ราคาท็อปปิ้ง)
    subtotal: (state) => state.cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),

    // VAT ของตะกร้า — ★ ใช้ค่ากลาง VAT_RATE (convention 2.3) ไม่ฝัง 0.07 · สูตรตรงกับ server
    vat: (state) => Math.round(state.cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0) * VAT_RATE),

    // ยอดสุทธิของตะกร้า
    grandTotal() {
      return this.subtotal + this.vat
    },

    // ── บิลรวมทั้งมื้อ = ทุกรายการจากทุกออเดอร์ที่สั่งไปแล้ว (พรีวิวฝั่งหน้าเว็บ · ยอดจริงมาจาก checkout) ──
    billLines: (state) =>
      state.orders.flatMap((o) => o.items.map((it) => ({ ...it, orderNo: o.no }))),

    billSubtotal() {
      return this.billLines.reduce((sum, it) => sum + it.unitPrice * it.qty, 0)
    },
    billVat() {
      return Math.round(this.billSubtotal * VAT_RATE) // ★ ค่ากลาง VAT_RATE ไม่ฝัง 0.07
    },
    billTotal() {
      return this.billSubtotal + this.billVat
    },
    hasOrders: (state) => state.orders.length > 0
  },

  actions: {
    selectTable(no) {
      this.table = no
    },

    clearTable() {
      this.table = null
      this.cart = []
      this.orders = []
      try {
        localStorage.removeItem(TABLE_KEY)
      } catch {}
    },

    setCategory(cat) {
      this.activeCat = cat
    },

    // เพิ่มลงตะกร้าพร้อมตัวเลือก: ถ้าเมนู+ตัวเลือกเหมือนรายการเดิม ให้เพิ่มจำนวน ไม่งั้นเพิ่มรายการใหม่
    addConfigured({ item, spice = null, sweet = null, toppings = [], note = '', qty = 1 }) {
      const unitPrice = item.price + toppings.reduce((sum, t) => sum + t.price, 0)
      const sig = lineSignature(item.id, spice, sweet, toppings, note)
      const found = this.cart.find((c) => c.sig === sig)
      if (found) {
        found.qty += qty
        return found
      }
      this.lineCounter += 1
      const line = {
        lineId: this.lineCounter,
        sig,
        menuId: item.id,
        name: item.name,
        img: item.img,
        basePrice: item.price,
        unitPrice,
        spice,
        sweet,
        toppings: toppings.map((t) => ({ ...t })),
        note: (note || '').trim(),
        qty
      }
      this.cart.push(line)
      return line
    },

    increase(lineId) {
      const item = this.cart.find((c) => c.lineId === lineId)
      if (item) item.qty += 1
    },

    // ลดจำนวน: ถ้าเหลือ 0 ให้เอาออกจากตะกร้า
    decrease(lineId) {
      const item = this.cart.find((c) => c.lineId === lineId)
      if (!item) return
      item.qty -= 1
      if (item.qty <= 0) this.removeLine(lineId)
    },

    removeLine(lineId) {
      this.cart = this.cart.filter((c) => c.lineId !== lineId)
    },

    // เรียกพนักงาน = เขียน "ของกลาง" ให้จอพนักงานเห็น → ผ่าน Cloud Function (async)
    //   (Lab 06 เก็บคำขอไว้ในหน่วยความจำหน้าเว็บ = จอพนักงานไม่เห็น · Lab 07 เขียนลง Firestore ผ่าน server)
    async callStaff(reason) {
      if (!this.table) throw new Error('ยังไม่ได้เลือกโต๊ะ')
      return await apiCallStaff(this.table, reason)
    },

    // ส่งอาหารเข้าครัว: ส่ง "ผ่านชั้น API" (async) — เซิร์ฟเวอร์ออกเลขออเดอร์ + เวลา + คิดราคาให้
    //   แล้วล้างตะกร้าเมื่อสำเร็จ · ถ้าล้มเหลวจะ throw ออกไปให้หน้าเว็บจัดการ (ไม่ล้างตะกร้า)
    async sendToKitchen(fail = false) {
      if (this.cart.length === 0) return null
      // สิ่งที่ส่งไป server: สั่งเมนูอะไร (menuId) กี่จาน (qty) พร้อมตัวเลือก — "ไม่ส่งราคา"
      //   ราคา/เลขออเดอร์/เลขบรรทัด/สถานะ = server เป็นคนออกให้ทั้งหมด (เชื่อ client ไม่ได้)
      const items = this.cart.map((c) => ({
        menuId: c.menuId,
        name: c.name,
        qty: c.qty,
        toppings: (c.toppings || []).map((t) => ({
          option_id: t.option_id || t.id,
          name: t.name,
          price: t.price
        })),
        note: [c.spice, c.sweet, c.note].filter(Boolean).join(' | ')
      }))
      const saved = await sendOrder({ table: this.table, items }, fail) // อาจ throw ถ้าล้มเหลว
      this.cart = [] // ล้างตะกร้าเฉพาะเมื่อส่งสำเร็จ (ถ้า throw จะไม่มาถึงบรรทัดนี้)
      return saved
    },

    // ดึงออเดอร์ของโต๊ะผ่านชั้น API (async) แล้วเก็บสำเนาไว้ใน store ให้หน้าจอ/บิลใช้ (สัญญา §3)
    async loadOrders(table, fail = false) {
      this.orders = await fetchOrders(table, fail) // อาจ throw ถ้าล้มเหลว
    }
  }
})
