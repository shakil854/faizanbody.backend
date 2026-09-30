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

-- Seed initial demo data
INSERT INTO vehicle_models (name, category, status) VALUES
('Truck Body Model Alpha', 'Heavy Duty', 'Active'),
('Tipper Body Model X', 'Tipper', 'Active'),
('Container Body Spec-Z', 'Container', 'Pending Review')
ON DUPLICATE KEY UPDATE name=name;
