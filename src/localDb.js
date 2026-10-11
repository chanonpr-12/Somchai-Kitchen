// ============================================================================
// localDb.js — Mock Database in Browser (LocalStorage Engine)
// Based on Somchai ER Diagram (Chen's Notation)
// ============================================================================
import { reactive, ref, watch } from 'vue'

const STORAGE_KEY = 'somchai_kitchen_local_db_v3'
const LOG_STORAGE_KEY = 'somchai_kitchen_mutation_logs_v3'

// ── นิยาม Schema Metadata ครบทั้ง 13 ตารางสำหรับ Schema Visualizer ─────────────
export const SCHEMA_METADATA = [
  {
    table: 'roles',
    thaiName: 'สิทธิ์การใช้งาน',
    subsystem: 'Staff & Auth',
    description: 'จัดการระดับสิทธิ์ของพนักงานในระบบ',
    columns: [
      { name: 'roleID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสสิทธิ์ (PK)' },
      { name: 'roleName', type: 'VARCHAR(50)', isPk: false, isFk: false, description: 'ชื่อบทบาท เช่น Admin, Kitchen, Staff' }
    ]
  },
  {
    table: 'employees',
    thaiName: 'ข้อมูลพนักงาน',
    subsystem: 'Staff & Auth',
    description: 'ข้อมูลประวัติส่วนบุคคลของพนักงานร้าน',
    columns: [
      { name: 'employeeID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสพนักงาน (PK)' },
      { name: 'employeeFName', type: 'VARCHAR(100)', isPk: false, isFk: false, description: 'ชื่อจริง' },
      { name: 'employeeLNAME', type: 'VARCHAR(100)', isPk: false, isFk: false, description: 'นามสกุล' },
      { name: 'phone', type: 'VARCHAR(20)', isPk: false, isFk: false, description: 'เบอร์โทรศัพท์' },
      { name: 'roleID', type: 'INT', isPk: false, isFk: true, fkTarget: 'roles.roleID', description: 'FK ชี้ไปยัง roles' }
    ]
  },
  {
    table: 'employee_accounts',
    thaiName: 'บัญชีผู้ใช้พนักงาน',
    subsystem: 'Staff & Auth',
    description: 'ข้อมูลเข้าระบบ (1:1 กับ Employee เพื่อความปลอดภัย)',
    columns: [
      { name: 'employeeUserName', type: 'VARCHAR(50)', isPk: true, isFk: false, description: 'ชื่อผู้ใช้สำหรับล็อกอิน (PK)' },
      { name: 'employeePwd', type: 'VARCHAR(255)', isPk: false, isFk: false, description: 'รหัสผ่าน' },
      { name: 'employeeID', type: 'INT', isPk: false, isFk: true, fkTarget: 'employees.employeeID', description: 'FK ชี้ไปยัง employees (UNIQUE 1:1)' },
      { name: 'date_regis', type: 'DATETIME', isPk: false, isFk: false, description: 'วันที่ลงทะเบียนบัญชี (dateRegis)' }
    ]
  },
  {
    table: 'login_history',
    thaiName: 'ประวัติการเข้าสู่ระบบ',
    subsystem: 'Staff & Auth',
    description: 'บันทึก Audit การล็อกอินเข้าใช้งานของพนักงาน',
    columns: [
      { name: 'loginID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสประวัติ (PK)' },
      { name: 'loginTime', type: 'DATETIME', isPk: false, isFk: false, description: 'วันเวลาที่เข้าสู่ระบบ' },
      { name: 'ipAddress', type: 'VARCHAR(45)', isPk: false, isFk: false, description: 'IP Address ผู้ใช้' },
      { name: 'employeeUserName', type: 'VARCHAR(50)', isPk: false, isFk: true, fkTarget: 'employee_accounts.employeeUserName', description: 'FK บัญชีพนักงาน' }
    ]
  },
  {
    table: 'menu_categories',
    thaiName: 'หมวดหมู่อาหาร',
    subsystem: 'Menu Catalog',
    description: 'จัดกลุ่มประเภทรายการอาหารและเครื่องดื่ม',
    columns: [
      { name: 'menuCateID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสหมวดหมู่ (PK)' },
      { name: 'cateName', type: 'VARCHAR(100)', isPk: false, isFk: false, description: 'ชื่อหมวดหมู่' }
    ]
  },
  {
    table: 'menus',
    thaiName: 'รายการอาหาร',
    subsystem: 'Menu Catalog',
    description: 'รายการอาหาร ราคา สถานะ และ Audit Trail ผู้แก้ไข',
    columns: [
      { name: 'menuID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสเมนู (PK)' },
      { name: 'menuName', type: 'VARCHAR(150)', isPk: false, isFk: false, description: 'ชื่ออาหาร' },
      { name: 'menuPrice', type: 'NUMERIC(10,2)', isPk: false, isFk: false, description: 'ราคาขายปัจจุบัน' },
      { name: 'picture', type: 'VARCHAR(255)', isPk: false, isFk: false, description: 'ที่อยู่รูปภาพใน public' },
      { name: 'menuStatus', type: 'VARCHAR(20)', isPk: false, isFk: false, description: 'AVAILABLE / SOLD_OUT' },
      { name: 'menuCateID', type: 'INT', isPk: false, isFk: true, fkTarget: 'menu_categories.menuCateID', description: 'FK หมวดหมู่' },
      { name: 'employeeID', type: 'INT', isPk: false, isFk: true, fkTarget: 'employees.employeeID', description: 'FK พนักงานที่แก้ไขล่าสุด' },
      { name: 'dateAdjust', type: 'DATETIME', isPk: false, isFk: false, description: 'เวลาที่แก้ไขล่าสุด' }
    ]
  },
  {
    table: 'order_options',
    thaiName: 'ตัวเลือกเสริมกลาง',
    subsystem: 'Menu Catalog',
    description: 'ท็อปปิ้งหรือตัวเลือกเสริมกลางของร้าน เช่น ไข่ดาว พิเศษ',
    columns: [
      { name: 'optionID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสตัวเลือก (PK)' },
      { name: 'optionName', type: 'VARCHAR(100)', isPk: false, isFk: false, description: 'ชื่อตัวเลือกเสริม' },
      { name: 'optionPrice', type: 'NUMERIC(10,2)', isPk: false, isFk: false, description: 'ราคาตัวเลือกเสริม' }
    ]
  },
  {
    table: 'restaurant_tables',
    thaiName: 'โต๊ะอาหาร',
    subsystem: 'Dining & Orders',
    description: 'ข้อมูลโต๊ะอาหาร สถานะการนั่ง และสัญญาณเรียกพนักงาน',
    columns: [
      { name: 'tableID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสโต๊ะ (PK)' },
      { name: 'tableNum', type: 'VARCHAR(10)', isPk: false, isFk: false, description: 'หมายเลขโต๊ะ (1-8)' },
      { name: 'tableStatus', type: 'VARCHAR(20)', isPk: false, isFk: false, description: 'AVAILABLE / OCCUPIED' },
      { name: 'statusCall', type: 'BOOLEAN', isPk: false, isFk: false, description: 'สถานะลูกค้ากดเรียกพนักงาน' }
    ]
  },
  {
    table: 'orders',
    thaiName: 'บิลการนั่งทาน (Order)',
    subsystem: 'Dining & Orders',
    description: 'รอบการสั่งอาหารของโต๊ะ (1 โต๊ะมีได้หลายออเดอร์ในประวัติ)',
    columns: [
      { name: 'orderID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสบิลออเดอร์ (PK)' },
      { name: 'tableID', type: 'INT', isPk: false, isFk: true, fkTarget: 'restaurant_tables.tableID', description: 'FK โต๊ะที่สั่ง' },
      { name: 'orderTime', type: 'DATETIME', isPk: false, isFk: false, description: 'เวลาที่เปิดบิลสั่ง' },
      { name: 'statusOrder', type: 'VARCHAR(20)', isPk: false, isFk: false, description: 'OPEN / COMPLETED / CANCELLED' }
    ]
  },
  {
    table: 'order_lists',
    thaiName: 'รายการอาหารในบิล',
    subsystem: 'Dining & Orders',
    description: 'รายการแต่ละจาน พร้อม Snapshot Unit Price ณ เวลาสั่ง',
    columns: [
      { name: 'orderListID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสรายการ (PK)' },
      { name: 'orderID', type: 'INT', isPk: false, isFk: true, fkTarget: 'orders.orderID', description: 'FK บิลแม่' },
      { name: 'menuID', type: 'INT', isPk: false, isFk: true, fkTarget: 'menus.menuID', description: 'FK อาหารที่สั่ง' },
      { name: 'qty', type: 'INT', isPk: false, isFk: false, description: 'จำนวนจาน' },
      { name: 'menuPricePerList', type: 'NUMERIC(10,2)', isPk: false, isFk: false, description: 'Snapshot ราคาจานตอนสั่ง' },
      { name: 'statusOrderItem', type: 'VARCHAR(20)', isPk: false, isFk: false, description: 'PENDING / COOKING / DONE / SERVED' },
      { name: 'orderDescription', type: 'TEXT', isPk: false, isFk: false, description: 'หมายเหตุพิเศษจากลูกค้า' }
    ]
  },
  {
    table: 'order_list_options',
    thaiName: 'ตัวเลือกเสริมของจาน (M:N)',
    subsystem: 'Dining & Orders',
    description: 'Junction Table เชื่อมรายการอาหารกับตัวเลือกเสริม พร้อม Snapshot Price',
    columns: [
      { name: 'orderListID', type: 'INT', isPk: true, isFk: true, fkTarget: 'order_lists.orderListID', description: 'Composite PK 1 / FK รายการ' },
      { name: 'optionID', type: 'INT', isPk: true, isFk: true, fkTarget: 'order_options.optionID', description: 'Composite PK 2 / FK ตัวเลือก' },
      { name: 'applied_price', type: 'NUMERIC(10,2)', isPk: false, isFk: false, description: 'Snapshot ราคาตัวเลือก' }
    ]
  },
  {
    table: 'payments',
    thaiName: 'การชำระเงิน',
    subsystem: 'Billing & Payment',
    description: 'ข้อมูลการปิดบิลของแต่ละ Order (1:1 กับ orders)',
    columns: [
      { name: 'paymentID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสการชำระเงิน (PK)' },
      { name: 'orderID', type: 'INT', isPk: false, isFk: true, fkTarget: 'orders.orderID', description: 'FK บิลออเดอร์ (UNIQUE 1:1)' },
      { name: 'paymentDate', type: 'DATETIME', isPk: false, isFk: false, description: 'เวลาที่ชำระเงิน' },
      { name: 'statusPayment', type: 'VARCHAR(20)', isPk: false, isFk: false, description: 'PAID / REFUNDED' }
    ]
  },
  {
    table: 'payment_types',
    thaiName: 'รูปแบบการชำระเงิน',
    subsystem: 'Billing & Payment',
    description: 'ประเภทการจ่าย เช่น เงินสด, QR พร้อมเพย์, บัตรเครดิต',
    columns: [
      { name: 'paymentTypeID', type: 'INTEGER', isPk: true, isFk: false, description: 'รหัสรูปแบบ (PK)' },
      { name: 'paymentTypeName', type: 'VARCHAR(50)', isPk: false, isFk: false, description: 'ชื่อรูปแบบการชำระ' }
    ]
  },
  {
    table: 'payment_details',
    thaiName: 'รายละเอียดการจ่ายเงิน (Split Pay)',
    subsystem: 'Billing & Payment',
    description: 'Junction Table บันทึกการจ่ายแบบแยกประเภท เช่น เงินสดครึ่งหนึ่ง โอนครึ่งหนึ่ง',
    columns: [
      { name: 'paymentID', type: 'INT', isPk: true, isFk: true, fkTarget: 'payments.paymentID', description: 'Composite PK 1 / FK การชำระ' },
      { name: 'paymentTypeID', type: 'INT', isPk: true, isFk: true, fkTarget: 'payment_types.paymentTypeID', description: 'Composite PK 2 / FK ประเภทการจ่าย' },
      { name: 'amountPaid', type: 'NUMERIC(10,2)', isPk: false, isFk: false, description: 'ยอดเงินที่ชำระด้วยรูปแบบนั้น' }
    ]
  }
]

// ── ข้อมูลตั้งต้นจาก seed.sql ──────────────────────────────────────────────
export function getInitialSeedData() {
  return {
    roles: [
      { roleID: 1, roleName: 'Admin' },
      { roleID: 2, roleName: 'Kitchen' },
      { roleID: 3, roleName: 'Staff' }
    ],
    employees: [
      { employeeID: 1, employeeFName: 'สมชาย', employeeLNAME: 'ใจดี', phone: '0812345678', roleID: 1 },
      { employeeID: 2, employeeFName: 'กานดา', employeeLNAME: 'ครัวเอก', phone: '0891112233', roleID: 2 },
      { employeeID: 3, employeeFName: 'วิชัย', employeeLNAME: 'บริการดี', phone: '0865556677', roleID: 3 }
    ],
    employee_accounts: [
      { employeeUserName: 'admin', employeePwd: '1234', employeeID: 1, date_regis: '2026-01-01 08:00:00' },
      { employeeUserName: 'kitchen', employeePwd: '1234', employeeID: 2, date_regis: '2026-01-05 08:00:00' },
      { employeeUserName: 'staff', employeePwd: '1234', employeeID: 3, date_regis: '2026-01-10 08:00:00' }
    ],
    login_history: [
      { loginID: 1, loginTime: new Date(Date.now() - 3600000).toISOString(), ipAddress: '127.0.0.1', employeeUserName: 'admin' }
    ],
    menu_categories: [
      { menuCateID: 1, cateName: 'จานหลัก' },
      { menuCateID: 2, cateName: 'ของทานเล่น' },
      { menuCateID: 3, cateName: 'ของหวาน' },
      { menuCateID: 4, cateName: 'เครื่องดื่ม' },
      { menuCateID: 5, cateName: 'ต้มและแกง' },
      { menuCateID: 6, cateName: 'เมนูเส้น' }
    ],
    menus: [
      { menuID: 1, menuName: 'ผัดกะเพราหมูสับไข่ดาว', menuPrice: 65.00, picture: '/food/pad-kraprao.jpg', menuStatus: 'AVAILABLE', menuCateID: 1, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 2, menuName: 'ผัดไทยกุ้งสด', menuPrice: 80.00, picture: '/food/pad-thai.jpg', menuStatus: 'AVAILABLE', menuCateID: 6, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 3, menuName: 'ข้าวผัดปู', menuPrice: 95.00, picture: '/food/crab-fried-rice.jpg', menuStatus: 'AVAILABLE', menuCateID: 1, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 4, menuName: 'ต้มยำกุ้งน้ำข้น', menuPrice: 150.00, picture: '/food/tom-yum.jpg', menuStatus: 'AVAILABLE', menuCateID: 5, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 5, menuName: 'แกงเขียวหวานไก่', menuPrice: 110.00, picture: '/food/green-curry.jpg', menuStatus: 'AVAILABLE', menuCateID: 5, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 6, menuName: 'ไก่ทอดกระเทียมพริกไทย', menuPrice: 75.00, picture: '/food/garlic-chicken.jpg', menuStatus: 'AVAILABLE', menuCateID: 1, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 7, menuName: 'หมูสะเต๊ะ', menuPrice: 85.00, picture: '/food/satay.jpg', menuStatus: 'AVAILABLE', menuCateID: 2, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 8, menuName: 'ปอเปี๊ยะทอด', menuPrice: 60.00, picture: '/food/spring-rolls.jpg', menuStatus: 'AVAILABLE', menuCateID: 2, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 9, menuName: 'ข้าวเหนียวมะม่วง', menuPrice: 90.00, picture: '/food/mango-sticky-rice.jpg', menuStatus: 'AVAILABLE', menuCateID: 3, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 10, menuName: 'ทับทิมกรอบ', menuPrice: 45.00, picture: '/food/tubtim.jpg', menuStatus: 'AVAILABLE', menuCateID: 3, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 11, menuName: 'ชาไทยเย็น', menuPrice: 35.00, picture: '/food/thai-tea.jpg', menuStatus: 'AVAILABLE', menuCateID: 4, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' },
      { menuID: 12, menuName: 'น้ำมะนาวโซดา', menuPrice: 40.00, picture: '/food/lime-soda.jpg', menuStatus: 'AVAILABLE', menuCateID: 4, employeeID: 1, dateAdjust: '2026-03-01T10:00:00Z' }
    ],
    order_options: [
      { optionID: 1, optionName: 'ไข่ดาว', optionPrice: 10.00 },
      { optionID: 2, optionName: 'ไข่เจียว', optionPrice: 15.00 },
      { optionID: 3, optionName: 'พิเศษเพิ่มข้าว/เนื้อ', optionPrice: 15.00 },
      { optionID: 4, optionName: 'ไม่ใส่ผัก', optionPrice: 0.00 },
      { optionID: 5, optionName: 'เพิ่มข้าวสวย', optionPrice: 10.00 },
      { optionID: 6, optionName: 'พิเศษเพิ่มเนื้อสัตว์', optionPrice: 20.00 },
      { optionID: 7, optionName: 'เพิ่มน้ำจิ้ม/อาจาด', optionPrice: 10.00 },
      { optionID: 8, optionName: 'ชุดพิเศษ', optionPrice: 20.00 },
      { optionID: 9, optionName: 'เพิ่มกะทิ', optionPrice: 5.00 },
      { optionID: 10, optionName: 'เพิ่มเครื่อง/ข้าวเหนียว', optionPrice: 15.00 },
      { optionID: 11, optionName: 'เพิ่มไข่มุก/บุก', optionPrice: 10.00 },
      { optionID: 12, optionName: 'แยกน้ำแข็ง', optionPrice: 0.00 }
    ],
    restaurant_tables: [
      { tableID: 1, tableNum: '1', tableStatus: 'AVAILABLE', statusCall: false },
      { tableID: 2, tableNum: '2', tableStatus: 'AVAILABLE', statusCall: false },
      { tableID: 3, tableNum: '3', tableStatus: 'AVAILABLE', statusCall: false },
      { tableID: 4, tableNum: '4', tableStatus: 'AVAILABLE', statusCall: false },
      { tableID: 5, tableNum: '5', tableStatus: 'AVAILABLE', statusCall: false },
      { tableID: 6, tableNum: '6', tableStatus: 'AVAILABLE', statusCall: false },
      { tableID: 7, tableNum: '7', tableStatus: 'AVAILABLE', statusCall: false },
      { tableID: 8, tableNum: '8', tableStatus: 'AVAILABLE', statusCall: false }
    ],
    orders: [],
    order_lists: [],
    order_list_options: [],
    payments: [],
    payment_types: [
      { paymentTypeID: 1, paymentTypeName: 'เงินสด' },
      { paymentTypeID: 2, paymentTypeName: 'สแกน QR / พร้อมเพย์' },
      { paymentTypeID: 3, paymentTypeName: 'บัตรเครดิต' }
    ],
    payment_details: []
  }
}

// ── โหลดและบันทึก LocalStorage ─────────────────────────────────────────────
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const initial = getInitialSeedData()
      return { ...initial, ...parsed }
    }
  } catch (err) {
    console.warn('Cannot parse stored local DB:', err)
  }
  return getInitialSeedData()
}

// State ของตารางทั้งหมดแบบ Reactive
export const localDb = reactive(loadFromStorage())

// State ของ Mutation Log (คำสั่ง SQL สด)
function loadLogsFromStorage() {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return [
    {
      id: 1,
      time: new Date().toLocaleTimeString('th-TH'),
      type: 'INIT',
      table: 'SYSTEM',
      sql: '-- Local Database Initialized from schema.sql & seed.sql (ER Diagram 3NF Compliant)',
      summary: 'โหลดข้อมูลเริ่มต้น 13 ตารางตาม ER Diagram เรียบร้อย'
    }
  ]
}

export const mutationLogs = ref(loadLogsFromStorage())

// บันทึกการเปลี่ยนแปลงอัตโนมัติลง LocalStorage
watch(
  () => localDb,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localDb))
    } catch (e) {
      console.warn('Failed to persist localDb to localStorage', e)
    }
  },
  { deep: true }
)

watch(
  () => mutationLogs.value,
  () => {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(mutationLogs.value.slice(0, 100)))
    } catch {}
  },
  { deep: true }
)

// ── ฟังก์ชันบันทึก Mutation Log สด ──────────────────────────────────────────
export function recordMutationLog({ type, table, sql, summary }) {
  const newLog = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString('th-TH'),
    type: type || 'EXEC',
    table: table || 'GENERAL',
    sql: sql || '',
    summary: summary || ''
  }
  mutationLogs.value.unshift(newLog)
  if (mutationLogs.value.length > 80) mutationLogs.value.pop()
}

// ── คืนค่าเริ่มต้น (Reset Seed Data) ────────────────────────────────────────
export function resetLocalDatabase() {
  const initial = getInitialSeedData()
  for (const key of Object.keys(initial)) {
    localDb[key] = initial[key]
  }
  mutationLogs.value = []
  try {
    localStorage.removeItem(LOG_STORAGE_KEY)
  } catch {}
}

// ── Helper ฟังก์ชันค้นหา ID สูงสุด (จำลอง SERIAL Sequence) ───────────────────
export function getNextSerial(tableName, idColName) {
  const rows = localDb[tableName] || []
  if (rows.length === 0) return 1
  const max = Math.max(...rows.map((r) => Number(r[idColName]) || 0))
  return max + 1
}
