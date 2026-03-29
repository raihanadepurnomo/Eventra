import { SEO } from '@/components/shared/SEO'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO 
        title="Tentang Kami" 
        url="https://eventra.raihanadepurnomo.dev/about" 
      />
      <Navbar />
      <main className="flex-1 pt-14">
        {/* Header Section */}
        <div className="bg-secondary/30 border-b border-border py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <h1 className="text-3xl md:text-5xl font-bold text-foreground tracking-tight mb-4">Tentang Eventra</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Membangun ekosistem ticketing yang jujur, aman, dan modern untuk seluruh Indonesia.
            </p>
          </div>
        </div>

        {/* Content Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-16">
          <div className="space-y-12">
            <section>
              <p className="text-base md:text-lg text-foreground leading-relaxed mb-6">
                Eventra lahir dari satu pertanyaan sederhana: <strong>kenapa beli tiket event harus ribet, mahal, dan penuh ketidakpastian?</strong>
              </p>
              <p className="text-base md:text-lg text-foreground leading-relaxed">
                Kami membangun platform yang berpihak pada semua pihak — pembeli mendapat pengalaman yang mulus, penyelenggara mendapat <i>tools</i> yang powerful, dan ekosistem yang bisa dipercaya semua orang.
              </p>
            </section>

            <section className="bg-accent/5 border border-accent/20 rounded-2xl p-8">
              <h2 className="text-xl md:text-2xl font-bold text-accent mb-4">Misi Kami</h2>
              <p className="text-foreground leading-relaxed">
                Membuat setiap event lebih mudah diakses, lebih aman transaksinya, dan lebih berkesan pengalamannya — untuk semua orang di Indonesia.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-6">Yang Membedakan Kami</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-2">🔄 Resale Resmi</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">Tidak ada calo, tidak ada penipuan. Semua transaksi resale bergaransi dan divalidasi sistem.</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-2">🤝 Seat Social</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">Kenalan dengan peserta lain sebelum event dimulai. Temukan teman baru dengan minat sama.</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-2">📄 Tiket Digital</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">Beli dengan cepat, download PDF dengan mudah, dan tiket akan dikirim langsung ke email Anda.</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-2">⏰ Harga Otomatis</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">Fase harga tiket seperti Early Bird berubah otomatis tanpa harus memantau waktu secara manual.</p>
                </div>
              </div>
            </section>

            <section className="border-t border-border pt-12 text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4">Hubungi Kami</h2>
              <p className="text-muted-foreground mb-2">📧 support@eventra.raihanadepurnomo.dev</p>
              <p className="text-muted-foreground">📍 Depok, Jawa Barat, Indonesia</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
