-- ========================================================
-- Database Schema for FaizanBody Project
-- ========================================================

CREATE DATABASE IF NOT EXISTS faizanbody_db;
USE faizanbody_db;

-- 1. Example Truck Body Models Table
CREATE TABLE IF NOT EXISTS vehicle_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(100) NOT NULL,
  status ENUM('Active', 'Pending Review', 'Archived') DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Workers Table
CREATE TABLE IF NOT EXISTS workers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  mobile VARCHAR(30) NULL,
  aadhar_card LONGTEXT NULL,
  coming_date DATE NOT NULL,
  going_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Worker Transactions / Jama-Udhar Khata Table
CREATE TABLE IF NOT EXISTS worker_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  worker_id INT NOT NULL,
  type VARCHAR(50) NOT NULL COMMENT 'upad, payment, salary',
  amount DECIMAL(10, 2) NOT NULL,
  date DATE NOT NULL,
  notes VARCHAR(255) NULL,
  payment_mode VARCHAR(50) DEFAULT 'Cash',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_worker_tx_worker (worker_id),
  INDEX idx_worker_tx_date (date),
  INDEX idx_worker_tx_type (type)
);





