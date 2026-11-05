import { Suspense } from "react";
import { SettingsView } from "@/components/mlive/settings-view";

export default function Page() {
  return (
    <Suspense fallback={<p className="page">Loading settings…</p>}>
      <SettingsView />
    </Suspense>
  );
}
