-- ============================================================================
-- SomchaiKitchen Initial Seed Data
-- Based on Somchai ER Diagram (Chen's Notation)
-- ============================================================================

-- 1. Roles
INSERT INTO roles (roleID, roleName) VALUES
(1, 'Admin'),
(2, 'Kitchen'),
(3, 'Staff')
ON CONFLICT (roleID) DO NOTHING;

-- 2. Employees
INSERT INTO employees (employeeID, employeeFName, employeeLNAME, phone, roleID) VALUES
(1, 'สมชาย', 'ใจดี', '0812345678', 1),
(2, 'กานดา', 'ครัวเอก', '0891112233', 2),
(3, 'วิชัย', 'บริการดี', '0865556677', 3)
ON CONFLICT (employeeID) DO NOTHING;

-- 3. Employee Accounts (รหัสผ่าน '1234' เข้ารหัส SHA-256)
INSERT INTO employee_accounts (employeeUserName, employeePwd, employeeID, date_regis) VALUES
('admin', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 1, '2026-01-01 08:00:00'),
('kitchen', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 2, '2026-01-05 08:00:00'),
('staff', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 3, '2026-01-10 08:00:00')
ON CONFLICT (employeeUserName) DO NOTHING;

-- 4. Menu Categories
INSERT INTO menu_categories (menuCateID, cateName) VALUES
(1, 'จานหลัก'),
(2, 'ของทานเล่น'),
(3, 'ของหวาน'),
(4, 'เครื่องดื่ม'),
(5, 'ต้มและแกง'),
(6, 'เมนูเส้น')
ON CONFLICT (menuCateID) DO NOTHING;

-- 5. Menus
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
(12, 'น้ำมะนาวโซดา', 40.00, '/food/lime-soda.jpg', 'AVAILABLE', 4, 1)
ON CONFLICT (menuID) DO NOTHING;

-- 6. Order Options
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
(12, 'แยกน้ำแข็ง', 0.00)
ON CONFLICT (optionID) DO NOTHING;

-- 7. Restaurant Tables
INSERT INTO restaurant_tables (tableID, tableNum, tableStatus, statusCall) VALUES
(1, '1', 'AVAILABLE', false),
(2, '2', 'AVAILABLE', false),
(3, '3', 'AVAILABLE', false),
(4, '4', 'AVAILABLE', false),
(5, '5', 'AVAILABLE', false),
(6, '6', 'AVAILABLE', false),
(7, '7', 'AVAILABLE', false),
(8, '8', 'AVAILABLE', false)
ON CONFLICT (tableID) DO NOTHING;

-- 8. Payment Types
INSERT INTO payment_types (paymentTypeID, paymentTypeName) VALUES
(1, 'เงินสด'),
(2, 'สแกน QR / พร้อมเพย์'),
(3, 'บัตรเครดิต')
ON CONFLICT (paymentTypeID) DO NOTHING;

-- Reset Sequences to ensure next inserts don't collide with seed IDs
SELECT setval(pg_get_serial_sequence('roles', 'roleid'), coalesce(max(roleID), 1)) FROM roles;
SELECT setval(pg_get_serial_sequence('employees', 'employeeid'), coalesce(max(employeeID), 1)) FROM employees;
SELECT setval(pg_get_serial_sequence('menu_categories', 'menucateid'), coalesce(max(menuCateID), 1)) FROM menu_categories;
SELECT setval(pg_get_serial_sequence('menus', 'menuid'), coalesce(max(menuID), 1)) FROM menus;
SELECT setval(pg_get_serial_sequence('order_options', 'optionid'), coalesce(max(optionID), 1)) FROM order_options;
SELECT setval(pg_get_serial_sequence('restaurant_tables', 'tableid'), coalesce(max(tableID), 1)) FROM restaurant_tables;
SELECT setval(pg_get_serial_sequence('payment_types', 'paymenttypeid'), coalesce(max(paymentTypeID), 1)) FROM payment_types;
