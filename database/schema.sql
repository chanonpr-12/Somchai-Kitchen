-- ============================================================================
-- SomchaiKitchen Database Schema (PostgreSQL / Supabase 3NF)
-- Based on Somchai ER Diagram (Chen's Notation)
-- ============================================================================

-- Drop tables if exist (Reverse order of dependencies)
DROP TABLE IF EXISTS payment_details CASCADE;
DROP TABLE IF EXISTS payment_types CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_list_options CASCADE;
DROP TABLE IF EXISTS order_lists CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS restaurant_tables CASCADE;
DROP TABLE IF EXISTS order_options CASCADE;
DROP TABLE IF EXISTS menus CASCADE;
DROP TABLE IF EXISTS menu_categories CASCADE;
DROP TABLE IF EXISTS login_history CASCADE;
DROP TABLE IF EXISTS employee_accounts CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- 1. Roles & Employees
CREATE TABLE roles (
    roleID SERIAL PRIMARY KEY,
    roleName VARCHAR(50) NOT NULL
);

CREATE TABLE employees (
    employeeID SERIAL PRIMARY KEY,
    employeeFName VARCHAR(100) NOT NULL,
    employeeLNAME VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    roleID INT NOT NULL REFERENCES roles(roleID)
);

CREATE TABLE employee_accounts (
    employeeUserName VARCHAR(50) PRIMARY KEY,
    employeePwd VARCHAR(255) NOT NULL,
    employeeID INT UNIQUE NOT NULL REFERENCES employees(employeeID) ON DELETE CASCADE,
    date_regis TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_history (
    loginID SERIAL PRIMARY KEY,
    loginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ipAddress VARCHAR(45),
    employeeUserName VARCHAR(50) NOT NULL REFERENCES employee_accounts(employeeUserName) ON DELETE CASCADE
);

-- 2. Menu Catalog
CREATE TABLE menu_categories (
    menuCateID SERIAL PRIMARY KEY,
    cateName VARCHAR(100) NOT NULL
);

CREATE TABLE menus (
    menuID SERIAL PRIMARY KEY,
    menuName VARCHAR(150) NOT NULL,
    menuPrice NUMERIC(10, 2) NOT NULL,
    picture VARCHAR(255),
    menuStatus VARCHAR(20) DEFAULT 'AVAILABLE',
    menuCateID INT NOT NULL REFERENCES menu_categories(menuCateID),
    employeeID INT REFERENCES employees(employeeID),
    dateAdjust TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_options (
    optionID SERIAL PRIMARY KEY,
    optionName VARCHAR(100) NOT NULL,
    optionPrice NUMERIC(10, 2) DEFAULT 0.00
);

-- 3. Tables & Orders
CREATE TABLE restaurant_tables (
    tableID SERIAL PRIMARY KEY,
    tableNum VARCHAR(10) UNIQUE NOT NULL,
    tableStatus VARCHAR(20) DEFAULT 'AVAILABLE',
    statusCall BOOLEAN DEFAULT FALSE
);

CREATE TABLE orders (
    orderID SERIAL PRIMARY KEY,
    tableID INT NOT NULL REFERENCES restaurant_tables(tableID),
    orderTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    statusOrder VARCHAR(20) DEFAULT 'OPEN'
);

CREATE TABLE order_lists (
    orderListID SERIAL PRIMARY KEY,
    orderID INT NOT NULL REFERENCES orders(orderID) ON DELETE CASCADE,
    menuID INT NOT NULL REFERENCES menus(menuID),
    qty INT NOT NULL CHECK (qty > 0),
    menuPricePerList NUMERIC(10, 2) NOT NULL,
    statusOrderItem VARCHAR(20) DEFAULT 'PENDING',
    orderDescription TEXT
);

CREATE TABLE order_list_options (
    orderListID INT NOT NULL REFERENCES order_lists(orderListID) ON DELETE CASCADE,
    optionID INT NOT NULL REFERENCES order_options(optionID),
    applied_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (orderListID, optionID)
);

-- 4. Billing & Split Payments
CREATE TABLE payments (
    paymentID SERIAL PRIMARY KEY,
    orderID INT UNIQUE NOT NULL REFERENCES orders(orderID),
    paymentDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    statusPayment VARCHAR(20) DEFAULT 'PAID'
);

CREATE TABLE payment_types (
    paymentTypeID SERIAL PRIMARY KEY,
    paymentTypeName VARCHAR(50) NOT NULL
);

CREATE TABLE payment_details (
    paymentID INT NOT NULL REFERENCES payments(paymentID) ON DELETE CASCADE,
    paymentTypeID INT NOT NULL REFERENCES payment_types(paymentTypeID),
    amountPaid NUMERIC(10, 2) NOT NULL CHECK (amountPaid > 0),
    PRIMARY KEY (paymentID, paymentTypeID)
);

-- Enable RLS and permissive policies for direct Web App access (Demo / SA Presentation)
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_list_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_details ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE
  tbl text;
BEGIN
  FOR tbl IN 
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public full access" ON %I;', tbl);
    EXECUTE format('CREATE POLICY "Public full access" ON %I FOR ALL USING (true) WITH CHECK (true);', tbl);
  END LOOP;
END $$;
