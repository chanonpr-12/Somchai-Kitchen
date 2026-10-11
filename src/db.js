// ============================================================================
// db.js — ตัวเชื่อมต่อฐานข้อมูล Local SQLite (database/somchai.db 3NF)
// Based on Somchai ER Diagram (Chen's Notation)
// ============================================================================
import { localDb } from './localDb'

// ── อ่านตัวเลือกเสริมกลาง (order_options) ────────────────────────────────────
export async function readOrderOptions() {
  try {
    const res = await fetch('/api/options')
    if (res.ok) return await res.json()
  } catch {}
  return (localDb.order_options || []).map((o) => ({
    id: o.optionID ?? o.option_id,
    option_id: o.optionID ?? o.option_id,
    name: o.optionName ?? o.option_name,
    price: Number(o.optionPrice ?? o.option_price)
  }))
}

// ── อ่านเมนูทั้งหมด พร้อมหมวดหมู่และตัวเลือกเสริม ─────────────────────────────
export async function readMenu() {
  try {
    const res = await fetch('/api/menu')
    if (res.ok) return await res.json()
  } catch {}

  const categoriesMap = new Map((localDb.menu_categories || []).map((c) => [c.menuCateID ?? c.category_id, c.cateName ?? c.category_name]))
  const options = (localDb.order_options || []).map((opt) => ({
    id: opt.optionID ?? opt.option_id,
    option_id: opt.optionID ?? opt.option_id,
    name: opt.optionName ?? opt.option_name,
    price: Number(opt.optionPrice ?? opt.option_price)
  }))
  const optMap = new Map(options.map((o) => [o.id, o]))

  const getOptionsForCategory = (catId) => {
    if (catId === 1 || catId === 6) return [1, 2, 3, 4]
    if (catId === 5) return [5, 6, 4]
    if (catId === 2) return [7, 8]
    if (catId === 3) return [9, 10]
    if (catId === 4) return [11, 12]
    return [1, 2, 3]
  }

  return (localDb.menus || []).map((m) => {
    const catId = m.menuCateID ?? m.category_id
    const allowedOptIds = getOptionsForCategory(catId)
    const allowedOpts = allowedOptIds.map((id) => optMap.get(id)).filter(Boolean)
    const isDrinkOrDessert = catId === 4 || catId === 3
    const isSavory = catId === 1 || catId === 5 || catId === 6

    const mId = m.menuID ?? m.menu_id
    const mName = m.menuName ?? m.menu_name
    const mPrice = Number(m.menuPrice ?? m.menu_price)
    const mImg = m.picture
    const mCat = categoriesMap.get(catId) || 'ทั่วไป'
    const mStatus = m.menuStatus ?? m.menu_status

    return {
      id: mId,
      menu_id: mId,
      name: mName,
      price: mPrice,
      img: mImg,
      cat: mCat,
      category: mCat,
      status: mStatus,
      spice: isSavory,
      sweet: isDrinkOrDessert,
      toppings: allowedOpts
    }
  })
}

// ── อ่านผังโต๊ะทั้งหมด ───────────────────────────────────────────────────────
export async function readTables() {
  try {
    const res = await fetch('/api/tables')
    if (res.ok) return await res.json()
  } catch {}

  return (localDb.restaurant_tables || []).map((t) => ({
    id: t.tableID ?? t.table_id,
    table_id: t.tableID ?? t.table_id,
    no: t.tableNum ?? t.table_num,
    table_num: t.tableNum ?? t.table_num,
    status: t.tableStatus ?? t.table_status,
    status_call: Boolean(t.statusCall ?? t.status_call)
  }))
}

// ── ปรับสถานะโต๊ะเป็น OCCUPIED ทันทีที่ลูกค้าเลือกโต๊ะ ───────────────────────
export async function occupyTable(tableNum) {
  try {
    const res = await fetch('/api/tables/occupy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: String(tableNum) })
    })
    if (res.ok) return await res.json()
  } catch (e) {
    console.warn('Could not occupy table via API:', e)
  }

  // Fallback localDb
  const t = (localDb.restaurant_tables || []).find((x) => String(x.tableNum ?? x.table_num) === String(tableNum))
  if (t) {
    t.tableStatus = 'OCCUPIED'
    t.table_status = 'OCCUPIED'
  }
  return { ok: true, table: tableNum, status: 'OCCUPIED' }
}

// ── อ่านคำขอเรียกพนักงาน (โต๊ะที่มี statusCall = true) ──────────────────────
export async function readStaffCalls() {
  try {
    const res = await fetch('/api/staff-calls')
    if (res.ok) return await res.json()
  } catch {}

  return (localDb.restaurant_tables || [])
    .filter((t) => Boolean(t.statusCall ?? t.status_call) === true)
    .map((t) => ({
      id: t.tableID ?? t.table_id,
      table: t.tableNum ?? t.table_num,
      table_id: t.tableID ?? t.table_id,
      reason: 'ลูกค้าเรียกพนักงาน',
      at: new Date().toISOString()
    }))
}

// ── จอลูกค้า: อ่านออเดอร์ที่ยังไม่ปิดบิล (statusOrder = 'OPEN') ของโต๊ะนี้ ────
export async function readOrders(tableNum) {
  try {
    const res = await fetch(`/api/orders?table=${tableNum}`)
    if (res.ok) return await res.json()
  } catch {}

  const table = (localDb.restaurant_tables || []).find((t) => String(t.tableNum ?? t.table_num) === String(tableNum))
  if (!table) return []

  const tId = table.tableID ?? table.table_id
  const orders = (localDb.orders || []).filter(
    (o) => (o.tableID ?? o.table_id) === tId && (o.statusOrder ?? o.status_order) === 'OPEN'
  )

  const menuMap = new Map((localDb.menus || []).map((m) => [m.menuID ?? m.menu_id, m]))
  const optMap = new Map((localDb.order_options || []).map((o) => [o.optionID ?? o.option_id, o]))

  return orders.map((order) => {
    const oId = order.orderID ?? order.order_id
    const orderLines = (localDb.order_lists || []).filter((it) => (it.orderID ?? it.order_id) === oId)
    const items = orderLines.map((it) => {
      const lineId = it.orderListID ?? it.order_list_id
      const mId = it.menuID ?? it.menu_id
      const menu = menuMap.get(mId)
      const lineOptions = (localDb.order_list_options || []).filter(
        (opt) => (opt.orderListID ?? opt.order_list_id) === lineId
      )
      const toppings = lineOptions.map((opt) => {
        const opId = opt.optionID ?? opt.option_id
        return {
          id: opId,
          option_id: opId,
          name: (optMap.get(opId)?.optionName ?? optMap.get(opId)?.option_name) || '',
          price: Number(opt.applied_price)
        }
      })

      return {
        lineId,
        order_list_id: lineId,
        orderNo: oId,
        menuId: mId,
        name: (menu?.menuName ?? menu?.menu_name) || 'อาหาร',
        img: menu?.picture || '',
        qty: it.qty,
        unitPrice: Number(it.menuPricePerList ?? it.unit_price),
        status: it.statusOrderItem ?? it.status_order_item,
        note: it.orderDescription ?? it.order_description ?? '',
        toppings
      }
    })

    return {
      no: oId,
      order_id: oId,
      table: tableNum,
      at: order.orderTime ?? order.order_time,
      status: order.statusOrder ?? order.status_order,
      items
    }
  })
}

// ── จอครัว: อ่านรายการอาหารที่ยังทำไม่เสร็จ (PENDING หรือ COOKING) ─────────────
export async function readKitchenQueue() {
  try {
    const res = await fetch('/api/kitchen-queue')
    if (res.ok) return await res.json()
  } catch {}

  const pendingItems = (localDb.order_lists || []).filter((it) =>
    ['PENDING', 'COOKING'].includes(it.statusOrderItem ?? it.status_order_item)
  )

  const orderMap = new Map((localDb.orders || []).map((o) => [o.orderID ?? o.order_id, o]))
  const tableMap = new Map((localDb.restaurant_tables || []).map((t) => [t.tableID ?? t.table_id, t]))
  const menuMap = new Map((localDb.menus || []).map((m) => [m.menuID ?? m.menu_id, m]))
  const optMap = new Map((localDb.order_options || []).map((o) => [o.optionID ?? o.option_id, o]))

  const byOrder = new Map()
  for (const it of pendingItems) {
    const oId = it.orderID ?? it.order_id
    const order = orderMap.get(oId)
    if (!order || (order.statusOrder ?? order.status_order) !== 'OPEN') continue

    const tId = order.tableID ?? order.table_id
    const table = tableMap.get(tId)
    const tableNum = table ? (table.tableNum ?? table.table_num) : '?'
    const orderTime = order.orderTime ?? order.order_time

    if (!byOrder.has(oId)) {
      byOrder.set(oId, {
        no: oId,
        order_id: oId,
        table: tableNum,
        at: orderTime,
        items: []
      })
    }

    const lineId = it.orderListID ?? it.order_list_id
    const lineOpts = (localDb.order_list_options || []).filter((lo) => (lo.orderListID ?? lo.order_list_id) === lineId)
    const toppings = lineOpts.map((lo) => {
      const opId = lo.optionID ?? lo.option_id
      return {
        id: opId,
        name: (optMap.get(opId)?.optionName ?? optMap.get(opId)?.option_name) || '',
        price: Number(lo.applied_price)
      }
    })

    const mId = it.menuID ?? it.menu_id
    const menu = menuMap.get(mId)

    byOrder.get(oId).items.push({
      lineId,
      order_list_id: lineId,
      orderNo: oId,
      menuId: mId,
      name: (menu?.menuName ?? menu?.menu_name) || 'อาหาร',
      qty: it.qty,
      unitPrice: Number(it.menuPricePerList ?? it.unit_price),
      status: it.statusOrderItem ?? it.status_order_item,
      note: it.orderDescription ?? it.order_description ?? '',
      toppings
    })
  }

  return [...byOrder.values()]
}

// ── อ่านประเภทการชำระเงิน ────────────────────────────────────────────────────
export async function readPaymentTypes() {
  try {
    const res = await fetch('/api/payment-types')
    if (res.ok) return await res.json()
  } catch {}
  return (localDb.payment_types || []).map((pt) => ({
    id: pt.paymentTypeID ?? pt.payment_type_id,
    name: pt.paymentTypeName ?? pt.payment_type_name
  }))
}

// ── อ่านประวัติยอดขายรวม ────────────────────────────────────────────────────
export async function readDailySales() {
  try {
    const res = await fetch('/api/daily-sales')
    if (res.ok) return await res.json()
  } catch {}

  const details = localDb.payment_details || []
  const total = details.reduce((sum, d) => sum + Number(d.amountPaid ?? d.amount_paid ?? 0), 0)
  return {
    totalRevenue: total,
    billsCount: (localDb.payments || []).length
  }
}
