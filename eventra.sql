-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 28, 2026 at 08:12 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.5.1

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `eventra`
--

-- --------------------------------------------------------

--
-- Table structure for table `email_verification_tokens`
--

CREATE TABLE `email_verification_tokens` (
  `id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `token_hash` text DEFAULT NULL,
  `lookup_hash` text DEFAULT NULL,
  `expires_at` text DEFAULT NULL,
  `created_at` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `eo_profiles`
--

CREATE TABLE `eo_profiles` (
  `id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `org_name` text DEFAULT NULL,
  `description` text DEFAULT NULL,
  `phone` text DEFAULT NULL,
  `status` text DEFAULT NULL,
  `created_at` text DEFAULT NULL,
  `updated_at` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `events`
--

CREATE TABLE `events` (
  `id` varchar(255) NOT NULL,
  `eo_profile_id` varchar(255) DEFAULT NULL,
  `title` text DEFAULT NULL,
  `description` text DEFAULT NULL,
  `category` text DEFAULT NULL,
  `banner_image` text DEFAULT NULL,
  `location` text DEFAULT NULL,
  `location_url` text DEFAULT NULL,
  `start_date` text DEFAULT NULL,
  `end_date` text DEFAULT NULL,
  `status` text DEFAULT NULL,
  `is_resale_allowed` tinyint(1) NOT NULL DEFAULT 0,
  `is_reminder_sent` tinyint(1) DEFAULT 0,
  `created_at` text DEFAULT NULL,
  `updated_at` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `event_participants`
--

CREATE TABLE `event_participants` (
  `id` varchar(50) NOT NULL,
  `event_id` varchar(50) NOT NULL,
  `user_id` varchar(50) NOT NULL,
  `ticket_id` varchar(50) NOT NULL,
  `is_visible` tinyint(1) DEFAULT 1,
  `joined_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `magic_link_tokens`
--

CREATE TABLE `magic_link_tokens` (
  `id` varchar(255) NOT NULL,
  `email` text DEFAULT NULL,
  `token_hash` text DEFAULT NULL,
  `lookup_hash` text DEFAULT NULL,
  `redirect_url` text DEFAULT NULL,
  `expires_at` text DEFAULT NULL,
  `created_at` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `total_amount` int(11) DEFAULT NULL,
  `status` text DEFAULT NULL,
  `payment_method` text DEFAULT NULL,
  `payment_token` text DEFAULT NULL,
  `paid_at` text DEFAULT NULL,
  `expired_at` text DEFAULT NULL,
  `created_at` text DEFAULT NULL,
  `promo_code_id` varchar(255) DEFAULT NULL,
  `discount_amount` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `id` varchar(255) NOT NULL,
  `order_id` varchar(255) DEFAULT NULL,
  `ticket_type_id` varchar(255) DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `unit_price` int(11) DEFAULT NULL,
  `subtotal` int(11) DEFAULT NULL,
  `attendee_details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`attendee_details`)),
  `active_phase_id` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `otp_codes`
--

CREATE TABLE `otp_codes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `code` varchar(10) NOT NULL,
  `type` enum('verify_email','reset_password') NOT NULL,
  `is_used` tinyint(1) NOT NULL DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

CREATE TABLE `password_reset_tokens` (
  `id` varchar(255) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `token_hash` text DEFAULT NULL,
  `lookup_hash` text DEFAULT NULL,
  `expires_at` text DEFAULT NULL,
  `created_at` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `promo_codes`
--

CREATE TABLE `promo_codes` (
  `id` varchar(255) NOT NULL,
  `event_id` varchar(255) NOT NULL,
  `code` varchar(50) NOT NULL,
  `description` varchar(200) DEFAULT NULL,
  `discount_type` enum('percentage','flat') NOT NULL,
  `discount_value` int(11) NOT NULL,
  `min_purchase` int(11) NOT NULL DEFAULT 0,
  `max_discount` int(11) DEFAULT NULL,
  `quota` int(11) DEFAULT NULL,
  `used_count` int(11) NOT NULL DEFAULT 0,
  `max_per_user` int(11) NOT NULL DEFAULT 1,
  `applies_to` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`applies_to`)),
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `promo_code_usages`
--

CREATE TABLE `promo_code_usages` (
  `id` varchar(255) NOT NULL,
  `promo_code_id` varchar(255) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `order_id` varchar(255) NOT NULL,
  `discount_amount` int(11) NOT NULL,
  `used_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `custom_form_fields`
--

CREATE TABLE `custom_form_fields` (
  `id` varchar(36) NOT NULL,
  `event_id` varchar(255) NOT NULL,
  `label` varchar(200) NOT NULL,
  `field_type` enum('text','number','select','radio') NOT NULL DEFAULT 'text',
  `options` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`options`)),
  `is_required` tinyint(1) NOT NULL DEFAULT 1,
  `applies_to` enum('order','per_ticket') NOT NULL DEFAULT 'per_ticket',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `custom_form_answers`
--

CREATE TABLE `custom_form_answers` (
  `id` varchar(36) NOT NULL,
  `field_id` varchar(36) NOT NULL,
  `order_id` varchar(255) NOT NULL,
  `ticket_id` varchar(255) DEFAULT NULL,
  `answer` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ticket_pricing_phases`
--

CREATE TABLE `ticket_pricing_phases` (
  `id` varchar(255) NOT NULL,
  `ticket_type_id` varchar(255) NOT NULL,
  `phase_name` varchar(100) NOT NULL,
  `price` int(11) NOT NULL,
  `quota` int(11) DEFAULT NULL,
  `quota_sold` int(11) NOT NULL DEFAULT 0,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `resale_listings`
--

CREATE TABLE `resale_listings` (
  `id` varchar(50) NOT NULL,
  `ticket_id` varchar(50) NOT NULL,
  `seller_id` varchar(50) NOT NULL,
  `original_price` int(11) NOT NULL,
  `asking_price` int(11) NOT NULL,
  `max_allowed_price` int(11) NOT NULL,
  `platform_fee` int(11) NOT NULL,
  `seller_receives` int(11) NOT NULL,
  `note` varchar(200) DEFAULT NULL,
  `status` enum('OPEN','SOLD','CANCELLED','EXPIRED') DEFAULT 'OPEN',
  `listed_at` datetime DEFAULT current_timestamp(),
  `sold_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `expired_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `resale_orders`
--

CREATE TABLE `resale_orders` (
  `id` varchar(50) NOT NULL,
  `resale_listing_id` varchar(50) NOT NULL,
  `buyer_id` varchar(50) NOT NULL,
  `total_paid` int(11) NOT NULL,
  `platform_fee` int(11) NOT NULL,
  `seller_receives` int(11) NOT NULL,
  `attendee_details` text DEFAULT NULL,
  `status` enum('PENDING','PAID','CANCELLED','EXPIRED') DEFAULT 'PENDING',
  `payment_token` varchar(255) DEFAULT NULL,
  `midtrans_order_id` varchar(100) DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `expired_at` datetime NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `seat_social_profiles`
--

CREATE TABLE `seat_social_profiles` (
  `id` varchar(50) NOT NULL,
  `user_id` varchar(50) NOT NULL,
  `bio` text DEFAULT NULL,
  `instagram_handle` varchar(50) DEFAULT NULL,
  `display_name` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `seller_balances`
--

CREATE TABLE `seller_balances` (
  `id` varchar(50) NOT NULL,
  `user_id` varchar(50) NOT NULL,
  `balance` int(11) DEFAULT 0,
  `total_earned` int(11) DEFAULT 0,
  `total_withdrawn` int(11) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `seller_balance_transactions`
--

CREATE TABLE `seller_balance_transactions` (
  `id` varchar(50) NOT NULL,
  `seller_balance_id` varchar(50) NOT NULL,
  `user_id` varchar(50) NOT NULL,
  `type` varchar(60) NOT NULL,
  `amount` int(11) NOT NULL DEFAULT 0,
  `description` varchar(255) DEFAULT NULL,
  `reference_id` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tickets`
--

CREATE TABLE `tickets` (
  `id` varchar(255) NOT NULL,
  `order_id` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `ticket_type_id` varchar(255) DEFAULT NULL,
  `qr_code` text DEFAULT NULL,
  `status` enum('ACTIVE','USED','CANCELLED','LISTED_FOR_RESALE','TRANSFERRED') DEFAULT 'ACTIVE',
  `is_used` int(11) DEFAULT NULL,
  `used_at` text DEFAULT NULL,
  `created_at` text DEFAULT NULL,
  `quantity` int(11) DEFAULT 1,
  `attendee_details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`attendee_details`)),
  `order_item_id` varchar(255) DEFAULT NULL,
  `bundle_index` int(11) NOT NULL DEFAULT 1,
  `bundle_total` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ticket_types`
--

CREATE TABLE `ticket_types` (
  `id` varchar(255) NOT NULL,
  `event_id` varchar(255) DEFAULT NULL,
  `name` text DEFAULT NULL,
  `description` text DEFAULT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `quota` int(11) DEFAULT NULL,
  `sold` int(11) DEFAULT NULL,
  `max_per_order` int(11) DEFAULT NULL,
  `max_per_account` int(11) NOT NULL DEFAULT 0,
  `is_bundle` tinyint(1) NOT NULL DEFAULT 0,
  `bundle_qty` int(11) NOT NULL DEFAULT 1,
  `sale_start_date` text DEFAULT NULL,
  `sale_end_date` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` varchar(255) NOT NULL,
  `email` text DEFAULT NULL,
  `name` text DEFAULT NULL,
  `image` text DEFAULT NULL,
  `role` text DEFAULT NULL,
  `created_at` text DEFAULT NULL,
  `updated_at` text DEFAULT NULL,
  `email_verified` int(11) DEFAULT NULL,
  `password_hash` text DEFAULT NULL,
  `display_name` text DEFAULT NULL,
  `avatar_url` text DEFAULT NULL,
  `phone` text DEFAULT NULL,
  `phone_verified` int(11) DEFAULT NULL,
  `auth_provider` varchar(20) DEFAULT 'email',
  `is_email_verified` tinyint(1) DEFAULT 0,
  `metadata` text DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `username_changed_at` datetime DEFAULT NULL,
  `is_profile_public` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `email`, `name`, `image`, `role`, `created_at`, `updated_at`, `email_verified`, `password_hash`, `display_name`, `avatar_url`, `phone`, `phone_verified`, `auth_provider`, `is_email_verified`, `metadata`, `username`, `username_changed_at`, `is_profile_public`) VALUES
('user_3db2858d60f4', 'superadmin@eventra.com', 'Super Admin', NULL, 'SUPER_ADMIN', '2026-03-27 16:46:30', '2026-03-27 16:46:30', 1, '$2b$10$4S9llAZh56x2m3lvf/cMtObxq3UtGfk3LqfT3ffpEx0R8ntL6IOOO', NULL, NULL, NULL, 0, 'email', 1, NULL, NULL, NULL, 1);

-- --------------------------------------------------------

--
-- Table structure for table `waves`
--

CREATE TABLE `waves` (
  `id` varchar(50) NOT NULL,
  `event_id` varchar(50) NOT NULL,
  `sender_id` varchar(50) NOT NULL,
  `receiver_id` varchar(50) NOT NULL,
  `message` varchar(100) DEFAULT NULL,
  `status` enum('PENDING','ACCEPTED','IGNORED') DEFAULT 'PENDING',
  `created_at` datetime DEFAULT current_timestamp(),
  `responded_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `withdrawals`
--

CREATE TABLE `withdrawals` (
  `id` varchar(50) NOT NULL,
  `seller_balance_id` varchar(50) NOT NULL,
  `user_id` varchar(50) NOT NULL,
  `amount` int(11) NOT NULL,
  `bank_name` varchar(50) NOT NULL,
  `account_number` varchar(50) NOT NULL,
  `account_name` varchar(100) NOT NULL,
  `status` enum('PENDING','PROCESSING','COMPLETED','REJECTED') DEFAULT 'PENDING',
  `processed_at` datetime DEFAULT NULL,
  `rejected_reason` varchar(255) DEFAULT NULL,
  `admin_note` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `receipt_url` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `email_verification_tokens`
--
ALTER TABLE `email_verification_tokens`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `eo_profiles`
--
ALTER TABLE `eo_profiles`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `events`
--
ALTER TABLE `events`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `event_participants`
--
ALTER TABLE `event_participants`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ticket_id` (`ticket_id`),
  ADD UNIQUE KEY `event_id` (`event_id`,`user_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `magic_link_tokens`
--
ALTER TABLE `magic_link_tokens`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `promo_codes`
--
ALTER TABLE `promo_codes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_event_code` (`event_id`,`code`),
  ADD KEY `idx_promo_active` (`is_active`),
  ADD KEY `idx_promo_event` (`event_id`);

--
-- Indexes for table `promo_code_usages`
--
ALTER TABLE `promo_code_usages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_promo_usage_order` (`order_id`),
  ADD KEY `idx_promo_usage_user` (`user_id`),
  ADD KEY `idx_promo_usage_code` (`promo_code_id`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `otp_codes`
--
ALTER TABLE `otp_codes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_otp_user_type_created` (`user_id`,`type`,`created_at`),
  ADD KEY `idx_otp_lookup` (`user_id`,`code`,`type`,`is_used`,`expires_at`);

--
-- Indexes for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `custom_form_fields`
--
ALTER TABLE `custom_form_fields`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_custom_form_event` (`event_id`);

--
-- Indexes for table `custom_form_answers`
--
ALTER TABLE `custom_form_answers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_custom_form_answer_field` (`field_id`),
  ADD KEY `idx_custom_form_answer_order` (`order_id`),
  ADD KEY `idx_custom_form_answer_ticket` (`ticket_id`);

--
-- Indexes for table `resale_listings`
--
ALTER TABLE `resale_listings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_resale_status` (`status`),
  ADD KEY `idx_resale_seller` (`seller_id`),
  ADD KEY `resale_listings_ticket_id_fk` (`ticket_id`);

--
-- Indexes for table `resale_orders`
--
ALTER TABLE `resale_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `resale_listing_id` (`resale_listing_id`),
  ADD UNIQUE KEY `midtrans_order_id` (`midtrans_order_id`),
  ADD KEY `idx_resale_order_buyer` (`buyer_id`),
  ADD KEY `idx_resale_order_status` (`status`);

--
-- Indexes for table `seat_social_profiles`
--
ALTER TABLE `seat_social_profiles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- Indexes for table `seller_balances`
--
ALTER TABLE `seller_balances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- Indexes for table `seller_balance_transactions`
--
ALTER TABLE `seller_balance_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_seller_balance_transactions_user` (`user_id`),
  ADD KEY `idx_seller_balance_transactions_created` (`created_at`),
  ADD UNIQUE KEY `uq_seller_balance_transactions_ref` (`user_id`,`type`,`reference_id`),
  ADD KEY `idx_seller_balance_transactions_balance` (`seller_balance_id`);

--
-- Indexes for table `tickets`
--
ALTER TABLE `tickets`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `ticket_types`
--
ALTER TABLE `ticket_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `ticket_pricing_phases`
--
ALTER TABLE `ticket_pricing_phases`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ticket_type` (`ticket_type_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indexes for table `waves`
--
ALTER TABLE `waves`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `sender_id` (`sender_id`,`receiver_id`),
  ADD KEY `event_id` (`event_id`),
  ADD KEY `receiver_id` (`receiver_id`);

--
-- Indexes for table `withdrawals`
--
ALTER TABLE `withdrawals`
  ADD PRIMARY KEY (`id`),
  ADD KEY `seller_balance_id` (`seller_balance_id`),
  ADD KEY `idx_withdrawal_user` (`user_id`),
  ADD KEY `idx_withdrawal_status` (`status`);

--
-- Constraints for dumped tables
--

--
-- Constraints for table `event_participants`
--
ALTER TABLE `event_participants`
  ADD CONSTRAINT `event_participants_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `event_participants_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `event_participants_ibfk_3` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `custom_form_fields`
--
ALTER TABLE `custom_form_fields`
  ADD CONSTRAINT `custom_form_fields_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `custom_form_answers`
--
ALTER TABLE `custom_form_answers`
  ADD CONSTRAINT `custom_form_answers_ibfk_1` FOREIGN KEY (`field_id`) REFERENCES `custom_form_fields` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `custom_form_answers_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `custom_form_answers_ibfk_3` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `resale_listings`
--
ALTER TABLE `resale_listings`
  ADD CONSTRAINT `resale_listings_ibfk_2` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `resale_listings_ticket_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `promo_codes`
--
ALTER TABLE `promo_codes`
  ADD CONSTRAINT `promo_codes_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `promo_code_usages`
--
ALTER TABLE `promo_code_usages`
  ADD CONSTRAINT `promo_code_usages_ibfk_1` FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `promo_code_usages_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `promo_code_usages_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `resale_orders`
--
ALTER TABLE `resale_orders`
  ADD CONSTRAINT `resale_orders_ibfk_1` FOREIGN KEY (`resale_listing_id`) REFERENCES `resale_listings` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `resale_orders_ibfk_2` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `seat_social_profiles`
--
ALTER TABLE `seat_social_profiles`
  ADD CONSTRAINT `seat_social_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `otp_codes`
--
ALTER TABLE `otp_codes`
  ADD CONSTRAINT `otp_codes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `seller_balances`
--
ALTER TABLE `seller_balances`
  ADD CONSTRAINT `seller_balances_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `seller_balance_transactions`
--
ALTER TABLE `seller_balance_transactions`
  ADD CONSTRAINT `seller_balance_transactions_ibfk_1` FOREIGN KEY (`seller_balance_id`) REFERENCES `seller_balances` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `seller_balance_transactions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `ticket_pricing_phases`
--
ALTER TABLE `ticket_pricing_phases`
  ADD CONSTRAINT `ticket_pricing_phases_ibfk_1` FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `waves`
--
ALTER TABLE `waves`
  ADD CONSTRAINT `waves_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `waves_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `event_participants` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `waves_ibfk_3` FOREIGN KEY (`receiver_id`) REFERENCES `event_participants` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `withdrawals`
--
ALTER TABLE `withdrawals`
  ADD CONSTRAINT `withdrawals_ibfk_1` FOREIGN KEY (`seller_balance_id`) REFERENCES `seller_balances` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `withdrawals_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- AUTO_INCREMENT for dumped tables
--
ALTER TABLE `otp_codes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
