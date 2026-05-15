"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";

const navLinks = [
    { name: "Solutions", href: "#solutions" },
    { name: "The Pod", href: "#pod" },
    { name: "Process", href: "#process" },
    { name: "Customers", href: "#customers" },
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

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [mobileMenuOpen]);

    const close = () => setMobileMenuOpen(false);

    return (
        <>
            <motion.header
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
                    scrolled || mobileMenuOpen ? "glass-panel py-4" : "bg-transparent py-6"
                }`}
            >
                <div className="container mx-auto px-6 md:px-12 flex justify-between items-center">
                    {/* Logo */}
                    <Link href="/" onClick={close} className="flex items-center gap-2 group relative z-50">
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
                        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                        className="md:hidden relative z-50 w-10 h-10 flex items-center justify-center rounded-lg border border-foreground/10 bg-surface/60 hover:border-primary/40 transition-colors"
                        onClick={() => setMobileMenuOpen((v) => !v)}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            {mobileMenuOpen ? (
                                <motion.span
                                    key="close"
                                    initial={{ rotate: -90, opacity: 0 }}
                                    animate={{ rotate: 0, opacity: 1 }}
                                    exit={{ rotate: 90, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                >
                                    <X size={20} className="text-foreground" />
                                </motion.span>
                            ) : (
                                <motion.span
                                    key="menu"
                                    initial={{ rotate: 90, opacity: 0 }}
                                    animate={{ rotate: 0, opacity: 1 }}
                                    exit={{ rotate: -90, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                >
                                    <Menu size={20} className="text-foreground" />
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </div>
            </motion.header>

            {/* Mobile Full-Screen Overlay */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        key="mobile-menu"
                        initial={{ opacity: 0, y: -16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.28, ease: "easeOut" }}
                        className="fixed inset-0 z-40 md:hidden flex flex-col"
                        style={{ background: "rgba(5,5,5,0.97)", backdropFilter: "blur(20px)" }}
                    >
                        {/* Top glow accent */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-48 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />

                        {/* Nav links — centred vertically in remaining space */}
                        <div className="flex flex-col justify-center flex-1 px-8 pt-24 pb-10 gap-1">
                            {navLinks.map((link, i) => (
                                <motion.div
                                    key={link.name}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.06 + i * 0.07, duration: 0.3 }}
                                >
                                    <Link
                                        href={link.href}
                                        onClick={close}
                                        className="group flex items-center justify-between py-5 border-b border-foreground/8 hover:border-primary/30 transition-colors duration-200"
                                    >
                                        <span className="text-3xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-200">
                                            {link.name}
                                        </span>
                                        <ArrowRight
                                            size={20}
                                            className="text-foreground/20 group-hover:text-primary group-hover:translate-x-1 transition-all duration-200"
                                        />
                                    </Link>
                                </motion.div>
                            ))}

                            {/* CTA Button */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.45, duration: 0.3 }}
                                className="pt-8"
                            >
                                <Link
                                    href="#contact"
                                    onClick={close}
                                    className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-2xl bg-primary text-white font-semibold text-lg shadow-[0_0_40px_rgba(37,99,235,0.4)] hover:bg-primary/80 transition-all duration-300"
                                >
                                    Start a Discovery Sprint
                                    <ArrowRight size={20} />
                                </Link>
                            </motion.div>
                        </div>

                        {/* Bottom branding */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="text-center text-foreground/20 text-xs font-mono pb-8 tracking-widest uppercase"
                        >
                            mcube.studio
                        </motion.p>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
