// ============================================================================
// API layer ฝั่งออเดอร์ (Local SQLite database/somchai.db 3NF)
// ============================================================================
import { localDb, getNextSerial, recordMutationLog } from '../localDb'
import { readOrders } from '../db'
import { ErrorCode, OrderItemStatus, TableStatus, OrderStatusEnum } from '../constant'

export async function sendOrder({ table, items }, fail = false) {
  if (fail) {
    const err = new Error('ส่งออเดอร์ไม่สำเร็จ (จำลองเครือข่ายมีปัญหา)')
    err.code = ErrorCode.SERVER_UNREACHABLE
    throw err
  }

  // ส่งคำขอไป SQLite somchai.db จริง
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, items })
    })
    if (res.ok) {
      const orders = await readOrders(table)
      return orders[orders.length - 1] || { table, items: [] }
    }
  } catch (e) {
    console.warn('API error, falling back to localDb:', e)
  }

  // Fallback: localDb
  const tableNumStr = String(table)
  const tableObj = (localDb.restaurant_tables || []).find((t) => String(t.table_num) === tableNumStr)
  if (!tableObj) throw new Error(`ไม่พบข้อมูลโต๊ะ ${table}`)
  const tableId = tableObj.table_id

  let activeOrder = (localDb.orders || []).find(
    (o) => o.table_id === tableId && o.status_order === OrderStatusEnum.OPEN
  )
  let orderId = null

  if (activeOrder) {
    orderId = activeOrder.order_id
  } else {
    orderId = getNextSerial('orders', 'order_id')
    localDb.orders.push({
      order_id: orderId,
      table_id: tableId,
      order_time: new Date().toISOString(),
      status_order: OrderStatusEnum.OPEN
    })
    recordMutationLog({
      type: 'INSERT',
      table: 'orders',
      sql: `INSERT INTO orders (order_id, table_id, order_time, status_order) VALUES (${orderId}, ${tableId}, NOW(), 'OPEN');`,
      summary: `เปิดบิล Order #${orderId} สำหรับโต๊ะ ${table}`
    })
  }

  const menuMap = new Map((localDb.menus || []).map((m) => [m.menu_id, m]))
  const optMap = new Map((localDb.order_options || []).map((o) => [o.option_id, o]))

  for (const it of items) {
    const menuId = it.menuId || it.id
    const menu = menuMap.get(menuId)
    const currentPrice = menu ? Number(menu.menu_price) : (Number(it.unitPrice) || 0)
    const qty = Math.max(1, Number(it.qty) || 1)
    const lineId = getNextSerial('order_lists', 'order_list_id')

    localDb.order_lists.push({
      order_list_id: lineId,
      order_id: orderId,
      menu_id: menuId,
      qty,
      unit_price: currentPrice,
      status_order_item: OrderItemStatus.PENDING,
      order_description: it.note || ''
    })

    if (it.toppings && Array.isArray(it.toppings)) {
      for (const top of it.toppings) {
        const optId = top.option_id || top.id
        const opt = optMap.get(optId)
        localDb.order_list_options.push({
          order_list_id: lineId,
          option_id: optId,
          applied_price: opt ? Number(opt.option_price) : (Number(top.price) || 0)
        })
      }
    }
  }

  const orders = await readOrders(table)
  return orders[orders.length - 1] || { no: orderId, table, items: [] }
}

export async function fetchOrders(table, fail = false) {
  if (fail) {
    const err = new Error('ดึงออเดอร์ไม่สำเร็จ (จำลองเครือข่ายมีปัญหา)')
    err.code = ErrorCode.SERVER_UNREACHABLE
    throw err
  }
  return await readOrders(table)
}
