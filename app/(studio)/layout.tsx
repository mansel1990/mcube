import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { StudioContact } from "@/components/studio/contact";
import { StudioFooter } from "@/components/studio/footer";
import { StudioHeader } from "@/components/studio/header";
import { WHATSAPP_URL } from "@/components/studio/content";
import { WhatsAppIcon } from "@/components/studio/icons";
import "./studio.css";

const display = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-studio-display",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-studio-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-studio-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MCube Tech Studio",
    template: "%s · MCube Tech Studio",
  },
  description:
    "We turn the manual bottlenecks in your business into clean web and mobile apps. Small scope, fast launch, and one person accountable from first message to go-live.",
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${display.variable} ${sans.variable} ${mono.variable} studio`}>
      <StudioHeader />
      <main>{children}</main>
      <StudioContact />
      <StudioFooter />
      <a className="fab" href={WHATSAPP_URL} target="_blank" rel="noopener" aria-label="Message us on WhatsApp">
        <WhatsAppIcon size={26} />
      </a>
    </div>
  );
}
