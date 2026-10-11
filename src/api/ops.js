// ============================================================================
// API layer ฝั่งปฏิบัติการครัว/พนักงาน (Local SQLite database/somchai.db 3NF)
// Based on Somchai ER Diagram (Chen's Notation)
// ============================================================================
import { localDb, getNextSerial, recordMutationLog } from '../localDb'
import {
  ORDER_ITEM_STATUS_FLOW,
  TableStatus,
  OrderStatusEnum,
  VAT_RATE
} from '../constant'

// ── ครัว/พนักงาน เลื่อนสถานะอาหาร ───────────────────────────────────────────
export async function updateItemStatus(orderNo, lineId, targetStatus = null) {
  try {
    const res = await fetch('/api/ops/item-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNo, lineId, targetStatus })
    })
    if (res.ok) return await res.json()
  } catch {}

  const item = (localDb.order_lists || []).find((it) => (it.orderListID ?? it.order_list_id) === Number(lineId))
  if (!item) throw new Error(`ไม่พบรายการอาหารรหัส ${lineId}`)

  const current = item.statusOrderItem ?? item.status_order_item
  let nextStatus = targetStatus
  if (!nextStatus) {
    const idx = ORDER_ITEM_STATUS_FLOW.indexOf(current)
    nextStatus = idx >= 0 && idx < ORDER_ITEM_STATUS_FLOW.length - 1
      ? ORDER_ITEM_STATUS_FLOW[idx + 1]
      : current
  }

  item.statusOrderItem = nextStatus
  item.status_order_item = nextStatus
  recordMutationLog({
    type: 'UPDATE',
    table: 'order_lists',
    sql: `UPDATE order_lists SET statusOrderItem = '${nextStatus}' WHERE orderListID = ${lineId};`,
    summary: `เปลี่ยนสถานะรายการ #${lineId} เป็น '${nextStatus}'`
  })

  return { ok: true, orderNo, lineId, status: nextStatus }
}

// ── พนักงานปิดบิลของโต๊ะ (Checkout & Split Payments) ─────────────────────────
export async function checkout(table, paymentDetailsInput = null) {
  try {
    const res = await fetch('/api/ops/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, paymentDetailsInput })
    })
    if (res.ok) return await res.json()
  } catch {}

  const tableNumStr = String(table)
  const tableObj = (localDb.restaurant_tables || []).find((t) => String(t.tableNum ?? t.table_num) === tableNumStr)
  if (!tableObj) throw new Error(`ไม่พบโต๊ะ ${table}`)

  const tId = tableObj.tableID ?? tableObj.table_id
  const orderObj = (localDb.orders || []).find(
    (o) => (o.tableID ?? o.table_id) === tId && (o.statusOrder ?? o.status_order) === OrderStatusEnum.OPEN
  )
  if (!orderObj) throw new Error(`ไม่พบออเดอร์ที่ยังไม่ปิดบิลของโต๊ะ ${table}`)

  const orderId = orderObj.orderID ?? orderObj.order_id
  const orderLines = (localDb.order_lists || []).filter((it) => (it.orderID ?? it.order_id) === orderId)

  let subtotal = 0
  for (const line of orderLines) {
    const lineId = line.orderListID ?? line.order_list_id
    const lineOpts = (localDb.order_list_options || []).filter((opt) => (opt.orderListID ?? opt.order_list_id) === lineId)
    const optSum = lineOpts.reduce((sum, o) => sum + Number(o.applied_price || 0), 0)
    subtotal += (Number(line.menuPricePerList ?? line.unit_price) + optSum) * Number(line.qty)
  }

  const vat = Math.round(subtotal * VAT_RATE)
  const total = subtotal + vat

  const paymentId = getNextSerial('payments', 'paymentID') || getNextSerial('payments', 'payment_id')
  localDb.payments.push({
    paymentID: paymentId,
    payment_id: paymentId,
    orderID: orderId,
    order_id: orderId,
    paymentDate: new Date().toISOString(),
    payment_date: new Date().toISOString(),
    statusPayment: 'PAID',
    status_payment: 'PAID'
  })

  const sqlLines = [
    `INSERT INTO payments (orderID, statusPayment) VALUES (${orderId}, 'PAID');`
  ]
  const methodSummaries = []
  const savedDetails = []

  if (Array.isArray(paymentDetailsInput) && paymentDetailsInput.length > 0) {
    for (const p of paymentDetailsInput) {
      const pTypeId = Number(p.payment_type_id || p.paymentTypeID)
      const amt = Number(p.amount || p.amountPaid)
      localDb.payment_details.push({
        paymentID: paymentId,
        payment_id: paymentId,
        paymentTypeID: pTypeId,
        payment_type_id: pTypeId,
        amountPaid: amt,
        amount_paid: amt
      })
      const typeName = pTypeId === 1 ? 'เงินสด' : (pTypeId === 2 ? 'โอน / QR' : 'บัตรเครดิต')
      sqlLines.push(`INSERT INTO payment_details (paymentID, paymentTypeID, amountPaid) VALUES (${paymentId}, ${pTypeId}, ${amt});`)
      methodSummaries.push(`${typeName} ${amt.toLocaleString()} บ.`)
      savedDetails.push({ paymentID: paymentId, paymentTypeID: pTypeId, amountPaid: amt, payment_type_name: typeName })
    }
  } else {
    localDb.payment_details.push({
      paymentID: paymentId,
      payment_id: paymentId,
      paymentTypeID: 1,
      payment_type_id: 1,
      amountPaid: total,
      amount_paid: total
    })
    sqlLines.push(`INSERT INTO payment_details (paymentID, paymentTypeID, amountPaid) VALUES (${paymentId}, 1, ${total});`)
    methodSummaries.push(`เงินสด ${total.toLocaleString()} บ.`)
    savedDetails.push({ paymentID: paymentId, paymentTypeID: 1, amountPaid: total, payment_type_name: 'เงินสด' })
  }

  orderObj.statusOrder = OrderStatusEnum.COMPLETED
  orderObj.status_order = OrderStatusEnum.COMPLETED
  tableObj.tableStatus = TableStatus.AVAILABLE
  tableObj.table_status = TableStatus.AVAILABLE
  tableObj.statusCall = false
  tableObj.status_call = false

  sqlLines.push(`UPDATE orders SET statusOrder = 'COMPLETED' WHERE orderID = ${orderId};`)
  sqlLines.push(`UPDATE restaurant_tables SET tableStatus = 'AVAILABLE', statusCall = 0 WHERE tableID = ${tId};`)

  recordMutationLog({
    type: 'INSERT',
    table: 'payments',
    sql: sqlLines.join('\n'),
    summary: `ปิดบิลโต๊ะ ${table} ยอดรวม ${total.toLocaleString()} บ. (${methodSummaries.join(', ')})`
  })

  return {
    billNo: paymentId,
    orderId,
    table,
    subtotal,
    vat,
    total,
    paymentDetails: savedDetails,
    methodSummary: methodSummaries.join(', ')
  }
}

// ── ลูกค้าเรียกพนักงาน ───────────────────────────────────────────────────────
export async function callStaff(table, reason = 'ลูกค้าเรียกพนักงาน') {
  try {
    await fetch('/api/ops/call-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table })
    })
  } catch {}

  const tableObj = (localDb.restaurant_tables || []).find((t) => String(t.tableNum ?? t.table_num) === String(table))
  if (tableObj) {
    tableObj.statusCall = true
    tableObj.status_call = true
  }
  return { id: table, table, reason }
}

// ── พนักงานปิดคำขอเรียก ─────────────────────────────────────────────────────
export async function resolveStaffCall(idOrTable) {
  try {
    await fetch('/api/ops/resolve-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idOrTable })
    })
  } catch {}

  const tableObj = (localDb.restaurant_tables || []).find(
    (t) => String(t.tableID ?? t.table_id) === String(idOrTable) || String(t.tableNum ?? t.table_num) === String(idOrTable)
  )
  if (tableObj) {
    tableObj.statusCall = false
    tableObj.status_call = false
  }
  return { ok: true, id: idOrTable }
}
