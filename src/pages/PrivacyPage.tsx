import { SEO } from '@/components/shared/SEO'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO 
        title="Kebijakan Privasi" 
        url="https://eventra.raihanadepurnomo.dev/privacy" 
      />
      <Navbar />
      <main className="flex-1 pt-14">
        {/* Header Section */}
        <div className="bg-secondary/30 border-b border-border py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h1 className="text-3xl md:text-5xl font-bold text-foreground tracking-tight mb-4">Kebijakan Privasi</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Terakhir diperbarui: April 2026
            </p>
          </div>
        </div>

        {/* Content Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-16">
          <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-muted-foreground/90">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">1. Informasi yang Kami Kumpulkan</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li><strong>Data yang kamu berikan:</strong> nama, email, nomor telepon, dan data diri.</li>
              <li><strong>Data otomatis:</strong> alamat IP, browser, jenis sistem operasi, dan aktivitas halaman.</li>
              <li><strong>Data pembayaran:</strong> di-proses oleh Midtrans. Eventra tidak pernah menyimpan nomor atau detail data kartu kredit Anda.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 mt-8">2. Bagaimana Kami Menggunakan Data</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Memproses pembelian dan mengelola pembayaran tiket secara aman.</li>
              <li>Mengirim tiket digital, resi, konfirmasi status dan pengingat event via email.</li>
              <li>Menjalankan fitur <strong>Seat Social</strong> (hanya akan aktif bila kamu menyetujui / opt-in).</li>
              <li>Meningkatkan layanan platform, pengalaman ui dan mendeteksi anomali.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 mt-8">3. Berbagi Data dengan Pihak Ketiga</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li><strong>Midtrans:</strong> pemrosesan transaksi pembayaran resmi.</li>
              <li><strong>Resend:</strong> pengiriman email transaksional dan notifikasi.</li>
              <li>Kami <strong>tidak akan pernah menjual data pribadi Anda</strong> ke pihak manapun. Anda berhak merasa aman.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 mt-8">4. Keamanan Data</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Password yang dimasukkan akan selalu dienkripsi dengan standar <code>bcrypt</code> terkini.</li>
              <li>Seluruh koneksi lalu lintas platform diamankan dengan standar enskripsi (HTTPS/SSL).</li>
              <li>Setiap QR Code menggunakan format UUID unik kriptografi yang tidak bisa direplika secara sepihak.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 mt-8">5. Hak Pengguna</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Meminta akses, koreksi, atau penghapusan total informasi data pribadi terkait.</li>
              <li>Opt-out atau kelaur dari layanan preferensi <i>Seat Social</i> kapan saja.</li>
              <li>Menghapus akun utama dengan menghubungi support.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 mt-8">6. Cookie</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Cookie digunakan secara eksplisit hanya untuk mengelola session login dan preferensi pengguna.</li>
              <li>Eventra tidak menggunakan <i>third-party tracking cookie</i> untuk mengintip aktivitas di luar platform kami.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 mt-8">7. Perubahan Kebijakan</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Jika ada pembaruan masif atau signifikan dari segi bisnis maupun legal, tim kami akan secara langsung memberitahukan seluruh user aktif lewat email.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 mt-8">8. Hubungi Kami</h2>
            <p className="mb-8 pl-5">
              Jika ada keluhan, permintaan hapus akun atau pertanyaan menyangkut kebijakan ini:
              <br/>
              📧 <a href="mailto:support@eventra.raihanadepurnomo.dev" className="text-accent underline font-semibold mt-2 inline-block">support@eventra.raihanadepurnomo.dev</a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
