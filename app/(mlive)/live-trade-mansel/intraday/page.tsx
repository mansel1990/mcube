import { IntradayView } from "@/components/mlive/intraday-view";
import { intradayRetired } from "@/lib/mlive/capabilities";
import { settingsMap } from "@/lib/mlive/read";

export default async function Page() {
  const settings = await settingsMap();
  if (intradayRetired(settings.intraday_retired)) {
    return (
      <section className="page">
        <h1>Intraday</h1>
        <p className="sub">Intraday was retired on 18 Nov 2026. Its code, candles, and research runs are still stored.</p>
      </section>
    );
  }
  return <IntradayView />;
}
