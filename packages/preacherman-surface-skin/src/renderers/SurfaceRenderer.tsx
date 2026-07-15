import type { SurfaceViewProps } from "../adapter/types";

function readableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function SurfaceRenderer({ manifest, projection, tokenStyle, dispatch }: SurfaceViewProps) {
  const title = projection.title ?? manifest.title ?? manifest.surfaceType;
  const entries = Object.entries(projection.data ?? {});

  return (
    <section className="pm-surface-skin" style={tokenStyle} data-surface-type={manifest.surfaceType}>
      <header className="pm-surface-skin__header">
        <h1 className="pm-surface-skin__title">{title}</h1>
        {projection.summary ? <p className="pm-surface-skin__summary">{projection.summary}</p> : null}
      </header>

      {projection.status === "loading" ? <div className="pm-surface-skin__status" aria-live="polite">Loading</div> : null}
      {projection.status === "error" ? <div className="pm-surface-skin__error" role="alert">{projection.errorMessage ?? "Unable to load this surface."}</div> : null}

      {entries.length > 0 ? (
        <dl className="pm-surface-skin__data">
          {entries.map(([key, value]) => (
            <div className="pm-surface-skin__datum" key={key}>
              <dt>{key}</dt>
              <dd>{readableValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {projection.actions?.length ? (
        <footer className="pm-surface-skin__actions">
          {projection.actions.map((action) => (
            <button
              className={`pm-surface-skin__action pm-surface-skin__action--${action.variant ?? "secondary"}`}
              disabled={action.disabled}
              key={action.id}
              onClick={() => void dispatch(action.command)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </footer>
      ) : null}
    </section>
  );
}
