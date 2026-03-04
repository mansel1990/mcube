"use client";

import { motion } from "framer-motion";
import { ArrowRight, Code2, BrainCircuit, Diamond } from "lucide-react";

export function Hero() {
    return (
        <section className="relative min-h-[90vh] flex items-center pt-32 pb-16 overflow-hidden">
            {/* Background glow effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-primary/10 rounded-full blur-[120px] -z-10 animate-pulse" />
            <div className="absolute top-1/4 right-1/4 w-[30vw] h-[30vw] max-w-[400px] max-h-[400px] bg-accent/10 rounded-full blur-[90px] -z-10" />

            <div className="container mx-auto px-6 md:px-12 grid lg:grid-cols-2 gap-12 items-center relative z-10">
                {/* Left Content */}
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="max-w-2xl"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-accent/20 text-accent text-xs font-semibold uppercase tracking-wider mb-6"
                    >
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        Senior Engineering Boutique
                    </motion.div>

                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight mb-6">
                        We build the <br className="hidden md:block" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent relative glow-text">
                            systems that run
                        </span>{" "}
                        your business.
                    </h1>

                    <p className="text-lg md:text-xl text-foreground/70 mb-10 leading-relaxed">
                        A senior-led Product Pod (PM + Full-Stack + AI) that turns complex
                        requirements into production-ready software. No juniors. No overhead.
                        <span className="text-foreground font-semibold"> Just high-velocity execution.</span>
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <LinkToContact />
                        <button className="px-8 py-4 rounded-full bg-surface border border-foreground/10 text-foreground font-medium hover:bg-foreground/5 hover:border-foreground/30 transition-all duration-300">
                            View Our Process
                        </button>
                    </div>
                </motion.div>

                {/* Right 3D Cube / Visual */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                    className="relative h-[400px] md:h-[500px] flex items-center justify-center w-full"
                >
                    {/* A high-end CSS-only representation of the M³ Cube */}
                    <div className="relative w-64 h-64 md:w-80 md:h-80 preserve-3d animate-spin-slow group">

                        {/* Front Face - Logic (PM) */}
                        <div className="absolute inset-0 border-2 border-champagne/40 bg-surface/50 backdrop-blur-md flex flex-col items-center justify-center shadow-[0_0_30px_rgba(242,227,198,0.1)] group-hover:border-champagne group-hover:shadow-[0_0_50px_rgba(242,227,198,0.2)] transition-all duration-500 face-front">
                            <Diamond className="w-10 h-10 md:w-12 md:h-12 text-champagne mb-4" />
                            <span className="text-champagne font-bold text-base md:text-lg tracking-widest uppercase">Logic</span>
                        </div>

                        {/* Back Face - Deployment */}
                        <div className="absolute inset-0 border-2 border-foreground/20 bg-surface/80 flex flex-col items-center justify-center backdrop-blur-md face-back">
                            <span className="text-foreground/80 font-bold text-base md:text-lg tracking-widest uppercase">Deployment</span>
                        </div>

                        {/* Left Face - Intelligence */}
                        <div className="absolute inset-0 border-2 border-accent/40 bg-surface/50 backdrop-blur-md flex flex-col items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.1)] group-hover:border-accent group-hover:shadow-[0_0_50px_rgba(6,182,212,0.2)] transition-all duration-500 face-left">
                            <BrainCircuit className="w-10 h-10 md:w-12 md:h-12 text-accent mb-4" />
                            <span className="text-accent font-bold text-base md:text-lg tracking-widest uppercase">Intelligence</span>
                        </div>

                        {/* Right Face - Engine */}
                        <div className="absolute inset-0 border-2 border-primary/40 bg-surface/50 backdrop-blur-md flex flex-col items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.1)] group-hover:border-primary group-hover:shadow-[0_0_50px_rgba(37,99,235,0.2)] transition-all duration-500 face-right">
                            <Code2 className="w-10 h-10 md:w-12 md:h-12 text-primary mb-4" />
                            <span className="text-primary font-bold text-base md:text-lg tracking-widest uppercase">Engine</span>
                        </div>

                        {/* Top Face - Hosting */}
                        <div className="absolute inset-0 border-2 border-foreground/20 bg-surface/80 flex flex-col items-center justify-center backdrop-blur-md face-top">
                            <span className="text-foreground/80 font-bold text-base md:text-lg tracking-widest uppercase">Hosting</span>
                        </div>

                        {/* Bottom Face - Scale */}
                        <div className="absolute inset-0 border-2 border-foreground/20 bg-surface/80 flex flex-col items-center justify-center backdrop-blur-md face-bottom">
                            <span className="text-foreground/80 font-bold text-base md:text-lg tracking-widest uppercase">Scale</span>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Add CSS for 3D preservation to globals */}
            <style dangerouslySetInnerHTML={{
                __html: `
        .preserve-3d { transform-style: preserve-3d; }
        
        .face-front  { transform: rotateY(  0deg) translateZ(9rem); }
        .face-back   { transform: rotateY(180deg) translateZ(9rem); }
        .face-right  { transform: rotateY( 90deg) translateZ(12rem); }
        .face-left   { transform: rotateY(-90deg) translateZ(12rem); }
        .face-top    { transform: rotateX( 90deg) translateZ(9rem); }
        .face-bottom { transform: rotateX(-90deg) translateZ(9rem); }

        @media (min-width: 768px) {
            .face-front  { transform: rotateY(  0deg) translateZ(12rem); }
            .face-back   { transform: rotateY(180deg) translateZ(12rem); }
            .face-right  { transform: rotateY( 90deg) translateZ(16rem); }
            .face-left   { transform: rotateY(-90deg) translateZ(16rem); }
            .face-top    { transform: rotateX( 90deg) translateZ(12rem); }
            .face-bottom { transform: rotateX(-90deg) translateZ(12rem); }
        }

        @keyframes spin-slow {
          0% { transform: rotateX(-20deg) rotateY(0deg); }
          100% { transform: rotateX(-20deg) rotateY(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 24s linear infinite;
        }
      `}} />
        </section>
    );
}

// Extracted button for clean 'use client' boundary if needed, though Hero is already use client
function LinkToContact() {
    return (
        <a
            href="#contact"
            className="group relative px-8 py-4 rounded-full bg-primary text-white font-medium overflow-hidden shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:shadow-[0_0_50px_rgba(37,99,235,0.5)] transition-all duration-300 flex items-center justify-center gap-2"
        >
            <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-primary via-accent to-primary background-animate opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[length:200%_auto]" />
            <span className="relative z-10 flex items-center gap-2">
                Start a Discovery Sprint
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <style dangerouslySetInnerHTML={{
                __html: `
         @keyframes shine {
            to { background-position: 200% center; }
         }
         .background-animate { animation: shine 3s linear infinite; }
      `}} />
        </a>
    );
}
