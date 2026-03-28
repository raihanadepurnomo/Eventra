import { Link } from '@tanstack/react-router'
import { Ticket } from 'lucide-react'

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          {/* Brand */}
          <div className="flex flex-col gap-3 max-w-xs">
            <div className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-accent" strokeWidth={2} />
              <span className="font-bold text-lg tracking-tight">
                Eventra
                <span className="text-accent">.</span>
              </span>
            </div>
            <p className="text-sm text-primary-foreground/60 leading-relaxed">
              Platform tiket modern untuk acara terbaik Indonesia. Beli, jual, dan kelola tiket dengan mudah.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col sm:flex-row gap-8">
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold text-primary-foreground/40 uppercase tracking-wider">
                Platform
              </h4>
              <nav className="flex flex-col gap-2">
                <Link
                  to="/events"
                  className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                >
                  Events
                </Link>
                <Link
                  to="/eo/setup"
                  className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                >
                  For Organizers
                </Link>
              </nav>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold text-primary-foreground/40 uppercase tracking-wider">
                Support
              </h4>
              <nav className="flex flex-col gap-2">
                <a
                  href="#"
                  className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                >
                  Help Center
                </a>
              </nav>
            </div>
          </div>
        </div>

        {/* Divider + copyright */}
        <div className="mt-10 pt-6 border-t border-primary-foreground/10 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-primary-foreground/40">
            &copy; 2026 Eventra. All rights reserved.
          </p>
          <p className="text-xs text-primary-foreground/30">
            Made with care in Indonesia
          </p>
        </div>
      </div>
    </footer>
  )
}
