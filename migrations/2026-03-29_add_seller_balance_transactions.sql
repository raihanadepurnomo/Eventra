-- Migration: add seller_balance_transactions table with indexes and foreign keys
-- Date: 2026-03-29

START TRANSACTION;

CREATE TABLE IF NOT EXISTS seller_balance_transactions (
  id varchar(50) NOT NULL,
  seller_balance_id varchar(50) NOT NULL,
  user_id varchar(50) NOT NULL,
  type varchar(60) NOT NULL,
  amount int(11) NOT NULL DEFAULT 0,
  description varchar(255) DEFAULT NULL,
  reference_id varchar(100) DEFAULT NULL,
  created_at datetime DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_seller_balance_transactions_user (user_id),
  KEY idx_seller_balance_transactions_created (created_at),
  KEY idx_seller_balance_transactions_balance (seller_balance_id),
  UNIQUE KEY uq_seller_balance_transactions_ref (user_id, type, reference_id),
  CONSTRAINT seller_balance_transactions_ibfk_1
    FOREIGN KEY (seller_balance_id) REFERENCES seller_balances (id)
    ON DELETE CASCADE,
  CONSTRAINT seller_balance_transactions_ibfk_2
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

COMMIT;
