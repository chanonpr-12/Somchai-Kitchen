// ============================================================================
// constant.js — ค่าคงที่ร่วมของระบบ Somchai Kitchen (DB & SA Integration)
// ============================================================================

// ── สถานะอาหารแต่ละรายการ (order_lists.status_order_item) ───────────────────
export const OrderItemStatus = {
  PENDING: 'PENDING',   // ส่งครัวแล้ว รอทำ
  COOKING: 'COOKING',   // ครัวกำลังทำ
  SERVED: 'SERVED',     // เสิร์ฟแล้ว
}

// แผนผังการเลื่อนสถานะในครัว
export const ORDER_ITEM_STATUS_FLOW = [
  OrderItemStatus.PENDING,
  OrderItemStatus.COOKING,
  OrderItemStatus.SERVED
]

export const OrderItemStatusLabel = {
  [OrderItemStatus.PENDING]: 'รอทำ (ส่งครัว)',
  [OrderItemStatus.COOKING]: 'กำลังทำ',
  [OrderItemStatus.SERVED]: 'เสิร์ฟแล้ว',
  // Backward compatibility with Thai labels
  'ส่งครัว': 'รอทำ (ส่งครัว)',
  'กำลังทำ': 'กำลังทำ',
  'เสิร์ฟแล้ว': 'เสิร์ฟแล้ว',
}

// รักษา OrderStatus ไว้เพื่อความเข้ากันได้กับโค้ด UI เดิม
export const OrderStatus = {
  TO_KITCHEN: 'PENDING',
  COOKING: 'COOKING',
  SERVED: 'SERVED',
}

// ── สถานะของออเดอร์/บิล (orders.status_order) ────────────────────────────────
export const OrderStatusEnum = {
  OPEN: 'OPEN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
}

// ── สถานะของโต๊ะ (restaurant_tables.table_status) ─────────────────────────────
export const TableStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  // backward compat
  FREE: 'AVAILABLE',
}

export const TableStatusLabel = {
  AVAILABLE: 'ว่าง',
  OCCUPIED: 'ใช้งานอยู่',
  'ว่าง': 'ว่าง',
  'ใช้งานอยู่': 'ใช้งานอยู่',
}

// ── VAT_RATE — อัตราภาษีมูลค่าเพิ่ม (7%) ────────────────────────────────────
export const VAT_RATE = 0.07

// ── ErrorCode ───────────────────────────────────────────────────────────────
export const ErrorCode = {
  SERVER_UNREACHABLE: 'SERVER_UNREACHABLE',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
}

// ── Role — บทบาทของพนักงานในระบบ ──────────────────────────────────────────
export const Role = {
  ADMIN: 'Admin',
  KITCHEN: 'Kitchen',
  STAFF: 'Staff',
  CUSTOMER: 'Customer',
}
