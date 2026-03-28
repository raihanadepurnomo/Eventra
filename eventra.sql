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

--
-- Dumping data for table `eo_profiles`
--

INSERT INTO `eo_profiles` (`id`, `user_id`, `org_name`, `description`, `phone`, `status`, `created_at`, `updated_at`) VALUES
('eo_f4c0b23a', 'user_cc3791e11c01', 'EO Maju Jaya', 'Maju Terus', NULL, 'ACTIVE', '2026-03-28 07:25:06', NULL);

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
  `created_at` text DEFAULT NULL,
  `updated_at` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `events`
--

INSERT INTO `events` (`id`, `eo_profile_id`, `title`, `description`, `category`, `banner_image`, `location`, `location_url`, `start_date`, `end_date`, `status`, `is_resale_allowed`, `created_at`, `updated_at`) VALUES
('2b15839b-52a6-4aac-849a-e501caf38e78', 'eo_f4c0b23a', 'Makan Besar', 'Makan Makan', 'Festival', '/banner-image/event_1774682840529.png', 'JCC', 'https://share.google/RcX8nlLQdwjGrEO2w', '2026-04-03T07:26:00.000Z', '2026-04-06T07:26:00.000Z', 'PUBLISHED', 0, '2026-03-28 07:27:20', '2026-03-28 07:27:20');

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

--
-- Dumping data for table `event_participants`
--

INSERT INTO `event_participants` (`id`, `event_id`, `user_id`, `ticket_id`, `is_visible`, `joined_at`) VALUES
('a3456e01-bb45-448f-a81a-3fe34f9cbef3', '2b15839b-52a6-4aac-849a-e501caf38e78', 'user_6dd3e1bcc9d9', 'tkt_1b0hddr28', 1, '2026-03-28 14:28:23'),
('b9807f1b-f581-427c-a4f0-616a7e5c3124', '2b15839b-52a6-4aac-849a-e501caf38e78', 'user_9c30441f5fa3', 'tkt_kvsi8ajzd', 1, '2026-03-28 14:30:25');

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
  `created_at` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `user_id`, `total_amount`, `status`, `payment_method`, `payment_token`, `paid_at`, `expired_at`, `created_at`) VALUES
('1dca4348-afeb-4cf7-998e-33dea633acdf', 'user_6dd3e1bcc9d9', 50000, 'PAID', NULL, '2cd6ebde-a063-4534-bc15-faf334c717d4', '2026-03-28 07:28:20', '2026-03-28T07:43:02.373Z', '2026-03-28 07:28:02'),
('2300ae52-ddf5-4711-8244-c5e1bf12cca6', 'user_9c30441f5fa3', 50000, 'PAID', NULL, '77327c62-4c6e-4766-bcbc-1103d7272f20', '2026-03-28 07:30:23', '2026-03-28T07:45:08.465Z', '2026-03-28 07:30:08');

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
  `attendee_details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`attendee_details`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`id`, `order_id`, `ticket_type_id`, `quantity`, `unit_price`, `subtotal`, `attendee_details`) VALUES
('oi_4f1ff8ad', '2300ae52-ddf5-4711-8244-c5e1bf12cca6', 'c8c0cd6b-b7de-45d6-bb54-b7a4a9bdf029', 1, 50000, 50000, '[{\"name\":\"zeruel\",\"email\":\"zeruel@gmail.com\",\"phone\":\"098765671823\"}]'),
('oi_6ab7d31c', '1dca4348-afeb-4cf7-998e-33dea633acdf', 'c8c0cd6b-b7de-45d6-bb54-b7a4a9bdf029', 1, 50000, 50000, '[{\"name\":\"Raihan Ade Purnomo\",\"email\":\"raihanadepurnomo123@gmail.com\",\"phone\":\"081273284284\"}]');

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

--
-- Dumping data for table `resale_listings`
--

INSERT INTO `resale_listings` (`id`, `ticket_id`, `seller_id`, `original_price`, `asking_price`, `max_allowed_price`, `platform_fee`, `seller_receives`, `note`, `status`, `listed_at`, `sold_at`, `cancelled_at`, `expired_at`) VALUES
('rl_fc27c562', 'tkt_1b0hddr28', 'user_6dd3e1bcc9d9', 50000, 60000, 60000, 3000, 57000, NULL, 'SOLD', '2026-03-28 14:31:35', '2026-03-28 14:32:36', NULL, '2026-04-01 14:27:00');

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

--
-- Dumping data for table `resale_orders`
--

INSERT INTO `resale_orders` (`id`, `resale_listing_id`, `buyer_id`, `total_paid`, `platform_fee`, `seller_receives`, `attendee_details`, `status`, `payment_token`, `midtrans_order_id`, `payment_method`, `paid_at`, `expired_at`, `created_at`) VALUES
('rord_1d032fd0', 'rl_fc27c562', 'user_9c30441f5fa3', 60000, 3000, 57000, '[{\"name\":\"zeruel\",\"email\":\"zeruel@gmail.com\",\"phone\":\"098765671823\"}]', 'PAID', 'a0795738-df4e-4b9a-aa8f-d098c74b6ad0', 'rord_1d032fd0', NULL, '2026-03-28 14:32:36', '2026-03-28 14:47:18', '2026-03-28 14:32:18');

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

--
-- Dumping data for table `seat_social_profiles`
--

INSERT INTO `seat_social_profiles` (`id`, `user_id`, `bio`, `instagram_handle`, `display_name`, `created_at`, `updated_at`) VALUES
('ssp_6c95516687ab', 'user_9c30441f5fa3', 'keren banget', 'zeruel', NULL, '2026-03-28 14:29:32', '2026-03-28 14:29:32'),
('ssp_a55834d5d070', 'user_6dd3e1bcc9d9', 'mahasiswa', 'raihanadepurnomo', NULL, '2026-03-28 14:23:53', '2026-03-28 14:23:53');

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

--
-- Dumping data for table `seller_balances`
--

INSERT INTO `seller_balances` (`id`, `user_id`, `balance`, `total_earned`, `total_withdrawn`, `created_at`, `updated_at`) VALUES
('bal_d33ec26c', 'user_cc3791e11c01', 0, 0, 0, '2026-03-28 14:35:01', '2026-03-28 14:35:01'),
('bal_de0d27b6', 'user_6dd3e1bcc9d9', 0, 57000, 57000, '2026-03-28 14:31:52', '2026-03-28 14:33:53');

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
  `order_item_id` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tickets`
--

INSERT INTO `tickets` (`id`, `order_id`, `user_id`, `ticket_type_id`, `qr_code`, `status`, `is_used`, `used_at`, `created_at`, `quantity`, `attendee_details`, `order_item_id`) VALUES
('tkt_1b0hddr28', '1dca4348-afeb-4cf7-998e-33dea633acdf', 'user_6dd3e1bcc9d9', 'c8c0cd6b-b7de-45d6-bb54-b7a4a9bdf029', 'qr_22sce9vhm62i', 'TRANSFERRED', 1, NULL, '2026-03-28 07:28:20', 1, '[{\"name\":\"Raihan Ade Purnomo\",\"email\":\"raihanadepurnomo123@gmail.com\",\"phone\":\"081273284284\"}]', 'oi_6ab7d31c'),
('tkt_d3a9b322', 'rord_1d032fd0', 'user_9c30441f5fa3', 'c8c0cd6b-b7de-45d6-bb54-b7a4a9bdf029', 'qr_99bd5a845427', 'ACTIVE', 0, NULL, '2026-03-28 14:32:36', 1, '[{\"name\":\"zeruel\",\"email\":\"zeruel@gmail.com\",\"phone\":\"098765671823\"}]', NULL),
('tkt_kvsi8ajzd', '2300ae52-ddf5-4711-8244-c5e1bf12cca6', 'user_9c30441f5fa3', 'c8c0cd6b-b7de-45d6-bb54-b7a4a9bdf029', 'qr_g1rkpv6pb87', 'USED', 1, '2026-03-28T07:37:16.166Z', '2026-03-28 07:30:23', 1, '[{\"name\":\"zeruel\",\"email\":\"zeruel@gmail.com\",\"phone\":\"098765671823\"}]', 'oi_4f1ff8ad');

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
  `sale_start_date` text DEFAULT NULL,
  `sale_end_date` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `ticket_types`
--

INSERT INTO `ticket_types` (`id`, `event_id`, `name`, `description`, `price`, `quota`, `sold`, `max_per_order`, `max_per_account`, `sale_start_date`, `sale_end_date`) VALUES
('c8c0cd6b-b7de-45d6-bb54-b7a4a9bdf029', '2b15839b-52a6-4aac-849a-e501caf38e78', 'VIP', 'Makan', 50000, 100, 2, 3, 0, '2026-03-28T07:27:00.000Z', '2026-04-01T07:27:00.000Z');

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

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `email`, `name`, `image`, `role`, `created_at`, `updated_at`, `email_verified`, `password_hash`, `display_name`, `avatar_url`, `phone`, `phone_verified`, `auth_provider`, `is_email_verified`, `metadata`, `username`, `username_changed_at`, `is_profile_public`) VALUES
('user_3db2858d60f4', 'superadmin@eventra.com', 'Super Admin', NULL, 'SUPER_ADMIN', '2026-03-27 16:46:30', '2026-03-27 16:46:30', 1, '$2b$10$4S9llAZh56x2m3lvf/cMtObxq3UtGfk3LqfT3ffpEx0R8ntL6IOOO', NULL, NULL, NULL, 0, 'email', 1, NULL, NULL, NULL, 1),
('user_6dd3e1bcc9d9', 'raihanadepurnomo123@gmail.com', 'Raihan Ade Purnomo', '/user-photo/avatar_user_6dd3e1bcc9d9_1774682607254.png', 'BUYER', '2026-03-28 07:11:24', '2026-03-28 07:24:08', 1, NULL, NULL, NULL, '081273284284', 0, 'google', 1, NULL, 'raihan', '2026-03-28 07:23:43', 1),
('user_9c30441f5fa3', 'zeruel@gmail.com', 'zeruel', NULL, 'BUYER', '2026-03-28 07:29:15', '2026-03-28 07:29:32', 0, '$2b$10$UWODuIOiEP9IFo0JLgWnIedh0zGZ4beVP4Cm/UwbG5bWBCBqj8DmC', NULL, NULL, '098765671823', 0, 'email', 0, NULL, 'zeruel', '2026-03-28 07:29:23', 1),
('user_cc3791e11c01', 'azriel@gmail.com', 'azriel', NULL, 'EO', '2026-03-28 07:24:49', '2026-03-28 07:25:06', 0, '$2b$10$lMoVtY/zX4yk10pKj/QdV.W5VWJ6SzF7UhbugRdvbImJvdBGR1Fxm', NULL, NULL, '081267346382', 0, 'email', 0, NULL, NULL, NULL, 1);

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

--
-- Dumping data for table `waves`
--

INSERT INTO `waves` (`id`, `event_id`, `sender_id`, `receiver_id`, `message`, `status`, `created_at`, `responded_at`) VALUES
('c5aad112-f985-449d-ba76-91962f35c937', '2b15839b-52a6-4aac-849a-e501caf38e78', 'b9807f1b-f581-427c-a4f0-616a7e5c3124', 'a3456e01-bb45-448f-a81a-3fe34f9cbef3', 'halooo', 'ACCEPTED', '2026-03-28 14:30:37', '2026-03-28 14:31:06');

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
-- Dumping data for table `withdrawals`
--

INSERT INTO `withdrawals` (`id`, `seller_balance_id`, `user_id`, `amount`, `bank_name`, `account_number`, `account_name`, `status`, `processed_at`, `rejected_reason`, `admin_note`, `created_at`, `receipt_url`) VALUES
('wd_cb03218b', 'bal_de0d27b6', 'user_6dd3e1bcc9d9', 57000, 'Mandiri', '23454323', 'RAIHAN', 'COMPLETED', '2026-03-28 14:34:18', NULL, NULL, '2026-03-28 14:33:53', NULL);

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
-- Constraints for table `resale_listings`
--
ALTER TABLE `resale_listings`
  ADD CONSTRAINT `resale_listings_ibfk_2` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `resale_listings_ticket_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE;

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
