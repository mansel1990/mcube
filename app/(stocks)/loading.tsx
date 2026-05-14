export default function StocksLoading() {
  return (
    <div className="h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header skeleton */}
      <div className="px-4 md:px-6 pt-5 pb-3 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-200 animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-slate-200 animate-pulse" />
            <div className="h-3 w-56 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Card grid skeleton */}
      <div className="flex-1 overflow-hidden p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-2xl bg-white shadow-sm border border-slate-200/60 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
                <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
              </div>
              <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
                <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
                <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
