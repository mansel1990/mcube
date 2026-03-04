"use client";

import { motion } from "framer-motion";
import { Layers, Zap, SearchCode } from "lucide-react";

const industries = ["Fintech", "Logistics", "SaaS", "Enterprise AI", "Healthtech", "E-Commerce"];

export function BentoGrid() {
    return (
        <section id="pod" className="py-24 relative z-10">
            <div className="container mx-auto px-6 md:px-12">
                <div className="text-center md:text-left mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                        The Problem solvers.
                    </h2>
                    <p className="text-foreground/70 max-w-2xl text-lg">
                        We don&apos;t just build, we architect for scale. The PM handles logic, the AI builds the brain, the Dev ships the engine.
                    </p>
                </div>

                {/* Dynamic Industry Ticker */}
                <div className="flex overflow-hidden relative w-full mb-16 border-y border-foreground/5 py-4 bg-surface/30">
                    <motion.div
                        className="flex whitespace-nowrap gap-12"
                        animate={{ x: ["0%", "-50%"] }}
                        transition={{ repeat: Infinity, ease: "linear", duration: 20 }}
                    >
                        {[...industries, ...industries].map((industry, i) => (
                            <span key={i} className="text-xl font-medium text-foreground/40 shrink-0">
                                Solutions for <span className="text-foreground/80">{industry}</span>
                            </span>
                        ))}
                    </motion.div>
                    <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent z-10" />
                    <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent z-10" />
                </div>

                {/* Bento Grid layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[250px]">
                    {/* Card 1 - Product Management */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="col-span-1 md:col-span-2 row-span-1 glass-panel rounded-3xl p-8 flex flex-col justify-end relative overflow-hidden group hover:border-champagne/30 transition-colors"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-champagne/5 rounded-full blur-[80px] group-hover:bg-champagne/10 transition-colors" />
                        <div className="mb-auto">
                            <Layers className="w-10 h-10 text-champagne mb-4" />
                        </div>
                        <h3 className="text-2xl font-bold mb-2 text-foreground">The PM defines the logic.</h3>
                        <p className="text-foreground/60 w-3/4">We dive deep into requirements with Discovery Audits, architecting clear data flow before writing a single line of code.</p>
                    </motion.div>

                    {/* Card 2 - AI Execution */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="col-span-1 row-span-1 md:row-span-2 glass-panel rounded-3xl p-8 flex flex-col justify-end relative overflow-hidden group hover:border-accent/30 transition-colors"
                    >
                        <div className="absolute top-0 right-0 w-48 h-48 bg-accent/10 rounded-full blur-[60px] group-hover:bg-accent/20 transition-colors" />
                        <div className="mb-auto pt-8">
                            <Zap className="w-12 h-12 text-accent mb-4" />
                        </div>
                        <h3 className="text-2xl font-bold mb-2">The AI builds the brain.</h3>
                        <p className="text-foreground/60">Using neural acceleration to automate workflows, clean data, and predict outcomes for your enterprise.</p>
                    </motion.div>

                    {/* Card 3 - Engineering */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="col-span-1 md:col-span-2 row-span-1 glass-panel rounded-3xl p-8 flex flex-col justify-end relative overflow-hidden group hover:border-primary/30 transition-colors"
                    >
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] group-hover:bg-primary/20 transition-colors" />
                        <div className="mb-auto flex gap-4">
                            <div className="flex gap-2">
                                {[1, 2, 3].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary/50" />)}
                            </div>
                        </div>
                        <div className="absolute top-8 right-8">
                            <SearchCode className="w-10 h-10 text-primary opacity-50 relative z-10" />
                        </div>
                        <h3 className="text-2xl font-bold mb-2">The Dev ships the engine.</h3>
                        <p className="text-foreground/60 w-3/4">We don&apos;t use heavy legacy frameworks. Modern Next.js apps, robust database schema, and high-velocity shipping cycles.</p>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}
