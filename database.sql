DROP DATABASE IF EXISTS obsidian_db;
CREATE DATABASE obsidian_db;
USE obsidian_db;

-- --- USERS FEATURE ---
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    tournaments_won INT DEFAULT 0,
    matches_played INT DEFAULT 0,
    reputation DECIMAL(3, 1) DEFAULT 5.0,
    is_admin BOOLEAN DEFAULT FALSE, -- Added directly here!
    profile_pic_url LONGTEXT ,
    banner_url LONGTEXT ,
    riot_tracker_id VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TOURNAMENTS FEATURE ---
CREATE TABLE tournaments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_title VARCHAR(50) NOT NULL,
    tournament_name VARCHAR(100) NOT NULL,
    prize_pool DECIMAL(10, 2),
    event_date DATE,
    status VARCHAR(20) DEFAULT 'Upcoming'
);

-- --- MARKETPLACE FEATURE (Curated Obsidian Store) ---
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'hardware' or 'account'
    price DECIMAL(10,2) NOT NULL,
    image_url VARCHAR(255),
    stock_status VARCHAR(50) DEFAULT 'In Stock', 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- CHATS FEATURE ---
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    message_content TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- INITIAL DATA INJECTIONS
-- ==========================================

-- 1. Insert Global Lounge for Chat Route 8 (ID updated to 9999 to match server.js)
INSERT INTO users (id, username, email, password, is_admin) 
VALUES (9999, 'GLOBAL LOUNGE', 'global@obsidian.local', 'locked_account', FALSE);

-- 2. Insert the Official Obsidian Inventory
INSERT INTO products (title, category, price, image_url) VALUES
('Logitech G502 Hero', 'hardware', 12500.00, 'logitech.jpg'),
('Valo Ascendant Smurf', 'account', 4500.00, 'asc.png'),
('Wooting 60HE', 'hardware', 55000.00, 'wooting.jpg'),
('HyperX Cloud II Headset', 'hardware', 18000.00, 'hyperX.jpg'),
('CS2 Prime Account - Global Elite', 'account', 8500.00, 'cs2_rank.png'),
('Razer DeathAdder V3 Pro', 'hardware', 32000.00, 'razer.jpg');

-- 3. Insert Upcoming Tournaments
INSERT INTO tournaments (game_title, tournament_name, prize_pool, event_date, status) VALUES 
('Valorant', 'Valorant Masters Toronto', 5000.00, '2026-07-12', 'Registration Open'),
('CS2', 'CS2 World Cup Riyadh', 50000.00, '2025-07-20', 'Upcoming'),
('Fortnite', 'Fortnite World Cup', 30000.00, '2026-04-12', 'Registration Open');

-- Display the active users to confirm it worked!
SELECT * FROM users;