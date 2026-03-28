<div align="center">

# 🎟️ Eventra

### Platform Ticketing & Manajemen Event Modern

Platform lengkap untuk jual-beli tiket event secara online — dari konser, seminar, festival, hingga workshop. Dilengkapi fitur resale tiket resmi, koneksi sesama peserta, dan dashboard keuangan untuk penyelenggara.

<br/>

![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL_8-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Midtrans](https://img.shields.io/badge/Midtrans-003566?style=for-the-badge&logo=stripe&logoColor=white)

<br/>

</div>

---

## 📖 Daftar Isi

- [Tentang Eventra](#-tentang-eventra)
- [Fitur Utama](#-fitur-utama)
- [Tech Stack](#-tech-stack)
- [Cara Setup](#-cara-setup)
- [Environment Variables](#-environment-variables)
- [Role & Akses](#-role--akses)
- [Scripts](#-scripts)

---

## 🌟 Tentang Eventra

Eventra adalah platform SaaS ticketing event yang dirancang untuk menjawab keterbatasan platform ticketing konvensional. Bukan sekadar jual tiket — Eventra menghadirkan **pengalaman lengkap** dari sebelum hingga sesudah event.

**Keunggulan utama yang membedakan Eventra:**

> 🤝 **Seat Social** — Kenalan dengan sesama peserta event sebelum acara dimulai. Kirim sapaan, bangun koneksi baru.

> 🔄 **Resale Resmi** — Tidak bisa hadir? Jual tiketmu secara legal di platform. Tidak ada calo, tidak ada penipuan.

---

## ✨ Fitur Utama

### 👤 Pembeli (Buyer)
- Beli tiket event online dengan pembayaran via **Midtrans** (transfer bank, QRIS, kartu kredit, dll)
- **Tiket digital** dengan QR Code unik per tiket
- **Resale Marketplace** — jual tiket ke sesama pengguna dengan harga terkontrol (maks. +20% harga asli)
- **Saldo & Pencairan** — terima hasil penjualan tiket resale, cairkan ke rekening bank
- **Seat Social** — profil publik, lihat sesama peserta event, kirim wave/sapaan
- **Username & Profil Publik** — halaman profil personal di `eventra.com/@username`
- Riwayat pesanan dan status pembayaran real-time

### 🏢 Event Organizer (EO)
- Buat & kelola event lengkap: poster, lokasi, jadwal, tipe tiket, kuota
- **Scan QR Code** peserta saat event berlangsung (check-in)
- **Dashboard keuangan** — total pendapatan, saldo yang bisa dicairkan
- **Ajukan pencairan dana** dari tiket yang sudah ter-scan
- **Laporan event** — export ke PDF & Excel
- Riwayat pencairan beserta bukti transfer dari admin

### 🛡️ Super Admin
- Kelola semua EO, event, dan transaksi di satu dashboard
- **Approve / tolak** pendaftaran EO baru
- **Proses pencairan** EO dan penjual resale (upload bukti transfer)
- Pantau marketplace resale
- Laporan & statistik platform secara keseluruhan

---

## 🏗️ Tech Stack

| Layer | Teknologi |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS |
| **Routing** | TanStack Router |
| **State & Data Fetching** | TanStack Query + custom API hooks |
| **Charts** | Recharts |
| **Export** | jsPDF, xlsx |
| **Backend** | Node.js, Express.js (ESM) |
| **Database** | MySQL 8 (mysql2) |
| **Auth** | JWT + Google OAuth 2.0 |
| **Payment** | Midtrans Snap |
| **File Upload** | Multer |
| **Icons** | Lucide React |

---

## 🚀 Cara Setup

### Prasyarat

Pastikan sudah terinstall di komputer kamu:

| Tools | Versi Minimum | Link |
|---|---|---|
| Node.js | v18+ | [Download](https://nodejs.org) |
| MySQL | 8.0+ | [Download](https://dev.mysql.com/downloads/) |
| npm | Bawaan Node.js | — |

---

### Langkah 1 — Clone Repository

```bash
git clone https://github.com/username/eventra.git
cd eventra
```

---

### Langkah 2 — Konfigurasi Environment

```bash
cp .env.example .env
```

Buka file `.env` dan isi semua nilai yang dibutuhkan. Lihat bagian [Environment Variables](#-environment-variables) di bawah untuk penjelasan lengkap.

---

### Langkah 3 — Setup Database

**Buat database baru** di phpMyAdmin atau MySQL dengan nama `eventra`:

```sql
CREATE DATABASE eventra 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;
```

**Import struktur tabel** — pilih database `eventra` yang baru dibuat, lalu import file berikut:

```
📁 eventra/
└── 📄 eventra.sql   ← import file ini
```

**Cara import di phpMyAdmin:**
1. Buka phpMyAdmin → pilih database `eventra`
2. Klik tab **Import** di bagian atas
3. Klik **Choose File** → pilih file `eventra.sql`
4. Klik **Import** di bagian bawah halaman
5. Tunggu hingga muncul pesan sukses ✅

**Atau via terminal:**
```bash
mysql -u root -p eventra < eventra.sql
```

---

### Langkah 4 — Install Dependencies

**Frontend** (di root folder):
```bash
npm install
```

**Backend:**
```bash
cd server
npm install
```

---

### Langkah 5 — Jalankan Aplikasi

Buka **dua terminal terpisah**:

**Terminal 1 — Backend:**
```bash
cd server
npm start
# ✅ Server berjalan di http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
# Di root folder
npm run dev
# ✅ Aplikasi berjalan di http://localhost:5173
```

Buka browser dan akses `http://localhost:5173`. Login dengan akun Google yang emailnya sesuai dengan `VITE_SUPER_ADMIN_EMAIL` untuk mendapatkan akses Super Admin.

---

## 🔑 Environment Variables

Salin `.env.example` ke `.env` lalu isi nilai berikut:

### 🗄️ Database
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=eventra
```

### 🔐 Autentikasi
```env
# Gunakan string acak yang panjang (min. 32 karakter)
JWT_SECRET=your_super_secret_random_string

# Dari Google Cloud Console → APIs & Services → Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

> Cara membuat Google OAuth credentials:
> 1. Buka [Google Cloud Console](https://console.cloud.google.com/)
> 2. Buat project baru → APIs & Services → Credentials
> 3. Buat **OAuth 2.0 Client ID** (tipe: Web Application)
> 4. Tambahkan `http://localhost:5000/api/auth/google/callback` ke Authorized Redirect URIs

### 💳 Pembayaran
```env
# Dari Midtrans Dashboard → Settings → Access Keys
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx
```

> Gunakan key **Sandbox** untuk development, **Production** untuk live.
> Daftar di [Dashboard Midtrans](https://dashboard.midtrans.com/)

### ⚙️ Aplikasi
```env
VITE_API_URL=http://localhost:5000
VITE_SUPER_ADMIN_EMAIL=emailkamu@gmail.com
```

> `VITE_SUPER_ADMIN_EMAIL` — akun Google dengan email ini akan otomatis mendapat role **Super Admin** saat pertama kali login.

---

## 🔐 Role & Akses

| Role | Cara Mendapatkan | Akses |
|---|---|---|
| **BUYER** | Default saat register pertama kali | Beli tiket, resale, saldo, seat social, profil publik |
| **EO** | Daftar sebagai EO → disetujui Super Admin | Semua akses Buyer + buat event + scan QR + keuangan EO |
| **SUPER_ADMIN** | Email sesuai `VITE_SUPER_ADMIN_EMAIL` | Semua akses + kelola EO + proses semua pencairan |

---

## 🗺️ Alur Singkat

```
Pembeli                    EO                         Super Admin
   │                        │                               │
   ├─ Register/Login Google  ├─ Daftar sebagai EO            │
   │                        ├─ Tunggu approval         ◄────┤─ Approve EO
   ├─ Browse event           ├─ Buat event & tiket           │
   ├─ Beli tiket             ├─ Publish event                │
   ├─ Bayar via Midtrans     │                               │
   ├─ Terima tiket + QR      │                               │
   ├─ Hadir → scan QR   ────►├─ Scan QR check-in             │
   │                        ├─ Lihat laporan                 │
   │                        ├─ Ajukan pencairan         ◄────┤─ Proses & upload bukti
   │                        └─ Terima bukti transfer         │
   │                                                         │
   ├─ (Opsional) Jual tiket resale                           │
   ├─ Pembeli lain beli → saldo masuk                        │
   └─ Cairkan saldo ke rekening           ◄──────────────────┤─ Proses pencairan
```

---

## 📦 Scripts

| Command | Keterangan |
|---|---|
| `npm run dev` | Jalankan frontend development server |
| `npm run build` | Build frontend untuk production |
| `npm run preview` | Preview hasil build production |
| `npm run lint:types` | Cek TypeScript type errors |
| `cd server && npm start` | Jalankan backend server |
| `cd server && npm run dev` | Jalankan backend dengan auto-reload |

---

## 🤝 Kontribusi

Pull request, issue, dan saran selalu disambut dengan tangan terbuka.

Sebelum submit PR, pastikan tidak ada TypeScript error:
```bash
npm run lint:types
```

---

## 📄 Lisensi

MIT License © 2026 Eventra

---

<div align="center">

Dibuat dengan ☕ di Kota Depok

</div>