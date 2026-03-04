"use client";

import { motion } from "framer-motion";
import { Search, Rocket, Settings2 } from "lucide-react";

const services = [
    {
        icon: Search,
        title: "The Discovery Audit",
        timeline: "1-Week Sprint",
        description: "A deep-dive into your requirements, tech stack analysis, and data flow architecture before writing code. We define the logic and the optimal path forward.",
        color: "ring-champagne/30 group-hover:ring-champagne/60 bg-champagne/5 text-champagne",
        border: "border-champagne/20 group-hover:border-champagne/50"
    },
    {
        icon: Rocket,
        title: "The AI MVP",
        timeline: "4-6 Week Build",
        description: "Build-to-launch velocity. We ship a fully-functional, production-ready MVP that integrates AI tooling, modern frameworks, and robust deployment pipelines.",
        color: "ring-accent/30 group-hover:ring-accent/60 bg-accent/5 text-accent",
        border: "border-accent/20 group-hover:border-accent/50"
    },
    {
        icon: Settings2,
        title: "Scale Engineering",
        timeline: "Ongoing Partnership",
        description: "Refactoring legacy monolithic apps into scalable microservices. Integrating new AI endpoints, optimizing database performance, and strengthening the core engine.",
        color: "ring-primary/30 group-hover:ring-primary/60 bg-primary/5 text-primary",
        border: "border-primary/20 group-hover:border-primary/50"
    }
];

export function Services() {
    return (
        <section id="process" className="py-24 relative">
            {/* Background accent */}
            <div className="absolute top-1/2 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] -z-10" />

            <div className="container mx-auto px-6 md:px-12">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                        How we execute.
                    </h2>
                    <p className="text-foreground/70 max-w-2xl mx-auto text-lg">
                        A precise, measured approach to software engineering. Starting small to validate, then scaling with confidence.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 relative">
                    {/* Connecting Line (Desktop only) */}
                    <div className="hidden md:block absolute top-[44px] left-12 right-12 h-px bg-foreground/10 -z-10" />

                    {services.map((service, index) => {
                        const Icon = service.icon;
                        return (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.2, duration: 0.5 }}
                                className={`group flex flex-col p-8 rounded-3xl bg-surface/40 backdrop-blur-sm border transition-all duration-300 ${service.border} hover:bg-surface/60`}
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ring-1 transition-all duration-300 mb-8 ${service.color}`}>
                                    <Icon size={28} />
                                </div>

                                <div className="mb-4">
                                    <span className="text-xs font-bold uppercase tracking-widest text-foreground/50 mb-2 block">{service.timeline}</span>
                                    <h3 className="text-2xl font-bold text-foreground">{service.title}</h3>
                                </div>

                                <p className="text-foreground/60 leading-relaxed">
                                    {service.description}
                                </p>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
