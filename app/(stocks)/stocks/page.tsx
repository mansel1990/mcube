import { SuggestionsPage } from "@/components/stocks/suggestions/suggestions-page";

export default function StocksPage() {
  return (
    <div className="h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col">
      <SuggestionsPage />
    </div>
  );
}
