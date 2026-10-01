import Link from "next/link";
import { navLinks, WHATSAPP_DISPLAY } from "./content";

export function StudioFooter() {
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="wrap">
        <div className="stack gap-4">
          <strong className="footer-brand">MCube Tech Studio</strong>
          <span className="muted footer-meta">
            © {year} · India · WhatsApp {WHATSAPP_DISPLAY}
          </span>
        </div>
        <nav aria-label="Footer">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
