import { SEO } from '@/components/shared/SEO'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO 
        title="Syarat dan Ketentuan" 
        url="https://eventra.raihanadepurnomo.dev/terms" 
      />
      <Navbar />
      <main className="flex-1 pt-14">
        {/* Header Section */}
        <div className="bg-secondary/30 border-b border-border py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h1 className="text-3xl md:text-5xl font-bold text-foreground tracking-tight mb-4">Syarat dan Ketentuan</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Terakhir diperbarui: April 2026
            </p>
          </div>
        </div>

        {/* Content Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-16">
          <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-muted-foreground/90 leading-relaxed">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">1. Penerimaan Syarat</h2>
            <p className="mb-8">
              Dengan mengakses dan menggunakan platform Eventra, termasuk semua layanan, konten, dan fungsionalitasnya, kamu menyetujui semua syarat dan ketentuan ini secara penuh dan mengikat. 
            </p>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">2. Akun Pengguna</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Kamu bertanggung jawab sepenuhnya atas keamanan dan aktivitas kredensial akun.</li>
              <li>Satu akun berlaku untuk satu entitas/orang, dan tidak boleh dipindahtangankan tanpa persetujuan eksplisit.</li>
              <li>Eventra memiliki hak khusus untuk menonaktifkan atau mensuspend akun yang melanggar ketentuan atau terlibat aktivitas ilegal.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">3. Pembelian Tiket</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Harga pokok tiket sepenuhnya ditentukan secara absolut oleh pihak Event Organizer (Penyelenggara).</li>
              <li>Platform fee (biaya layanan platform) dapat ditambahkan di atas harga tiket saat checkout.</li>
              <li>Tiket yang telah berhasil dibeli, pada prinsipnya <strong>tidak dapat di-refund</strong> (dana tidak dapat dikembalikan) kecuali event tersebut resmi dibatalkan seluruhnya oleh pihak penyelenggara sendiri.</li>
              <li>Tiket dibeli hanya berlaku bagi event sesuai tanggal dan waktu yang tertera.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">4. Resale Tiket (Pasar Sekunder)</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Harga markup atau kenaikan listing resale diatur sistem maksimal <strong>20% di atas harga asli</strong> untuk mencegah premanisme calo.</li>
              <li>Platform akan mengambil platform fee regulasi sebesar <strong>5% dari total harga akhir resale</strong>.</li>
              <li>Tiket hasil pembelian dari pasar resale sudah <strong>final dan tidak dapat listing dijual kembali</strong>.</li>
              <li>Setiap listing yang aktif akan berdurasi <strong>maksimal 7 hari</strong>, setelah waktu itu secara otomatis ditarik dari peredaran.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">5. Event Organizer (Penyelenggara)</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Penyelenggara wajib memberikan informasi tajuk, tanggal, dan detail acara dengan akurat dan bebas menyesatkan.</li>
              <li>Segala bentuk pelaksanaan hari-H, properti, hingga keselamatan penonton di venue sepenuhnya <strong>tanggung jawab langsung</strong> pihak Event Organizer.</li>
              <li>Jika keadaan memaksa acara batal (pembatalan/postpone event), wajib memberikan statement minimal <strong>48 jam sebelum acara</strong> ke dalam sistem.</li>
              <li>Proses payout (Pencairan Dana) hasil jualan tiket akan berjalan secara instan <strong>namun hanya untuk persentase dari tiket yang sudah di scan (Check-in)</strong> demi keamanan buyer dari penyelenggara fiktif.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">6. Larangan Tegas</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Dilarang keras memakai infrastruktur Eventra untuk tindak pidana murni, money laundry, spamming atau fraud (penipuan).</li>
              <li>Dilarang membuat kloningan akun untuk mengeksploitasi kode promosi ekslusif dan diskon otomatis.</li>
              <li>Dilarang melakukan eksploitasi dan manipulasi barcode untuk check-in.</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">7. Batasan Tanggung Jawab</h2>
            <ul className="list-disc pl-5 mb-8 space-y-2">
              <li>Eventra merupakan platform mediator dan teknologi; kami <strong>tidak dapat menanggung resiko</strong> atas perubahan lineup, venue, jam acara atau pembatalan mendadak yang murni eksekusi Event Organizer.</li>
              <li>Eventra tidak bertanggung jawab secara finansial atas kerugian moril dan imateril akibat kejadian <i>Force Majeure</i> (bencana alam, huru-hara massal, cuaca buruk dll).</li>
            </ul>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">8. Hukum yang Berlaku</h2>
            <p className="mb-8 pl-5">
              Syarat dan Ketentuan ini tunduk, diterapkan, dan diinterpretasikan utuh berlandaskan pada produk Hukum Negara Republik Indonesia.
            </p>

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">9. Hubungi Kami</h2>
            <p className="mb-8 pl-5">
              Jika kamu mempunyai kebutuhan sengketa atau pelaporan EO mencurigakan segera layangkan ke dukungan hukum kami di:
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
