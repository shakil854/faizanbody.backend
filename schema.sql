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
  coming_date DATE NOT NULL,
  going_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed initial demo workers
INSERT INTO workers (name, coming_date, going_date) VALUES
('Mohammad Faizan', '2025-01-10', NULL),
('Rashid Ahmed', '2025-02-01', NULL),
('Ramesh Sharma', '2024-10-15', '2025-03-15')
ON DUPLICATE KEY UPDATE name=name;

