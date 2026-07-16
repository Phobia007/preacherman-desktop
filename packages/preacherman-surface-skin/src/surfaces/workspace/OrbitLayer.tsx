import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import haloMemoryAsset from "../../assets/figma/281-538/halo-memory.svg";
import haloSkillAsset from "../../assets/figma/281-538/halo-skill.svg";
import type { SurfaceViewProps } from "../../adapter/types";
import { orbitNodeCommand } from "./commands";
import {
  orbitFrameAtElapsed,
  orbitTrackPaths,
  workspaceOrbitDefinitions,
} from "./orbitGeometry";

type OrbitLayerProps = Pick<SurfaceViewProps, "dispatch">;

const NODE_RADIUS = 36;
const nodeAssets: Record<string, string> = {
  "memory-core": haloMemoryAsset,
  "research-scout": haloSkillAsset,
  "code-copilot": haloSkillAsset,
  "insight-miner": haloSkillAsset,
};
const initialElapsedByOrbit: Record<string, number> = {
  slow: 0,
  secondary: workspaceOrbitDefinitions[1].durationMs * 0.25,
};

export function OrbitLayer({ dispatch }: OrbitLayerProps) {
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [elapsedByOrbit, setElapsedByOrbit] = useState(initialElapsedByOrbit);
  const pausedOrbit = useRef<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    let previousTime = performance.now();
    let animationFrame = 0;
    const advance = (time: number) => {
      const delta = Math.min(time - previousTime, 64);
      previousTime = time;
      setElapsedByOrbit((current) => {
        const next = { ...current };
        for (const orbit of workspaceOrbitDefinitions) {
          if (pausedOrbit.current !== orbit.id) {
            next[orbit.id] = current[orbit.id] + delta;
          }
        }
        return next;
      });
      animationFrame = window.requestAnimationFrame(advance);
    };
    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  const frames = workspaceOrbitDefinitions.map((orbit) => {
    const frame = orbitFrameAtElapsed(orbit, elapsedByOrbit[orbit.id]);
    return { orbit, frame, paths: orbitTrackPaths(orbit, frame.tiltRadians) };
  });

  const activateNode = (nodeId: string, orbitId: string) => {
    pausedOrbit.current = orbitId;
    setActiveNode(nodeId);
  };
  const clearActiveNode = () => {
    pausedOrbit.current = null;
    setActiveNode(null);
  };

  return (
    <>
      <svg
        aria-hidden="true"
        className="pm-workspace__orbit-track-layer pm-workspace__orbit-track-layer--back"
        viewBox="0 0 1800 1000"
      >
        {frames.map(({ orbit, paths }) => (
          <path
            className={`pm-workspace__orbit-track pm-workspace__orbit-track--${orbit.id}`}
            d={paths.back}
            key={orbit.id}
            strokeOpacity={orbit.strokeOpacity}
          />
        ))}
      </svg>

      <svg
        aria-hidden="true"
        className="pm-workspace__orbit-track-layer pm-workspace__orbit-track-layer--front"
        viewBox="0 0 1800 1000"
      >
        {frames.map(({ orbit, paths }) => (
          <path
            className={`pm-workspace__orbit-track pm-workspace__orbit-track--${orbit.id}`}
            d={paths.front}
            key={orbit.id}
            strokeOpacity={orbit.strokeOpacity}
          />
        ))}
      </svg>

      <div className="pm-workspace__orbit-node-layer">
        {frames.flatMap(({ orbit, frame }) => frame.nodes.map((node) => {
          const position = {
            left: `${node.x - NODE_RADIUS}px`,
            top: `${node.y - NODE_RADIUS}px`,
          } satisfies CSSProperties;
          return (
            <Fragment key={node.id}>
              <span
                aria-hidden="true"
                className={`pm-workspace__orbit-node pm-workspace__orbit-node-visual${activeNode === node.id ? " is-highlighted" : ""}`}
                data-orbit-visual={node.id}
                style={{ ...position, zIndex: node.layer === "front" ? 4 : 1 }}
              >
                <img alt="" src={nodeAssets[node.id]} />
              </span>
              <button
                aria-label={node.label}
                className="pm-workspace__orbit-node pm-workspace__orbit-node-hit"
                data-orbit-id={orbit.id}
                data-orbit-layer={node.layer}
                data-orbit-node={node.id}
                onBlur={clearActiveNode}
                onClick={() => void dispatch(orbitNodeCommand(node.id, node.label))}
                onFocus={() => activateNode(node.id, orbit.id)}
                onMouseEnter={() => activateNode(node.id, orbit.id)}
                onMouseLeave={clearActiveNode}
                style={position}
                type="button"
              />
            </Fragment>
          );
        }))}
      </div>
    </>
  );
}
