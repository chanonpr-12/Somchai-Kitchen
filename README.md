# Somchai Kitchen (ครัวสมชาย) 

ระบบจัดการร้านอาหาร (POS & Kitchen Management) พร้อมระบบฐานข้อมูล Local SQLite และเครื่องมือติดตาม SQL Queries & Transactions สำหรับการนำเสนอเชิงเทคนิค

---

## ฟีเจอร์หลักของระบบ

1. **ระบบลูกค้า (Customer Order - `/`)**
   - บังคับเลือกโต๊ะก่อนสั่งอาหาร (สถานะโต๊ะเปลี่ยนเป็นใช้งานทันทีเมื่อเลือก)
   - สั่งอาหารพร้อมเลือก Option พิเศษ (ไข่ดาว, พิเศษ, ไม่ใส่ผัก ฯลฯ)
   - คำนวณราคาย่อย, VAT 7% และยอดรวมอัตโนมัติ

2. **ระบบห้องครัว (Kitchen Display - `/kitchen`)**
   - แสดงคิวออเดอร์แบบเรียลไทม์
   - ปรับสถานะอาหาร (รอดำเนินการ -> กำลังปรุง -> ปรุงเสร็จ)

3. **ระบบพนักงานและแคชเชียร์ (Staff & Cashier - `/staff`)**
   - ดูผังโต๊ะและสถานะแบบเรียลไทม์
   - เรียกดูบิล แยกชำระเงิน และปิดบิล (สถานะโต๊ะคืนกลับเป็นว่างอัตโนมัติ)
   - ปลอดภัยด้วยระบบยืนยันตัวตน (Authentication)

4. **ระบบมอนิเตอร์ฐานข้อมูล (Database Monitor - `/database`)**
   - ทำงานบน **Local SQLite (`database/somchai.db`)** จริง 100%
   - มี **โหมดนำเสนอ (Step-by-Step Flow)** สรุปกระบวนการทำงานและคำสั่ง SQL เป็นขั้นตอนเข้าใจง่าย
   - มี **โหมดโค้ด SQL เต็ม (Stream)** สำหรับดู Query Logs, Execution Time (ms) และ Transaction Commit/Rollback

---

## บัญชีผู้ใช้สำหรับทดสอบ (Test Accounts)

| บทบาท (Role) | Username | Password |
|:---|:---|:---|
| Admin | `admin` | `admin` |
| Kitchen | `kitchen` | `kitchen` |
| Staff | `staff` | `staff` |

*(หมายเหตุ: รหัสผ่านในระบบถูกเข้ารหัสจัดเก็บด้วย SHA-256)*

---

## วิธีติดตั้งและเริ่มใช้งาน

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. เริ่มต้นเซิร์ฟเวอร์
```bash
npm run dev
```

เปิดเว็บเบราว์เซอร์ไปที่ `http://localhost:5173`

---

## โครงสร้างฐานข้อมูล

ระบบอิงตามโครงสร้าง ER Diagram 14 ตารางหลัก:
- `roles`, `employees`, `employee_accounts`, `login_history`
- `menu_categories`, `menus`, `order_options`
- `restaurant_tables`, `orders`, `order_lists`, `order_list_options`
- `payments`, `payment_types`, `payment_details`
