<div align="center">

# 🎟️ Eventra

### Platform Ticketing & Manajemen Event Modern

Bukan sekadar jual tiket — Eventra menghadirkan pengalaman lengkap dari sebelum hingga sesudah event. Mulai dari pembelian tiket, resale resmi, koneksi sesama peserta, hingga dashboard keuangan lengkap untuk penyelenggara.

<br/>

[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MySQL](https://img.shields.io/badge/MySQL_8-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)
[![Midtrans](https://img.shields.io/badge/Midtrans-003566?style=for-the-badge&logo=stripe&logoColor=white)](https://midtrans.com)
[![Resend](https://img.shields.io/badge/Resend-000000?style=for-the-badge&logo=mail.ru&logoColor=white)](https://resend.com)

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
- [Alur Penggunaan](#-alur-penggunaan)
- [Scripts](#-scripts)

---

## 🌟 Tentang Eventra

Eventra hadir untuk menjawab keterbatasan platform ticketing konvensional di Indonesia. Platform ini tidak hanya memfasilitasi jual-beli tiket, tetapi membangun **ekosistem lengkap** yang menguntungkan semua pihak — pembeli, penyelenggara, dan platform.

### Yang Membedakan Eventra

| Fitur | Keterangan |
|---|---|
| 🔄 **Resale Resmi** | Jual tiket kembali secara legal, terkontrol, dan aman — tanpa calo |
| 🤝 **Seat Social** | Kenalan dengan sesama peserta sebelum event dimulai |
| 📄 **PDF Tiket** | Tiket digital bergaya yang bisa didownload dan dikirim via email |
| ⏰ **Early Bird Otomatis** | Harga berubah otomatis tanpa EO perlu edit manual |
| 🎁 **Tiket Bundle** | Paket tiket dengan satu QR, cocok untuk pasangan atau grup |

---

## ✨ Fitur Utama

### 👤 Pembeli (Buyer)

**Pembelian Tiket**
- Beli tiket online via **Midtrans** — transfer bank, QRIS, kartu kredit, dan lainnya
- Tiket gratis (Rp 0) diproses langsung tanpa melalui payment gateway
- Batas pembelian per akun yang ditentukan EO
- Tiket digital dengan **QR Code unik** per tiket
- Download tiket sebagai **file PDF** — berisi nama event, detail, dan QR Code
- Email konfirmasi otomatis dengan attachment PDF tiket

**Resale Marketplace**
- Jual tiket yang tidak terpakai dengan harga maksimal +20% dari harga asli
- Pilih tiket satuan atau sekaligus dari satu transaksi yang mau dijual
- Saldo hasil penjualan masuk otomatis setelah tiket terjual
- Tiket hasil resale **tidak bisa dijual kembali**
- Listing expired otomatis dalam 7 hari jika tidak terjual → saldo tetap masuk

**Saldo & Keuangan**
- Riwayat lengkap penambahan saldo (dari penjualan & listing expired)
- Ajukan pencairan saldo ke rekening bank kapan saja
- Minimum pencairan Rp 50.000

**Sosial & Profil**
- **Seat Social** — opt-in untuk kenalan dengan sesama peserta event
- Kirim "Wave" sebagai sapaan sebelum event
- **Username unik** — halaman profil publik di `eventra.com/@username`
- Riwayat event yang pernah dihadiri tampil di profil publik

---

### 🏢 Event Organizer (EO)

**Manajemen Event**
- Buat event lengkap: poster, lokasi, jadwal, kategori, deskripsi
- Buat beberapa jenis tiket per event (Regular, VIP, VVIP, dll)
- Tiket gratis (Rp 0) dan tiket berbayar didukung
- **Tiket Bundle** — satu pembelian menghasilkan beberapa tiket (Paket Couple, dll)
- **Duplikasi event** untuk template event serupa

**Harga & Promosi**
- **Early Bird & Flash Sale** — harga bertingkat per fase berdasarkan waktu atau kuota, berubah otomatis
- **Kode Promo** — diskon persentase atau nominal, dengan aturan lengkap (kuota, masa berlaku, batas per akun)
- Batas pembelian per transaksi dan per akun per jenis tiket
- Toggle izin resale — EO tentukan apakah tiket eventnya bisa dijual kembali

**Form & Data Peserta**
- Tambahkan pertanyaan kustom saat checkout (nama KTP, ukuran baju, asal kota, dll)
- Tipe field: teks, angka, pilihan (select), atau radio
- Pertanyaan berlaku per tiket atau per transaksi
- Export data peserta + jawaban form ke **Excel**

**Check-in & Laporan**
- Scan QR Code peserta untuk check-in saat event berlangsung
- **Dashboard check-in live** — statistik kehadiran real-time, grafik per 15 menit, live feed scan
- Export laporan event ke **PDF & Excel**
- Dashboard keuangan — total pendapatan, saldo yang bisa dicairkan
- Ajukan pencairan dana dari tiket yang sudah ter-scan

---

### 🛡️ Super Admin

- Pantau semua EO, event, dan transaksi di satu dashboard
- Approve atau tolak pendaftaran EO baru
- Proses pencairan dana EO dan penjual resale (upload bukti transfer)
- Pantau marketplace resale
- Laporan & statistik seluruh platform

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
| **Auth** | JWT + Google OAuth 2.0 + Email OTP |
| **Payment** | Midtrans Snap |
| **Email** | Resend (transactional email + attachment PDF) |
| **File Upload** | Multer |
| **Icons** | Lucide React |

---

## 🚀 Cara Setup

### Prasyarat

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

Isi semua nilai di file `.env`. Lihat bagian [Environment Variables](#-environment-variables) untuk detail lengkap.

---

### Langkah 3 — Setup Database

Buat database baru di phpMyAdmin atau MySQL:

```sql
CREATE DATABASE eventra 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;
```

Import struktur tabel dari file `eventra.sql`:

**Via phpMyAdmin:**
1. Buka phpMyAdmin → pilih database `eventra`
2. Klik tab **Import**
3. Pilih file `eventra.sql` → klik **Import**
4. Tunggu hingga muncul pesan sukses ✅

**Via terminal:**
```bash
mysql -u root -p eventra < eventra.sql
```

---

### Langkah 4 — Install Dependencies

```bash
# Frontend (di root folder)
npm install

# Backend
cd server && npm install
```

---

### Langkah 5 — Jalankan Aplikasi

Buka **dua terminal terpisah**:

```bash
# Terminal 1 — Backend
cd server
npm start
# ✅ http://localhost:5000

# Terminal 2 — Frontend
npm run dev
# ✅ http://localhost:5173
```

Buka `http://localhost:5173` di browser. Login menggunakan akun Google yang emailnya sesuai `VITE_SUPER_ADMIN_EMAIL` untuk akses Super Admin.

---

## 🔑 Environment Variables

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
JWT_SECRET=your_random_secret_min_32_chars

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

> **Cara membuat Google OAuth:**
> 1. Buka [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
> 2. Buat OAuth 2.0 Client ID (tipe: Web Application)
> 3. Tambahkan `http://localhost:5000/api/auth/google/callback` ke Authorized Redirect URIs

### 💳 Pembayaran
```env
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx
```

> Gunakan key **Sandbox** untuk development, **Production** untuk live.
> Dapatkan di [Dashboard Midtrans](https://dashboard.midtrans.com/) → Settings → Access Keys

### 📧 Email
```env
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@eventra.com
```

> Daftar dan dapatkan API key di [resend.com](https://resend.com)

### ⚙️ Aplikasi
```env
VITE_API_URL=http://localhost:5000
VITE_SUPER_ADMIN_EMAIL=emailkamu@gmail.com
```

> `VITE_SUPER_ADMIN_EMAIL` — akun Google dengan email ini otomatis jadi Super Admin saat pertama login.

---

## 🔐 Role & Akses

| Role | Cara Mendapatkan | Akses |
|---|---|---|
| **BUYER** | Default saat register | Beli tiket, resale, saldo, seat social, profil publik |
| **EO** | Daftar sebagai EO → disetujui Super Admin | Semua akses Buyer + kelola event + scan QR + keuangan EO |
| **SUPER_ADMIN** | Email sesuai `VITE_SUPER_ADMIN_EMAIL` | Semua akses + kelola EO + proses semua pencairan |

---

## 🗺️ Alur Penggunaan

```
Pembeli                      EO                          Super Admin
   │                          │                                │
   ├─ Daftar / Login           ├─ Daftar sebagai EO             │
   │  (Google / Email OTP)     ├─ Tunggu approval          ◄────┤─ Approve EO
   │                          ├─ Buat event & tiket            │
   │                          ├─ Set harga, promo, bundle       │
   │                          ├─ Publish event                  │
   ├─ Browse & beli tiket      │                                │
   ├─ Bayar via Midtrans       │                                │
   ├─ Terima PDF tiket + email │                                │
   ├─ Hadir → scan QR     ────►├─ Check-in live dashboard        │
   │                          ├─ Export laporan peserta         │
   │                          ├─ Ajukan pencairan          ◄────┤─ Proses pencairan
   │                          └─ Terima bukti transfer          │
   │                                                            │
   ├─ (Opsional) Jual tiket resale                              │
   ├─ Pembeli lain beli → saldo masuk                           │
   └─ Cairkan saldo ke rekening            ◄────────────────────┤─ Proses pencairan
```

---

## 📦 Scripts

| Command | Keterangan |
|---|---|
| `npm run dev` | Frontend development server |
| `npm run build` | Build frontend untuk production |
| `npm run preview` | Preview hasil build |
| `npm run lint:types` | Cek TypeScript type errors |
| `cd server && npm start` | Backend server |
| `cd server && npm run dev` | Backend dengan auto-reload |

---

## 🤝 Kontribusi

Pull request, issue, dan saran selalu disambut. Sebelum submit PR:

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