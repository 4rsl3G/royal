-- Royal Dreams Topup Schema

CREATE DATABASE IF NOT EXISTS royal_dreams CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE royal_dreams;

-- 1) admins
CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(30) DEFAULT NULL,
  role ENUM('superadmin','admin') NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- 2) settings
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(80) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB;

-- 3) products
CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  game_name VARCHAR(120) NOT NULL DEFAULT 'Royal Dreams',
  image VARCHAR(255) DEFAULT NULL,
  price_type ENUM('fixed','per_item') NOT NULL DEFAULT 'fixed',
  price BIGINT NOT NULL DEFAULT 0,
  price_per_item BIGINT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_active_sort (active, sort_order)
) ENGINE=InnoDB;

-- 4) orders
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL UNIQUE,
  product_id BIGINT UNSIGNED NOT NULL,
  game_id VARCHAR(64) NOT NULL,
  nickname VARCHAR(80) DEFAULT NULL,
  whatsapp VARCHAR(30) NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  unit_price BIGINT NOT NULL DEFAULT 0,
  gross_amount BIGINT NOT NULL DEFAULT 0,
  pay_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  fulfill_status ENUM('waiting','processing','done','rejected') NOT NULL DEFAULT 'waiting',
  admin_note TEXT NULL,
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  snap_token TEXT NULL,
  midtrans_raw JSON NULL,
  whatsapp_pay_sent_at DATETIME NULL,
  whatsapp_done_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_created (created_at),
  KEY idx_pay_fulfill (pay_status, fulfill_status),
  CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_admin FOREIGN KEY (confirmed_by) REFERENCES admins(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 5) sessions table for connect-mysql2
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) NOT NULL,
  expires INT(11) UNSIGNED NOT NULL,
  data MEDIUMTEXT,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB;

-- Default settings
INSERT INTO settings (`key`, `value`) VALUES
('site_name', 'Royal Dreams'),
('brand_tagline', 'Topup Chip Royal Dreams cepat, aman, dan resmi.'),
('midtrans_is_production', 'false'),
('midtrans_server_key', ''),
('midtrans_client_key', ''),
('whatsapp_enabled', 'false'),
('whatsapp_template_pay', '✅ Pembayaran sukses!\nOrder: {order_id}\nProduk: {product}\nTotal: {total}\nStatus: {pay_status}\nGame ID: {game_id}\nNick: {nickname}\n\nTerima kasih!'),
('whatsapp_template_done', '🎉 Pesanan selesai!\nOrder: {order_id}\nProduk: {product}\nTotal: {total}\nGame ID: {game_id}\nNick: {nickname}\nCatatan: {admin_note}\n\nSelamat bermain!'),
('whatsapp_template_rejected', '❌ Pesanan ditolak.\nOrder: {order_id}\nProduk: {product}\nTotal: {total}\nGame ID: {game_id}\nNick: {nickname}\nAlasan: {admin_note}\n\nSilakan hubungi admin.')
ON DUPLICATE KEY UPDATE value=VALUES(value);

-- Sample products (optional)
INSERT INTO products (sku, name, game_name, image, price_type, price, price_per_item, active, sort_order)
VALUES
('RD-CHIP-100', '100M Chip Royal Dreams', 'Royal Dreams', NULL, 'fixed', 10000, 0, 1, 1),
('RD-CHIP-250', '500M Chip Royal Dreams', 'Royal Dreams', NULL, 'fixed', 35000, 0, 1, 2),
('RD-CHIP-1K', '1B Chip Royal Dreams', 'Royal Dreams', NULL, 'fixed', 65000, 0, 1, 3)
ON DUPLICATE KEY UPDATE name=VALUES(name);
