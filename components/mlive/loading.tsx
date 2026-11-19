function Bar({ className }: { className: string }) {
  return <span className={className} />;
}

function Rows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => <Bar key={index} className="skel skel-row" />)}
    </>
  );
}

function TodayShape() {
  return (
    <>
      <div className="skel-head">
        <Bar className="skel skel-line title" />
        <Bar className="skel skel-pills" />
      </div>
      <div className="skel-stats">
        <Bar className="skel skel-stat" />
        <Bar className="skel skel-stat" />
        <Bar className="skel skel-stat" />
        <Bar className="skel skel-stat" />
      </div>
      <div className="skel-split">
        <Bar className="skel skel-chart" />
        <Bar className="skel skel-card" />
      </div>
      <div className="skel skel-card"><Rows count={4} /></div>
      <div className="skel-split">
        <Bar className="skel skel-card" />
        <Bar className="skel skel-card" />
      </div>
    </>
  );
}

function SwingShape() {
  return (
    <>
      <Bar className="skel skel-line title" />
      <Bar className="skel skel-strip" />
      <div className="skel skel-card"><Rows count={4} /></div>
      <div className="skel-split swing">
        <Bar className="skel skel-card" />
        <Bar className="skel skel-card" />
      </div>
    </>
  );
}

function ResearchShape() {
  return (
    <>
      <div className="skel-head">
        <Bar className="skel skel-line title" />
        <Bar className="skel skel-tabs" />
      </div>
      <div className="skel skel-card tall">
        <Bar className="skel skel-label" />
        <Bar className="skel skel-number" />
        <div className="skel-tiles"><Rows count={5} /></div>
      </div>
      <Bar className="skel skel-row" />
    </>
  );
}

function LongShape() {
  return (
    <>
      <Bar className="skel skel-line title" />
      <Bar className="skel skel-row" />
      <div className="skel-stats">
        <Bar className="skel skel-stat" />
        <Bar className="skel skel-stat" />
        <Bar className="skel skel-stat" />
        <Bar className="skel skel-stat" />
      </div>
      <div className="skel skel-card tall"><Rows count={4} /></div>
    </>
  );
}

function PlainShape() {
  return (
    <>
      <Bar className="skel skel-line title" />
      <div className="skel skel-card">
        <Bar className="skel skel-label" />
        <Bar className="skel skel-number" />
        <Rows count={3} />
      </div>
    </>
  );
}

export function PageSkeleton({ kind, label }: { kind: string; label: string }) {
  return (
    <section className={`page skel-page skel-${kind}`} aria-busy="true">
      <p className="sr-only" role="status">{label}</p>
      <div aria-hidden="true">
        {kind === "today" ? <TodayShape /> : null}
        {kind === "swing" ? <SwingShape /> : null}
        {kind === "research" ? <ResearchShape /> : null}
        {kind === "long" ? <LongShape /> : null}
        {kind !== "today" && kind !== "swing" && kind !== "research" && kind !== "long" ? <PlainShape /> : null}
      </div>
    </section>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="page">
      <article className="card load-error">
        <p>{message}</p>
        <button type="button" className="btn" onClick={onRetry}>Retry</button>
      </article>
    </section>
  );
}

export function ButtonSpinner() {
  return <span className="spinner" aria-hidden="true" />;
}
