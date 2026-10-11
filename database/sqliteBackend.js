// ============================================================================
// sqliteBackend.js — Local SQLite Engine (Node 24 built-in node:sqlite)
// Based on Somchai ER Diagram (Chen's Notation)
// จัดการฐานข้อมูลจริง somchai.db ให้ DBeaver เปิดดูและรัน Live Query ได้ทันที
// ============================================================================
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'somchai.db')

// ฟังก์ชันสำหรับแฮชและตรวจสอบรหัสผ่านด้วย SHA-256
export function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password).trim()).digest('hex')
}

export function verifyPassword(inputPassword, storedHash) {
  const hashed = hashPassword(inputPassword)
  return hashed === storedHash || String(inputPassword).trim() === storedHash
}

let db = null
let mutationLogs = []
let queryCounter = 0
let txCounter = 0
let queryLogs = []
let transactionLogs = []
let currentActiveTx = null

function detectSqlType(sql) {
  const s = String(sql || '').trim().toUpperCase()
  if (s.startsWith('SELECT')) return 'SELECT'
  if (s.startsWith('INSERT')) return 'INSERT'
  if (s.startsWith('UPDATE')) return 'UPDATE'
  if (s.startsWith('DELETE')) return 'DELETE'
  if (s.startsWith('BEGIN')) return 'BEGIN'
  if (s.startsWith('COMMIT')) return 'COMMIT'
  if (s.startsWith('ROLLBACK')) return 'ROLLBACK'
  if (s.startsWith('PRAGMA')) return 'PRAGMA'
  return 'SQL'
}

function detectTable(sql) {
  const match = String(sql || '').match(/(?:FROM|INTO|UPDATE|TABLE)\s+([a-zA-Z0-9_]+)/i)
  return match ? match[1] : '-'
}

export function logQuery({ type, table, sql, params, durationMs, summary, transactionId }) {
  queryCounter++
  const cleanSql = String(sql || '').trim()
  const item = {
    id: `Q-${String(queryCounter).padStart(4, '0')}`,
    time: new Date().toLocaleTimeString('th-TH') + '.' + String(Date.now() % 1000).padStart(3, '0'),
    type: type || detectSqlType(cleanSql),
    table: table || detectTable(cleanSql),
    sql: cleanSql,
    params: params || null,
    durationMs: durationMs || 0,
    summary: summary || '',
    transactionId: transactionId || (currentActiveTx ? currentActiveTx.id : null)
  }

  queryLogs.unshift(item)
  if (queryLogs.length > 200) queryLogs.pop()

  if (currentActiveTx) {
    currentActiveTx.queries.push(item)
  }

  return item
}

export function runTransaction(name, title, actionFn) {
  const database = getDatabase()
  txCounter++
  const txId = `TX-${String(txCounter).padStart(3, '0')}`
  const startTime = performance.now()
  const txObj = {
    id: txId,
    name,
    title,
    status: 'IN_PROGRESS',
    time: new Date().toLocaleTimeString('th-TH'),
    queries: [],
    durationMs: 0
  }
  currentActiveTx = txObj
  database.exec('BEGIN IMMEDIATE TRANSACTION;')
  logQuery({
    type: 'BEGIN',
    table: '-',
    sql: 'BEGIN IMMEDIATE TRANSACTION;',
    summary: `เริ่ม Transaction [${name}]: ${title}`,
    transactionId: txId
  })

  try {
    const result = actionFn()
    database.exec('COMMIT;')
    const duration = +(performance.now() - startTime).toFixed(2)
    txObj.status = 'COMMITTED'
    txObj.durationMs = duration
    txObj.queryCount = txObj.queries.length
    logQuery({
      type: 'COMMIT',
      table: '-',
      sql: 'COMMIT;',
      summary: `Commit สำเร็จ [${name}] (${txObj.queries.length} queries, ${duration}ms)`,
      transactionId: txId
    })
    transactionLogs.unshift(txObj)
    if (transactionLogs.length > 60) transactionLogs.pop()
    currentActiveTx = null
    return result
  } catch (error) {
    try { database.exec('ROLLBACK;') } catch {}
    const duration = +(performance.now() - startTime).toFixed(2)
    txObj.status = 'ROLLED_BACK'
    txObj.error = error.message
    txObj.durationMs = duration
    txObj.queryCount = txObj.queries.length
    logQuery({
      type: 'ROLLBACK',
      table: '-',
      sql: 'ROLLBACK;',
      summary: `Rollback ล้มเหลว [${name}]: ${error.message}`,
      transactionId: txId
    })
    transactionLogs.unshift(txObj)
    if (transactionLogs.length > 60) transactionLogs.pop()
    currentActiveTx = null
    throw error
  }
}

export function getDatabase() {
  if (!db) {
    db = new DatabaseSync(DB_PATH)
    db.exec('PRAGMA foreign_keys = ON;')
    initSchemaAndSeed()
  }
  return db
}

export function logMutation(type, table, sql, summary) {
  const logItem = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString('th-TH'),
    type,
    table,
    sql,
    summary
  }
  mutationLogs.unshift(logItem)
  if (mutationLogs.length > 100) mutationLogs.pop()
}

export function getMutationLogs() {
  return mutationLogs
}

export function getQueryLogs() {
  return queryLogs
}

export function getTransactionLogs() {
  return transactionLogs
}

export function clearAllLogs() {
  mutationLogs = []
  queryLogs = []
  transactionLogs = []
  currentActiveTx = null
}

export function clearMutationLogs() {
  clearAllLogs()
}

export function initSchemaAndSeed(forceReset = false) {
  if (forceReset) {
    clearMutationLogs()
    db.exec('PRAGMA foreign_keys = OFF;')
    const dropTables = [
      'payment_details', 'payment_types', 'payments', 'order_list_options',
      'order_lists', 'orders', 'restaurant_tables', 'order_options',
      'menus', 'menu_categories', 'login_history', 'employee_accounts',
      'employees', 'roles'
    ]
    for (const t of dropTables) {
      db.exec(`DROP TABLE IF EXISTS ${t};`)
    }
    db.exec('PRAGMA foreign_keys = ON;')
  }

  // 1. สร้าง Schema ตาม ER Diagram
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      roleID INTEGER PRIMARY KEY AUTOINCREMENT,
      roleName TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      employeeID INTEGER PRIMARY KEY AUTOINCREMENT,
      employeeFName TEXT NOT NULL,
      employeeLNAME TEXT NOT NULL,
      phone TEXT,
      roleID INTEGER NOT NULL REFERENCES roles(roleID)
    );

    CREATE TABLE IF NOT EXISTS employee_accounts (
      employeeUserName TEXT PRIMARY KEY,
      employeePwd TEXT NOT NULL,
      employeeID INTEGER UNIQUE NOT NULL REFERENCES employees(employeeID) ON DELETE CASCADE,
      date_regis DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_history (
      loginID INTEGER PRIMARY KEY AUTOINCREMENT,
      loginTime DATETIME DEFAULT CURRENT_TIMESTAMP,
      ipAddress TEXT,
      employeeUserName TEXT NOT NULL REFERENCES employee_accounts(employeeUserName) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS menu_categories (
      menuCateID INTEGER PRIMARY KEY AUTOINCREMENT,
      cateName TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menus (
      menuID INTEGER PRIMARY KEY AUTOINCREMENT,
      menuName TEXT NOT NULL,
      menuPrice REAL NOT NULL,
      picture TEXT,
      menuStatus TEXT DEFAULT 'AVAILABLE',
      menuCateID INTEGER NOT NULL REFERENCES menu_categories(menuCateID),
      employeeID INTEGER REFERENCES employees(employeeID),
      dateAdjust DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_options (
      optionID INTEGER PRIMARY KEY AUTOINCREMENT,
      optionName TEXT NOT NULL,
      optionPrice REAL DEFAULT 0.00
    );

    CREATE TABLE IF NOT EXISTS restaurant_tables (
      tableID INTEGER PRIMARY KEY AUTOINCREMENT,
      tableNum TEXT UNIQUE NOT NULL,
      tableStatus TEXT DEFAULT 'AVAILABLE',
      statusCall INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      orderID INTEGER PRIMARY KEY AUTOINCREMENT,
      tableID INTEGER NOT NULL REFERENCES restaurant_tables(tableID),
      orderTime DATETIME DEFAULT CURRENT_TIMESTAMP,
      statusOrder TEXT DEFAULT 'OPEN'
    );

    CREATE TABLE IF NOT EXISTS order_lists (
      orderListID INTEGER PRIMARY KEY AUTOINCREMENT,
      orderID INTEGER NOT NULL REFERENCES orders(orderID) ON DELETE CASCADE,
      menuID INTEGER NOT NULL REFERENCES menus(menuID),
      qty INTEGER NOT NULL CHECK (qty > 0),
      menuPricePerList REAL NOT NULL,
      statusOrderItem TEXT DEFAULT 'PENDING',
      orderDescription TEXT
    );

    CREATE TABLE IF NOT EXISTS order_list_options (
      orderListID INTEGER NOT NULL REFERENCES order_lists(orderListID) ON DELETE CASCADE,
      optionID INTEGER NOT NULL REFERENCES order_options(optionID),
      applied_price REAL NOT NULL DEFAULT 0.00,
      PRIMARY KEY (orderListID, optionID)
    );

    CREATE TABLE IF NOT EXISTS payments (
      paymentID INTEGER PRIMARY KEY AUTOINCREMENT,
      orderID INTEGER UNIQUE NOT NULL REFERENCES orders(orderID),
      paymentDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      statusPayment TEXT DEFAULT 'PAID'
    );

    CREATE TABLE IF NOT EXISTS payment_types (
      paymentTypeID INTEGER PRIMARY KEY AUTOINCREMENT,
      paymentTypeName TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_details (
      paymentID INTEGER NOT NULL REFERENCES payments(paymentID) ON DELETE CASCADE,
      paymentTypeID INTEGER NOT NULL REFERENCES payment_types(paymentTypeID),
      amountPaid REAL NOT NULL CHECK (amountPaid > 0),
      PRIMARY KEY (paymentID, paymentTypeID)
    );
  `)

  // 2. เช็คว่ามีข้อมูลเริ่มต้นหรือยัง
  const roleCheck = db.prepare('SELECT COUNT(*) as count FROM roles').get()
  if (roleCheck.count === 0) {
    db.exec(`
      INSERT INTO roles (roleID, roleName) VALUES
      (1, 'Admin'), (2, 'Kitchen'), (3, 'Staff');

      INSERT INTO employees (employeeID, employeeFName, employeeLNAME, phone, roleID) VALUES
      (1, 'สมชาย', 'ใจดี', '0812345678', 1),
      (2, 'กานดา', 'ครัวเอก', '0891112233', 2),
      (3, 'วิชัย', 'บริการดี', '0865556677', 3);

      INSERT INTO employee_accounts (employeeUserName, employeePwd, employeeID, date_regis) VALUES
      ('admin', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 1, '2026-01-01 08:00:00'),
      ('kitchen', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 2, '2026-01-05 08:00:00'),
      ('staff', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 3, '2026-01-10 08:00:00');

      INSERT INTO login_history (loginID, loginTime, ipAddress, employeeUserName) VALUES
      (1, datetime('now', '-1 hour'), '127.0.0.1', 'admin');

      INSERT INTO menu_categories (menuCateID, cateName) VALUES
      (1, 'จานหลัก'), (2, 'ของทานเล่น'), (3, 'ของหวาน'), (4, 'เครื่องดื่ม'), (5, 'ต้มและแกง'), (6, 'เมนูเส้น');

      INSERT INTO menus (menuID, menuName, menuPrice, picture, menuStatus, menuCateID, employeeID) VALUES
      (1, 'ผัดกะเพราหมูสับไข่ดาว', 65.00, '/food/pad-kraprao.jpg', 'AVAILABLE', 1, 1),
      (2, 'ผัดไทยกุ้งสด', 80.00, '/food/pad-thai.jpg', 'AVAILABLE', 6, 1),
      (3, 'ข้าวผัดปู', 95.00, '/food/crab-fried-rice.jpg', 'AVAILABLE', 1, 1),
      (4, 'ต้มยำกุ้งน้ำข้น', 150.00, '/food/tom-yum.jpg', 'AVAILABLE', 5, 1),
      (5, 'แกงเขียวหวานไก่', 110.00, '/food/green-curry.jpg', 'AVAILABLE', 5, 1),
      (6, 'ไก่ทอดกระเทียมพริกไทย', 75.00, '/food/garlic-chicken.jpg', 'AVAILABLE', 1, 1),
      (7, 'หมูสะเต๊ะ', 85.00, '/food/satay.jpg', 'AVAILABLE', 2, 1),
      (8, 'ปอเปี๊ยะทอด', 60.00, '/food/spring-rolls.jpg', 'AVAILABLE', 2, 1),
      (9, 'ข้าวเหนียวมะม่วง', 90.00, '/food/mango-sticky-rice.jpg', 'AVAILABLE', 3, 1),
      (10, 'ทับทิมกรอบ', 45.00, '/food/tubtim.jpg', 'AVAILABLE', 3, 1),
      (11, 'ชาไทยเย็น', 35.00, '/food/thai-tea.jpg', 'AVAILABLE', 4, 1),
      (12, 'น้ำมะนาวโซดา', 40.00, '/food/lime-soda.jpg', 'AVAILABLE', 4, 1);

      INSERT INTO order_options (optionID, optionName, optionPrice) VALUES
      (1, 'ไข่ดาว', 10.00),
      (2, 'ไข่เจียว', 15.00),
      (3, 'พิเศษเพิ่มข้าว/เนื้อ', 15.00),
      (4, 'ไม่ใส่ผัก', 0.00),
      (5, 'เพิ่มข้าวสวย', 10.00),
      (6, 'พิเศษเพิ่มเนื้อสัตว์', 20.00),
      (7, 'เพิ่มน้ำจิ้ม/อาจาด', 10.00),
      (8, 'ชุดพิเศษ', 20.00),
      (9, 'เพิ่มกะทิ', 5.00),
      (10, 'เพิ่มเครื่อง/ข้าวเหนียว', 15.00),
      (11, 'เพิ่มไข่มุก/บุก', 10.00),
      (12, 'แยกน้ำแข็ง', 0.00);

      INSERT INTO restaurant_tables (tableID, tableNum, tableStatus, statusCall) VALUES
      (1, '1', 'AVAILABLE', 0),
      (2, '2', 'AVAILABLE', 0),
      (3, '3', 'AVAILABLE', 0),
      (4, '4', 'AVAILABLE', 0),
      (5, '5', 'AVAILABLE', 0),
      (6, '6', 'AVAILABLE', 0),
      (7, '7', 'AVAILABLE', 0),
      (8, '8', 'AVAILABLE', 0);

      INSERT INTO payment_types (paymentTypeID, paymentTypeName) VALUES
      (1, 'เงินสด'),
      (2, 'สแกน QR / พร้อมเพย์'),
      (3, 'บัตรเครดิต');
    `)

    logMutation('INIT', 'ALL', '-- Schema and Seed applied to somchai.db (SQLite)', 'สร้างฐานข้อมูลและเพิ่มข้อมูลเริ่มต้น 13 ตารางลง somchai.db เรียบร้อย')
  }
}

// ── API Request Dispatcher ──────────────────────────────────────────────────
export function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname

  const sendJson = (status, data) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(data))
  }

  const database = getDatabase()

  // 1. Healthcheck
  if (pathname === '/api/health') {
    return sendJson(200, { ok: true, engine: 'node:sqlite (somchai.db)' })
  }

  // 2. ดึงข้อมูลตารางทั้งหมดหรือตารางที่เลือก
  if (pathname === '/api/tables-data' && req.method === 'GET') {
    const tableParam = url.searchParams.get('table')
    const allowedTables = [
      'roles', 'employees', 'employee_accounts', 'login_history',
      'menu_categories', 'menus', 'order_options', 'restaurant_tables',
      'orders', 'order_lists', 'order_list_options', 'payments',
      'payment_types', 'payment_details'
    ]

    if (tableParam) {
      if (!allowedTables.includes(tableParam)) {
        return sendJson(400, { error: 'Invalid table name' })
      }
      const rows = database.prepare(`SELECT * FROM ${tableParam}`).all()
      return sendJson(200, { table: tableParam, rows })
    }

    const allData = {}
    for (const t of allowedTables) {
      allData[t] = database.prepare(`SELECT * FROM ${t}`).all()
    }
    return sendJson(200, allData)
  }

  // 3. อ่านเมนู (ลูกค้าเปิดดูเมนูอาหาร)
  if (pathname === '/api/menu' && req.method === 'GET') {
    const menus = database.prepare(`
      SELECT m.*, c.cateName 
      FROM menus m 
      LEFT JOIN menu_categories c ON m.menuCateID = c.menuCateID
      ORDER BY m.menuID ASC
    `).all()
    const options = database.prepare('SELECT * FROM order_options ORDER BY optionID ASC').all()

    logQuery({
      type: 'SELECT',
      table: 'menus',
      sql: 'SELECT m.*, c.cateName FROM menus m LEFT JOIN menu_categories c ON m.menuCateID = c.menuCateID ORDER BY m.menuID ASC;',
      summary: `ดึงรายการอาหารทั้งหมด (${menus.length} เมนู) ส่งให้หน้าเว็บลูกค้า`
    })
    logQuery({
      type: 'SELECT',
      table: 'order_options',
      sql: 'SELECT * FROM order_options ORDER BY optionID ASC;',
      summary: `ดึงตัวเลือกพิเศษ/ท็อปปิ้งทั้งหมด (${options.length} ตัวเลือก)`
    })

    const optMap = new Map(options.map((o) => [o.optionID, o]))

    const getOptionsForCategory = (catId) => {
      if (catId === 1 || catId === 6) return [1, 2, 3, 4]
      if (catId === 5) return [5, 6, 4]
      if (catId === 2) return [7, 8]
      if (catId === 3) return [9, 10]
      if (catId === 4) return [11, 12]
      return [1, 2, 3]
    }

    const formatted = menus.map((m) => {
      const allowedOptIds = getOptionsForCategory(m.menuCateID)
      const allowedOpts = allowedOptIds.map((id) => optMap.get(id)).filter(Boolean)
      const isDrinkOrDessert = m.menuCateID === 4 || m.menuCateID === 3
      const isSavory = m.menuCateID === 1 || m.menuCateID === 5 || m.menuCateID === 6

      return {
        id: m.menuID,
        menu_id: m.menuID,
        name: m.menuName,
        price: m.menuPrice,
        img: m.picture,
        cat: m.cateName || 'ทั่วไป',
        category: m.cateName || 'ทั่วไป',
        status: m.menuStatus,
        spice: isSavory,
        sweet: isDrinkOrDessert,
        toppings: allowedOpts.map((opt) => ({
          id: opt.optionID,
          option_id: opt.optionID,
          name: opt.optionName,
          price: opt.optionPrice
        }))
      }
    })
    return sendJson(200, formatted)
  }

  // 4. อ่านโต๊ะ
  if (pathname === '/api/tables' && req.method === 'GET') {
    const rows = database.prepare('SELECT * FROM restaurant_tables ORDER BY tableID ASC').all()
    const mapped = rows.map((t) => ({
      id: t.tableID,
      table_id: t.tableID,
      no: t.tableNum,
      table_num: t.tableNum,
      status: t.tableStatus,
      status_call: Boolean(t.statusCall)
    }))
    return sendJson(200, mapped)
  }

  // 5. อ่านคำขอเรียกพนักงาน
  if (pathname === '/api/staff-calls' && req.method === 'GET') {
    const rows = database.prepare('SELECT * FROM restaurant_tables WHERE statusCall = 1 ORDER BY tableID ASC').all()
    const mapped = rows.map((t) => ({
      id: t.tableID,
      table: t.tableNum,
      table_id: t.tableID,
      reason: 'ลูกค้าเรียกพนักงาน',
      at: new Date().toISOString()
    }))
    return sendJson(200, mapped)
  }

  // 6. อ่านออเดอร์โต๊ะ
  if (pathname === '/api/orders' && req.method === 'GET') {
    const tableNum = url.searchParams.get('table')
    let table = null
    if (tableNum) {
      table = database.prepare('SELECT * FROM restaurant_tables WHERE tableNum = ?').get(String(tableNum))
      if (!table) return sendJson(200, [])
    }

    const orderQuery = table
      ? database.prepare("SELECT * FROM orders WHERE tableID = ? AND statusOrder = 'OPEN' ORDER BY orderID ASC").all(table.tableID)
      : database.prepare("SELECT * FROM orders WHERE statusOrder = 'OPEN' ORDER BY orderID ASC").all()

    const result = orderQuery.map((ord) => {
      const items = database.prepare(`
        SELECT ol.*, m.menuName, m.picture
        FROM order_lists ol
        LEFT JOIN menus m ON ol.menuID = m.menuID
        WHERE ol.orderID = ?
        ORDER BY ol.orderListID ASC
      `).all(ord.orderID)

      const formattedItems = items.map((it) => {
        const toppings = database.prepare(`
          SELECT olo.*, oo.optionName
          FROM order_list_options olo
          LEFT JOIN order_options oo ON olo.optionID = oo.optionID
          WHERE olo.orderListID = ?
        `).all(it.orderListID).map((top) => ({
          id: top.optionID,
          option_id: top.optionID,
          name: top.optionName,
          price: top.applied_price
        }))

        return {
          lineId: it.orderListID,
          order_list_id: it.orderListID,
          orderNo: ord.orderID,
          menuId: it.menuID,
          name: it.menuName || 'อาหาร',
          img: it.picture || '',
          qty: it.qty,
          unitPrice: it.menuPricePerList,
          status: it.statusOrderItem,
          note: it.orderDescription || '',
          toppings
        }
      })

      const ordTable = database.prepare('SELECT tableNum FROM restaurant_tables WHERE tableID = ?').get(ord.tableID)

      return {
        no: ord.orderID,
        order_id: ord.orderID,
        table: ordTable ? ordTable.tableNum : '?',
        at: ord.orderTime,
        status: ord.statusOrder,
        items: formattedItems
      }
    })

    return sendJson(200, result)
  }

  // 7. จอครัว
  if (pathname === '/api/kitchen-queue' && req.method === 'GET') {
    const pendingItems = database.prepare(`
      SELECT ol.*, m.menuName, o.tableID, o.orderTime, rt.tableNum
      FROM order_lists ol
      JOIN orders o ON ol.orderID = o.orderID
      JOIN restaurant_tables rt ON o.tableID = rt.tableID
      LEFT JOIN menus m ON ol.menuID = m.menuID
      WHERE ol.statusOrderItem IN ('PENDING', 'COOKING') AND o.statusOrder = 'OPEN'
      ORDER BY ol.orderListID ASC
    `).all()

    const byOrder = new Map()
    for (const it of pendingItems) {
      if (!byOrder.has(it.orderID)) {
        byOrder.set(it.orderID, {
          no: it.orderID,
          order_id: it.orderID,
          table: it.tableNum,
          at: it.orderTime,
          items: []
        })
      }

      const toppings = database.prepare(`
        SELECT olo.*, oo.optionName
        FROM order_list_options olo
        LEFT JOIN order_options oo ON olo.optionID = oo.optionID
        WHERE olo.orderListID = ?
      `).all(it.orderListID).map((top) => ({
        id: top.optionID,
        name: top.optionName,
        price: top.applied_price
      }))

      byOrder.get(it.orderID).items.push({
        lineId: it.orderListID,
        order_list_id: it.orderListID,
        orderNo: it.orderID,
        menuId: it.menuID,
        name: it.menuName || 'อาหาร',
        qty: it.qty,
        unitPrice: it.menuPricePerList,
        status: it.statusOrderItem,
        note: it.orderDescription || '',
        toppings
      })
    }

    return sendJson(200, [...byOrder.values()])
  }

  // 8. ชำระเงิน / ประเภทยอดขาย
  if (pathname === '/api/payment-types' && req.method === 'GET') {
    const rows = database.prepare('SELECT * FROM payment_types ORDER BY paymentTypeID ASC').all()
    return sendJson(200, rows)
  }

  if (pathname === '/api/daily-sales' && req.method === 'GET') {
    const sumRow = database.prepare('SELECT COALESCE(SUM(amountPaid), 0) as totalRevenue, COUNT(DISTINCT paymentID) as billsCount FROM payment_details').get()
    logQuery({ type: 'SELECT', table: 'payment_details', sql: 'SELECT COALESCE(SUM(amountPaid), 0) as totalRevenue, COUNT(DISTINCT paymentID) as billsCount FROM payment_details;', summary: 'คำนวณยอดขายรวมประจำวัน' })
    return sendJson(200, sumRow)
  }

  // 9. Logs & Transaction Inspector Endpoints
  if (pathname === '/api/logs' && req.method === 'GET') {
    return sendJson(200, getMutationLogs())
  }

  if (pathname === '/api/queries' && req.method === 'GET') {
    const type = url.searchParams.get('type')
    let list = getQueryLogs()
    if (type && type !== 'ALL') {
      list = list.filter((q) => q.type === type.toUpperCase())
    }
    return sendJson(200, list)
  }

  if (pathname === '/api/transactions' && req.method === 'GET') {
    return sendJson(200, getTransactionLogs())
  }

  // ── POST Requests ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let bodyStr = ''
    req.on('data', (chunk) => { bodyStr += chunk })
    req.on('end', () => {
      let body = {}
      try {
        if (bodyStr) body = JSON.parse(bodyStr)
      } catch (err) {
        return sendJson(400, { error: 'Invalid JSON body' })
      }

      // สั่งอาหาร (Transaction: PLACE_ORDER)
      if (pathname === '/api/orders') {
        const { table, items } = body
        const tableObj = database.prepare('SELECT * FROM restaurant_tables WHERE tableNum = ?').get(String(table))
        if (!tableObj) return sendJson(400, { error: `ไม่พบโต๊ะ ${table}` })

        try {
          const resData = runTransaction('PLACE_ORDER', `สั่งอาหารโต๊ะ ${table} (${(items || []).length} รายการ)`, () => {
            let activeOrder = database.prepare("SELECT * FROM orders WHERE tableID = ? AND statusOrder = 'OPEN'").get(tableObj.tableID)
            logQuery({
              type: 'SELECT',
              table: 'orders',
              sql: `SELECT * FROM orders WHERE tableID = ${tableObj.tableID} AND statusOrder = 'OPEN';`,
              summary: activeOrder ? `พบ Order #${activeOrder.orderID} ที่เปิดอยู่แล้วของโต๊ะ ${table}` : `ไม่พบบิลเดิมที่เปิดอยู่ของโต๊ะ ${table} (จะทำการเปิดบิลใหม่)`
            })

            let orderId = null

            if (activeOrder) {
              orderId = activeOrder.orderID
            } else {
              database.prepare("INSERT INTO orders (tableID, statusOrder) VALUES (?, 'OPEN')").run(tableObj.tableID)
              const newOrd = database.prepare('SELECT last_insert_rowid() as id').get()
              orderId = newOrd.id

              logQuery({
                type: 'INSERT',
                table: 'orders',
                sql: `INSERT INTO orders (tableID, statusOrder) VALUES (${tableObj.tableID}, 'OPEN');`,
                summary: `เปิดบิล Order #${orderId} โต๊ะ ${table}`
              })
            }

            // Snapshot Price & insert
            for (const it of (items || [])) {
              const menuId = it.menuId || it.id
              const menu = database.prepare('SELECT menuPrice, menuName FROM menus WHERE menuID = ?').get(menuId)

              logQuery({
                type: 'SELECT',
                table: 'menus',
                sql: `SELECT menuPrice, menuName FROM menus WHERE menuID = ${menuId};`,
                summary: `ดึงข้อมูลเมนู '${menu ? menu.menuName : menuId}' และราคาล่าสุด (฿${menu ? menu.menuPrice : '-'}) จาก somchai.db`
              })

              const currentPrice = menu ? menu.menuPrice : (Number(it.unitPrice) || 0)
              const qty = Math.max(1, Number(it.qty) || 1)
              const note = it.note || ''

              database.prepare(`
                INSERT INTO order_lists (orderID, menuID, qty, menuPricePerList, statusOrderItem, orderDescription)
                VALUES (?, ?, ?, ?, 'PENDING', ?)
              `).run(orderId, menuId, qty, currentPrice, note)

              const lineId = database.prepare('SELECT last_insert_rowid() as id').get().id

              logQuery({
                type: 'INSERT',
                table: 'order_lists',
                sql: `INSERT INTO order_lists (orderID, menuID, qty, menuPricePerList, statusOrderItem, orderDescription) VALUES (${orderId}, ${menuId}, ${qty}, ${currentPrice}, 'PENDING', '${note}');`,
                summary: `เพิ่มรายการ '${menu ? menu.menuName : menuId}' x${qty} (ราคา ${currentPrice} บ.) ลง Order #${orderId}`
              })

              if (it.toppings && Array.isArray(it.toppings)) {
                for (const top of it.toppings) {
                  const optId = top.option_id || top.id
                  const opt = database.prepare('SELECT optionPrice, optionName FROM order_options WHERE optionID = ?').get(optId)

                  logQuery({
                    type: 'SELECT',
                    table: 'order_options',
                    sql: `SELECT optionPrice, optionName FROM order_options WHERE optionID = ${optId};`,
                    summary: `ดึงราคาตัวเลือกพิเศษ '${opt ? opt.optionName : optId}' (฿${opt ? opt.optionPrice : '-'})`
                  })

                  const appliedPrice = opt ? opt.optionPrice : (Number(top.price) || 0)

                  database.prepare(`
                    INSERT INTO order_list_options (orderListID, optionID, applied_price)
                    VALUES (?, ?, ?)
                  `).run(lineId, optId, appliedPrice)

                  logQuery({
                    type: 'INSERT',
                    table: 'order_list_options',
                    sql: `INSERT INTO order_list_options (orderListID, optionID, applied_price) VALUES (${lineId}, ${optId}, ${appliedPrice});`,
                    summary: `เพิ่มท็อปปิ้ง '${opt ? opt.optionName : optId}' (+${appliedPrice} บ.) ให้รายการ #${lineId}`
                  })
                }
              }
            }

            return { ok: true, orderId, table }
          })
          return sendJson(200, resData)
        } catch (err) {
          return sendJson(500, { error: 'เกิดข้อผิดพลาดในการบันทึกออเดอร์: ' + err.message })
        }
      }

      // เปลี่ยนสถานะอาหาร (ครัว: PENDING -> COOKING, พนักงาน: COOKING -> SERVED)
      if (pathname === '/api/ops/item-status') {
        const { lineId, targetStatus } = body
        const item = database.prepare('SELECT statusOrderItem FROM order_lists WHERE orderListID = ?').get(lineId)
        if (!item) return sendJson(404, { error: 'ไม่พบรายการ' })

        let next = targetStatus
        if (!next) {
          const flow = ['PENDING', 'COOKING', 'SERVED']
          const idx = flow.indexOf(item.statusOrderItem)
          next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : item.statusOrderItem
        }

        database.prepare('UPDATE order_lists SET statusOrderItem = ? WHERE orderListID = ?').run(next, lineId)
        logQuery({
          type: 'UPDATE',
          table: 'order_lists',
          sql: `UPDATE order_lists SET statusOrderItem = '${next}' WHERE orderListID = ${lineId};`,
          summary: `ปรับสถานะรายการ #${lineId} เป็น '${next}' ใน somchai.db`
        })
        logMutation('UPDATE', 'order_lists', `UPDATE order_lists SET statusOrderItem = '${next}' WHERE orderListID = ${lineId};`, `ปรับสถานะรายการ #${lineId} เป็น '${next}' ใน somchai.db`)
        return sendJson(200, { ok: true, lineId, status: next })
      }

      // ปิดบิล (Transaction: CHECKOUT_PAYMENT & Split Payments)
      if (pathname === '/api/ops/checkout') {
        const { table, paymentDetailsInput } = body
        const tableObj = database.prepare('SELECT * FROM restaurant_tables WHERE tableNum = ?').get(String(table))
        if (!tableObj) return sendJson(404, { error: 'ไม่พบโต๊ะ' })

        const orderObj = database.prepare("SELECT * FROM orders WHERE tableID = ? AND statusOrder = 'OPEN'").get(tableObj.tableID)
        if (!orderObj) return sendJson(404, { error: 'ไม่พบออเดอร์เปิดอยู่' })

        const orderId = orderObj.orderID

        try {
          const resData = runTransaction('CHECKOUT_PAYMENT', `ชำระเงินและปิดบิลโต๊ะ ${table} (Order #${orderId})`, () => {
            const lines = database.prepare('SELECT * FROM order_lists WHERE orderID = ?').all(orderId)

            let subtotal = 0
            for (const line of lines) {
              const opts = database.prepare('SELECT applied_price FROM order_list_options WHERE orderListID = ?').all(line.orderListID)
              let optSum = opts.reduce((sum, o) => sum + Number(o.applied_price || 0), 0)
              subtotal += (Number(line.menuPricePerList) + optSum) * Number(line.qty)
            }

            const vat = Math.round(subtotal * 0.07)
            const total = subtotal + vat

            database.prepare("INSERT INTO payments (orderID, statusPayment) VALUES (?, 'PAID')").run(orderId)
            const paymentId = database.prepare('SELECT last_insert_rowid() as id').get().id

            logQuery({
              type: 'INSERT',
              table: 'payments',
              sql: `INSERT INTO payments (orderID, statusPayment) VALUES (${orderId}, 'PAID');`,
              summary: `สร้างใบเสร็จการชำระเงิน #${paymentId} สำหรับ Order #${orderId}`
            })

            const methodSummaries = []
            if (Array.isArray(paymentDetailsInput) && paymentDetailsInput.length > 0) {
              for (const p of paymentDetailsInput) {
                const pTypeId = Number(p.payment_type_id || p.paymentTypeID)
                const amt = Number(p.amount || p.amountPaid)
                database.prepare('INSERT INTO payment_details (paymentID, paymentTypeID, amountPaid) VALUES (?, ?, ?)').run(paymentId, pTypeId, amt)
                const typeName = pTypeId === 1 ? 'เงินสด' : (pTypeId === 2 ? 'โอน / QR' : 'บัตรเครดิต')
                methodSummaries.push(`${typeName} ${amt.toLocaleString()} บ.`)
                logQuery({
                  type: 'INSERT',
                  table: 'payment_details',
                  sql: `INSERT INTO payment_details (paymentID, paymentTypeID, amountPaid) VALUES (${paymentId}, ${pTypeId}, ${amt});`,
                  summary: `บันทึกยอดชำระ (${typeName} ${amt} บ.) ลงใบเสร็จ #${paymentId}`
                })
              }
            } else {
              database.prepare('INSERT INTO payment_details (paymentID, paymentTypeID, amountPaid) VALUES (?, 1, ?)').run(paymentId, total)
              methodSummaries.push(`เงินสด ${total.toLocaleString()} บ.`)
              logQuery({
                type: 'INSERT',
                table: 'payment_details',
                sql: `INSERT INTO payment_details (paymentID, paymentTypeID, amountPaid) VALUES (${paymentId}, 1, ${total});`,
                summary: `บันทึกยอดชำระเงินสด ${total} บ. ลงใบเสร็จ #${paymentId}`
              })
            }

            database.prepare("UPDATE orders SET statusOrder = 'COMPLETED' WHERE orderID = ?").run(orderId)
            database.prepare("UPDATE restaurant_tables SET tableStatus = 'AVAILABLE', statusCall = 0 WHERE tableID = ?").run(tableObj.tableID)

            logQuery({
              type: 'UPDATE',
              table: 'orders',
              sql: `UPDATE orders SET statusOrder = 'COMPLETED' WHERE orderID = ${orderId};`,
              summary: `ปรับสถานะ Order #${orderId} เป็น COMPLETED (ปิดบิล)`
            })
            logQuery({
              type: 'UPDATE',
              table: 'restaurant_tables',
              sql: `UPDATE restaurant_tables SET tableStatus = 'AVAILABLE', statusCall = 0 WHERE tableID = ${tableObj.tableID};`,
              summary: `คืนสถานะโต๊ะ ${table} เป็น AVAILABLE (ว่างพร้อมรับลูกค้าใหม่)`
            })

            const savedDetails = database.prepare(`
              SELECT pd.*, pt.paymentTypeName
              FROM payment_details pd
              JOIN payment_types pt ON pd.paymentTypeID = pt.paymentTypeID
              WHERE pd.paymentID = ?
            `).all(paymentId)

            return {
              billNo: paymentId,
              orderId,
              table,
              subtotal,
              vat,
              total,
              paymentDetails: savedDetails.map(d => ({
                ...d,
                payment_type_name: d.paymentTypeName,
                amount_paid: d.amountPaid
              })),
              methodSummary: methodSummaries.join(', ')
            }
          })
          return sendJson(200, resData)
        } catch (err) {
          return sendJson(500, { error: 'เกิดข้อผิดพลาดในการชำระเงิน: ' + err.message })
        }
      }

      // เรียกพนักงาน
      if (pathname === '/api/ops/call-staff') {
        const { table } = body
        database.prepare('UPDATE restaurant_tables SET statusCall = 1 WHERE tableNum = ?').run(String(table))
        logMutation('UPDATE', 'restaurant_tables', `UPDATE restaurant_tables SET statusCall = 1 WHERE tableNum = '${table}';`, `โต๊ะ ${table} กดเรียกพนักงาน`)
        return sendJson(200, { ok: true, table })
      }

      // ปิดการเรียก
      if (pathname === '/api/ops/resolve-call') {
        const { idOrTable } = body
        database.prepare('UPDATE restaurant_tables SET statusCall = 0 WHERE tableNum = ? OR tableID = ?').run(String(idOrTable), String(idOrTable))
        logMutation('UPDATE', 'restaurant_tables', `UPDATE restaurant_tables SET statusCall = 0 WHERE tableNum = '${idOrTable}';`, `พนักงานรับเรื่องโต๊ะ ${idOrTable}`)
        return sendJson(200, { ok: true, idOrTable })
      }

      // เลือกโต๊ะ / นั่งโต๊ะ (ปรับสถานะโต๊ะเป็น OCCUPIED ทันทีที่เลือก)
      if (pathname === '/api/tables/occupy') {
        const { table } = body
        const tableObj = database.prepare('SELECT * FROM restaurant_tables WHERE tableNum = ?').get(String(table))
        if (!tableObj) return sendJson(404, { error: `ไม่พบโต๊ะ ${table}` })

        database.prepare("UPDATE restaurant_tables SET tableStatus = 'OCCUPIED' WHERE tableNum = ?").run(String(table))

        logQuery({
          type: 'UPDATE',
          table: 'restaurant_tables',
          sql: `UPDATE restaurant_tables SET tableStatus = 'OCCUPIED' WHERE tableNum = '${table}';`,
          summary: `ลูกค้าเลือกนั่งโต๊ะ ${table} -> ปรับสถานะโต๊ะเป็น OCCUPIED (ไม่ว่าง) ทันที`
        })
        logMutation(
          'UPDATE',
          'restaurant_tables',
          `UPDATE restaurant_tables SET tableStatus = 'OCCUPIED' WHERE tableNum = '${table}';`,
          `ลูกค้าเลือกนั่งโต๊ะ ${table} -> ปรับสถานะเป็น OCCUPIED ใน somchai.db`
        )

        return sendJson(200, { ok: true, table: String(table), status: 'OCCUPIED' })
      }

      // เข้าสู่ระบบพนักงาน
      if (pathname === '/api/auth/login') {
        const { username, password } = body
        const acc = database.prepare(`
          SELECT ea.*, e.employeeID, e.employeeFName, e.employeeLNAME, r.roleName
          FROM employee_accounts ea
          JOIN employees e ON ea.employeeID = e.employeeID
          JOIN roles r ON e.roleID = r.roleID
          WHERE ea.employeeUserName = ?
        `).get(username)

        if (!acc) return sendJson(401, { error: 'ไม่พบบัญชีผู้ใช้นี้ใน somchai.db' })
        if (!verifyPassword(password, acc.employeePwd)) return sendJson(401, { error: 'รหัสผ่านไม่ถูกต้อง' })

        database.prepare("INSERT INTO login_history (employeeUserName, ipAddress) VALUES (?, '127.0.0.1 (Local SQLite)')").run(username)
        logMutation('INSERT', 'login_history', `INSERT INTO login_history (employeeUserName, ipAddress) VALUES ('${username}', '127.0.0.1');`, `พนักงาน '${username}' (${acc.roleName}) เข้าสู่ระบบสำเร็จ`)

        return sendJson(200, {
          uid: acc.employeeUserName,
          username: acc.employeeUserName,
          employeeId: acc.employeeID,
          displayName: `${acc.employeeFName} ${acc.employeeLNAME}`.trim(),
          role: acc.roleName,
          dateRegis: acc.date_regis
        })
      }

      // สมัคร / ลงทะเบียนพนักงานใหม่
      if (pathname === '/api/auth/register') {
        const { firstName, lastName, phone, role, username, password } = body

        if (!firstName || !lastName || !username || !password) {
          return sendJson(400, { error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, นามสกุล, ชื่อผู้ใช้, รหัสผ่าน)' })
        }

        const cleanUsername = String(username).trim()
        const existingAcc = database.prepare('SELECT employeeUserName FROM employee_accounts WHERE employeeUserName = ?').get(cleanUsername)
        if (existingAcc) {
          return sendJson(400, { error: `ชื่อผู้ใช้ '${cleanUsername}' มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น` })
        }

        let roleId = 3 // default Staff
        let roleName = 'Staff'
        const normRole = String(role || '').toLowerCase()
        if (normRole === 'admin' || Number(role) === 1) {
          return sendJson(400, { error: 'ไม่อนุญาตให้ลงทะเบียนตำแหน่งผู้ดูแลระบบ (Admin) ผ่านหน้าสมัครพนักงาน' })
        }
        if (normRole === 'kitchen' || Number(role) === 2) {
          roleId = 2
          roleName = 'Kitchen'
        }

        const phoneVal = phone ? String(phone).trim() : ''
        const fName = String(firstName).trim()
        const lName = String(lastName).trim()
        const pwd = String(password).trim()
        const hashedPwd = hashPassword(pwd)

        try {
          const resData = runTransaction('REGISTER_EMPLOYEE', `ลงทะเบียนพนักงาน ${fName} ${lName} (${roleName})`, () => {
            // 1. เพิ่มข้อมูลพนักงานในตาราง employees
            database.prepare(`
              INSERT INTO employees (employeeFName, employeeLNAME, phone, roleID)
              VALUES (?, ?, ?, ?)
            `).run(fName, lName, phoneVal, roleId)

            const empId = database.prepare('SELECT last_insert_rowid() as id').get().id

            logQuery({
              type: 'INSERT',
              table: 'employees',
              sql: `INSERT INTO employees (employeeFName, employeeLNAME, phone, roleID) VALUES ('${fName}', '${lName}', '${phoneVal}', ${roleId});`,
              summary: `เพิ่มข้อมูลพนักงาน #${empId}: ${fName} ${lName} (${roleName})`
            })

            // 2. สร้างบัญชีผู้ใช้ในตาราง employee_accounts พร้อม date_regis และรหัสผ่านที่แฮช (SHA-256)
            database.prepare(`
              INSERT INTO employee_accounts (employeeUserName, employeePwd, employeeID, date_regis)
              VALUES (?, ?, ?, datetime('now', 'localtime'))
            `).run(cleanUsername, hashedPwd, empId)

            logQuery({
              type: 'INSERT',
              table: 'employee_accounts',
              sql: `INSERT INTO employee_accounts (employeeUserName, employeePwd, employeeID, date_regis) VALUES ('${cleanUsername}', '[SHA-256 HASH]', ${empId}, datetime('now'));`,
              summary: `สร้างบัญชีผู้ใช้ '${cleanUsername}' สำหรับพนักงาน #${empId} (จัดเก็บรหัสผ่านเป็น SHA-256 Hash)`
            })

            const regisDate = database.prepare('SELECT date_regis FROM employee_accounts WHERE employeeUserName = ?').get(cleanUsername)?.date_regis || new Date().toISOString()

            logMutation(
              'INSERT',
              'employees',
              `INSERT INTO employees (employeeFName, employeeLNAME, phone, roleID) VALUES ('${fName}', '${lName}', '${phoneVal}', ${roleId});\nINSERT INTO employee_accounts (employeeUserName, employeePwd, employeeID, date_regis) VALUES ('${cleanUsername}', '${hashedPwd}', ${empId}, datetime('now'));`,
              `ลงทะเบียนพนักงานใหม่ '${fName} ${lName}' ตำแหน่ง ${roleName} บัญชี '${cleanUsername}' ลง somchai.db (รหัสผ่านจัดเก็บเป็น SHA-256 Hash)`
            )

            return {
              ok: true,
              employeeId: empId,
              username: cleanUsername,
              displayName: `${fName} ${lName}`.trim(),
              role: roleName,
              dateRegis: regisDate
            }
          })
          return sendJson(200, resData)
        } catch (err) {
          return sendJson(500, { error: 'เกิดข้อผิดพลาดในการลงทะเบียน: ' + err.message })
        }
      }

      // รีเซ็ตฐานข้อมูลเป็น seed.sql (Transaction: RESET_DATABASE)
      if (pathname === '/api/reset') {
        try {
          runTransaction('RESET_DATABASE', 'รีเซ็ตข้อมูลเริ่มต้น 13 ตารางตาม schema.sql และ seed.sql', () => {
            initSchemaAndSeed(true)
          })
          return sendJson(200, { ok: true, message: 'Reset somchai.db to initial seed data' })
        } catch (err) {
          return sendJson(500, { error: 'เกิดข้อผิดพลาดในการรีเซ็ต: ' + err.message })
        }
      }

      // ล้างประวัติ Logs, Queries และ Transactions ทั้งหมด
      if (pathname === '/api/logs/clear') {
        clearAllLogs()
        return sendJson(200, { ok: true, message: 'ล้างประวัติ Logs, Queries และ Transactions เรียบร้อย' })
      }

      return sendJson(404, { error: 'Not found' })
    })
    return
  }

  // Not an API route
  return false
}

// Vite Plugin Helper
export function sqlitePlugin() {
  return {
    name: 'somchai-sqlite-plugin',
    configureServer(server) {
      getDatabase()
      console.log(`[SQLite Plugin] Connected to real database file: ${DB_PATH}`)

      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          handleApiRequest(req, res)
        } else {
          next()
        }
      })
    }
  }
}
