"use client";

import { motion } from "framer-motion";
import { ExternalLink, ArrowUpRight } from "lucide-react";

const customers = [
    {
        name: "Vriddhi Montessori",
        domain: "vriddhimontessori.com",
        url: "https://www.vriddhimontessori.com/",
        tag: "Education",
        location: "Chennai",
        index: "01",
        border: "border-champagne/20 group-hover:border-champagne/50",
        glow: "group-hover:shadow-[0_0_50px_rgba(242,227,198,0.12)]",
        dotColor: "bg-champagne",
        tagStyle: "text-champagne bg-champagne/10 border border-champagne/20",
        glowBg: "bg-champagne/5",
        numberColor: "text-champagne/5",
        accentText: "text-champagne",
    },
    {
        name: "The Ancients Cricket Club",
        domain: "theancientscricketclub.in",
        url: "https://www.theancientscricketclub.in/",
        tag: "Sports",
        location: "Mumbai",
        index: "02",
        border: "border-accent/20 group-hover:border-accent/50",
        glow: "group-hover:shadow-[0_0_50px_rgba(6,182,212,0.12)]",
        dotColor: "bg-accent",
        tagStyle: "text-accent bg-accent/10 border border-accent/20",
        glowBg: "bg-accent/5",
        numberColor: "text-accent/5",
        accentText: "text-accent",
    },
    {
        name: "The Butter Chapters",
        domain: "thebutterchapters.com",
        url: "https://www.thebutterchapters.com/",
        tag: "Lifestyle",
        location: "Online",
        index: "03",
        border: "border-success/20 group-hover:border-success/50",
        glow: "group-hover:shadow-[0_0_50px_rgba(16,185,129,0.12)]",
        dotColor: "bg-success",
        tagStyle: "text-success bg-success/10 border border-success/20",
        glowBg: "bg-success/5",
        numberColor: "text-success/5",
        accentText: "text-success",
    },
    {
        name: "Royale Cricket",
        domain: "royalecricket.in",
        url: "https://www.royalecricket.in/",
        tag: "Sports",
        location: "Chennai",
        index: "04",
        border: "border-primary/20 group-hover:border-primary/50",
        glow: "group-hover:shadow-[0_0_50px_rgba(37,99,235,0.12)]",
        dotColor: "bg-primary",
        tagStyle: "text-primary bg-primary/10 border border-primary/20",
        glowBg: "bg-primary/5",
        numberColor: "text-primary/5",
        accentText: "text-primary",
    },
];

const domains = customers.map((c) => c.domain);

export function Customers() {
    return (
        <section id="customers" className="py-24 relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60vw] h-64 bg-primary/5 rounded-full blur-[120px] -z-10" />

            <div className="container mx-auto px-6 md:px-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
                    <div>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                            Our customers.
                        </h2>
                        <p className="text-foreground/70 max-w-xl text-lg">
                            Real products. Real users. Shipped by mcube.
                        </p>
                    </div>

                    {/* Live counter chip */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full glass-panel border border-foreground/10 self-start md:self-auto"
                    >
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                        <span className="text-sm font-semibold text-foreground/70 tracking-wider uppercase">
                            04 live sites
                        </span>
                    </motion.div>
                </div>

                {/* Scrolling domain ticker */}
                <div className="flex overflow-hidden relative w-full mb-16 border-y border-foreground/5 py-4 bg-surface/30">
                    <motion.div
                        className="flex whitespace-nowrap gap-16"
                        animate={{ x: ["0%", "-50%"] }}
                        transition={{ repeat: Infinity, ease: "linear", duration: 18 }}
                    >
                        {[...domains, ...domains].map((domain, i) => (
                            <span key={i} className="text-base font-mono text-foreground/30 shrink-0 tracking-wide">
                                ↗ {domain}
                            </span>
                        ))}
                    </motion.div>
                    <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10" />
                    <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10" />
                </div>

                {/* Customer cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {customers.map((customer, index) => (
                        <motion.a
                            key={customer.domain}
                            href={customer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className={`group relative glass-panel rounded-3xl p-8 border overflow-hidden flex flex-col justify-between min-h-[220px] cursor-pointer transition-all duration-500 ${customer.border} ${customer.glow}`}
                        >
                            {/* Giant background index number */}
                            <span
                                className={`absolute -right-4 -bottom-6 text-[8rem] md:text-[10rem] font-black leading-none select-none pointer-events-none transition-all duration-500 ${customer.numberColor} group-hover:scale-110 origin-bottom-right`}
                            >
                                {customer.index}
                            </span>

                            {/* Ambient glow blob */}
                            <div className={`absolute top-0 right-0 w-48 h-48 ${customer.glowBg} rounded-full blur-[60px] group-hover:scale-150 transition-transform duration-700`} />

                            {/* Top row */}
                            <div className="flex items-start justify-between relative z-10">
                                <div className="flex items-center gap-2.5">
                                    {/* Live pulsing dot */}
                                    <span className={`w-2 h-2 rounded-full ${customer.dotColor} animate-pulse shrink-0`} />
                                    <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full ${customer.tagStyle}`}>
                                        {customer.tag}
                                    </span>
                                    <span className="text-xs text-foreground/40 font-medium">
                                        {customer.location}
                                    </span>
                                </div>

                                {/* Arrow icon — slides in on hover */}
                                <div className="w-10 h-10 rounded-full border border-foreground/10 flex items-center justify-center opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300 bg-surface/60">
                                    <ArrowUpRight className={`w-4 h-4 ${customer.accentText}`} />
                                </div>
                            </div>

                            {/* Bottom content */}
                            <div className="relative z-10 mt-auto">
                                <h3 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-2 group-hover:translate-x-1 transition-transform duration-300">
                                    {customer.name}
                                </h3>
                                <p className={`text-sm font-mono ${customer.accentText} opacity-60 group-hover:opacity-100 transition-opacity duration-300`}>
                                    {customer.domain}
                                </p>
                            </div>
                        </motion.a>
                    ))}
                </div>
            </div>
        </section>
    );
}
