import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { PhilosophyArticle } from "@/components/about/articles";

export const metadata: Metadata = {
  title: "Our philosophy",
  robots: "noindex, nofollow",
};

export default function PhilosophyPage() {
  const markdown = readFileSync(path.join(process.cwd(), "content", "philosophy.md"), "utf8");
  return <PhilosophyArticle markdown={markdown} />;
}
