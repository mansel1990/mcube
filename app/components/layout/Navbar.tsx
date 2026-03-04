"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

const navLinks = [
    { name: "Solutions", href: "#solutions" },
    { name: "The Pod", href: "#pod" },
    { name: "Process", href: "#process" },
    { name: "Contact", href: "#contact" },
];

export function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${scrolled ? "glass-panel py-4" : "bg-transparent py-6"
                }`}
        >
            <div className="container mx-auto px-6 md:px-12 flex justify-between items-center">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 group relative z-50">
                    <div className="w-10 h-10 relative flex items-center justify-center bg-surface border border-accent/20 rounded-lg group-hover:border-primary/50 transition-colors duration-300 glow-box overflow-hidden">
                        <Image src="/logo.png" alt="MCube Logo" fill className="object-cover" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">
                        MCube <span className="text-primary group-hover:glow-text transition-all duration-300">Tech Studio</span>
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors duration-200"
                        >
                            {link.name}
                        </Link>
                    ))}
                    <Link
                        href="#contact"
                        className="px-5 py-2.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 hover:border-primary/60 transition-all duration-300 glow-box"
                    >
                        Start a Discovery Sprint
                    </Link>
                </nav>

                {/* Mobile Menu Toggle */}
                <button
                    className="md:hidden text-foreground hover:text-primary transition-colors"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                    {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
                </button>
            </div>

            {/* Mobile Navigation Dropdown */}
            {mobileMenuOpen && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="md:hidden absolute top-full left-0 w-full glass-panel border-t border-accent/10 flex flex-col px-6 py-4 gap-4 shadow-2xl"
                >
                    {navLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className="text-lg font-medium text-foreground py-2 border-b border-foreground/5"
                        >
                            {link.name}
                        </Link>
                    ))}
                    <Link
                        href="#contact"
                        onClick={() => setMobileMenuOpen(false)}
                        className="mt-4 px-6 py-3 rounded-xl bg-primary text-white text-center font-medium shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                    >
                        Start a Discovery Sprint
                    </Link>
                </motion.div>
            )}
        </motion.header>
    );
}
