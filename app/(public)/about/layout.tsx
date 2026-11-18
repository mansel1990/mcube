import type { Metadata } from "next";
import "./about.css";

export const metadata: Metadata = {
  robots: "noindex, nofollow",
  title: "Mansel Live",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="about-page">
      <main className="about-wrap">
        <p className="about-kicker">Mansel Live</p>
        {children}
        <p className="about-foot">Mansel Live · read-only</p>
      </main>
    </div>
  );
}
