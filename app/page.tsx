import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { Hero } from "./components/ui/Hero";
import { BentoGrid } from "./components/ui/BentoGrid";
import { Services } from "./components/ui/Services";
import { Customers } from "./components/ui/Customers";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Navbar />

      <main className="flex-1">
        <Hero />

        {/* Visual Separator */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent my-12" />

        <BentoGrid />

        {/* Visual Separator */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent my-12" />

        <Services />

        {/* Visual Separator */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent my-12" />

        <Customers />

        {/* Visual Separator */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent my-12" />

        {/* Contact Sprint CTA Section */}
        <section id="contact" className="py-24 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-2xl bg-primary/5 rounded-full blur-[100px] -z-10" />
          <div className="container mx-auto px-6 md:px-12 text-center max-w-4xl relative z-10">
            <div className="glass-panel p-12 md:p-16 rounded-[3rem] border border-primary/20 bg-surface/80">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Ready to architect?</h2>
              <p className="text-xl text-foreground/70 mb-10 max-w-2xl mx-auto">
                Book a Discovery Sprint. We&apos;ll map your requirements, audit the stack, and define the exact blueprint needed to ship.
              </p>
              <a
                href="mailto:hello@mcube.studio"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-primary text-white font-medium hover:bg-primary/80 transition-all glow-box shadow-[0_0_40px_rgba(37,99,235,0.4)]"
              >
                Start the Conversation
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
