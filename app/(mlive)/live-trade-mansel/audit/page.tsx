import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuditView } from "@/components/mlive/audit-view";
import { PageSkeleton } from "@/components/mlive/loading";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : "";
  const book = typeof params.book === "string" && params.book !== "all" ? params.book : "";
  const bookQuery = book ? `&book=${book}` : "";
  if (tab === "pnl" || tab === "trades") redirect(`/live-trade-mansel/reports?tab=${tab}${bookQuery}`);
  if (tab === "charts") redirect(`/live-trade-mansel/charts${book ? `?book=${book}` : ""}`);
  return (
    <Suspense fallback={<PageSkeleton kind="audit" label="Loading audit" />}>
      <AuditView />
    </Suspense>
  );
}
