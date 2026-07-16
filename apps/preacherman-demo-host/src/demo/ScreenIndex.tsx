import { figmaScreenRegistry, pdfReconciliation } from "./figmaScreenRegistry";

interface ScreenIndexProps {
  readonly onOpenScreen: (screenId: string) => void;
}

export function ScreenIndex({ onOpenScreen }: ScreenIndexProps) {
  const implementedCount = figmaScreenRegistry.filter(
    (screen) => screen.implementationStatus === "implemented",
  ).length;

  return (
    <section aria-labelledby="screen-index-title" className="screen-index">
      <header className="screen-index__header">
        <p className="screen-index__eyebrow">PREACHERMAN · DEMO HOST</p>
        <h1 id="screen-index-title">Figma Screen Index</h1>
        <p>
          {implementedCount} implemented · {figmaScreenRegistry.length - implementedCount} pending · {pdfReconciliation}
        </p>
      </header>

      <div className="screen-index__table-wrap">
        <table className="screen-index__table">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Figma page</th>
              <th scope="col">Screen node</th>
              <th scope="col">Domain / Flow</th>
              <th scope="col">Backend index</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {figmaScreenRegistry.map((screen) => {
              const implemented = screen.implementationStatus === "implemented";
              return (
                <tr key={screen.screenId}>
                  <td>{String(screen.order + 1).padStart(2, "0")}</td>
                  <td>
                    <strong>{screen.pageName}</strong>
                    <span>{screen.pageId}</span>
                  </td>
                  <td>
                    <span>{screen.screenNodeId}</span>
                    <small>{screen.nodeType} · {screen.width}×{screen.height}</small>
                  </td>
                  <td>
                    <span>{screen.domain}</span>
                    <small>{screen.userFlow}</small>
                  </td>
                  <td>{screen.backendScreenIndex}</td>
                  <td>
                    <button
                      className={`screen-index__status screen-index__status--${screen.implementationStatus}`}
                      disabled={!implemented}
                      onClick={() => implemented && onOpenScreen(screen.screenId)}
                      type="button"
                    >
                      {implemented ? "Implemented" : "Pending"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
