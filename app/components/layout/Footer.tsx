import Link from "next/link";
import { Github, Twitter, Linkedin } from "lucide-react";

export function Footer() {
    return (
        <footer className="w-full border-t border-accent/10 bg-[#030303] py-12 text-center text-sm relative mt-24">
            <div className="container mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex flex-col items-center md:items-start text-foreground/70">
                    <Link href="/" className="flex items-center gap-2 mb-2 group">
                        <span className="text-xl font-bold tracking-tight text-foreground">
                            M³ <span className="text-primary glow-text">Tech Studio</span>
                        </span>
                    </Link>
                    <p>© {new Date().getFullYear()} MCube Tech Studio. All rights reserved.</p>
                </div>

                <div className="flex flex-col items-center md:items-end text-foreground/50">
                    <p className="mb-4 text-xs tracking-widest uppercase text-foreground/40 font-mono">Built by MCube. Solving the complex.</p>
                    <div className="flex items-center gap-6">
                        <Link href="#" className="hover:text-primary transition-colors hover:glow-text">
                            <Github size={18} />
                        </Link>
                        <Link href="#" className="hover:text-primary transition-colors hover:glow-text">
                            <Twitter size={18} />
                        </Link>
                        <Link href="#" className="hover:text-primary transition-colors hover:glow-text">
                            <Linkedin size={18} />
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
