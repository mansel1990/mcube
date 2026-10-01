"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { navLinks, WHATSAPP_URL } from "./content";
import { MenuIcon } from "./icons";

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioHeader() {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;

  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" className="brand">
          <span className="mark" aria-hidden="true">
            M<sup>3</sup>
          </span>
          MCube Tech Studio
        </Link>
        <nav className={open ? "nav open" : "nav"} id="studio-nav" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
              onClick={() => setMenuPath(null)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <a className="btn btn-ink" href={WHATSAPP_URL} target="_blank" rel="noopener">
          Start a Project
        </a>
        <button
          className="menu-btn"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="studio-nav"
          onClick={() => setMenuPath(open ? null : pathname)}
        >
          <MenuIcon />
        </button>
      </div>
    </header>
  );
}
