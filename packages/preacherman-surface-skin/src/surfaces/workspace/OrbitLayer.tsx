import { useState } from "react";
import orbitSecondaryAsset from "../../assets/figma/281-538/orbit-secondary.svg";
import orbitSlowAsset from "../../assets/figma/281-538/orbit-slow.svg";
import haloMemoryAsset from "../../assets/figma/281-538/halo-memory.svg";
import haloSkillAsset from "../../assets/figma/281-538/halo-skill.svg";
import type { SurfaceViewProps } from "../../adapter/types";
import { orbitNodeCommand } from "./commands";

type OrbitLayerProps = Pick<SurfaceViewProps, "dispatch">;

const orbitNodes = [
  { id: "memory-core", label: "Memory Core", asset: haloMemoryAsset, orbit: "slow", phase: "first" },
  { id: "research-scout", label: "Research Scout", asset: haloSkillAsset, orbit: "slow", phase: "second" },
  { id: "code-copilot", label: "Code Copilot", asset: haloSkillAsset, orbit: "secondary", phase: "first" },
  { id: "insight-miner", label: "Insight Miner", asset: haloSkillAsset, orbit: "secondary", phase: "second" },
] as const;

function nodeClassName(
  orbit: "slow" | "secondary",
  phase: "first" | "second",
  isHighlighted = false,
) {
  return `pm-workspace__orbit-node pm-workspace__orbit-node--${orbit} pm-workspace__orbit-node--${phase}${isHighlighted ? " is-highlighted" : ""}`;
}

export function OrbitLayer({ dispatch }: OrbitLayerProps) {
  const [activeNode, setActiveNode] = useState<string | null>(null);

  return (
    <>
      <div aria-hidden="true" className="pm-workspace__orbit-layer pm-workspace__orbit-layer--back">
        <img alt="" className="pm-workspace__orbit pm-workspace__orbit--slow" src={orbitSlowAsset} />
        <img alt="" className="pm-workspace__orbit pm-workspace__orbit--secondary" src={orbitSecondaryAsset} />
      </div>

      <div aria-hidden="true" className="pm-workspace__orbit-node-layer pm-workspace__orbit-node-layer--back">
        {orbitNodes.map((node) => (
          <span className={nodeClassName(node.orbit, node.phase, activeNode === node.id)} key={node.id}>
            <img alt="" src={node.asset} />
          </span>
        ))}
      </div>

      <div aria-hidden="true" className="pm-workspace__orbit-layer pm-workspace__orbit-layer--front">
        <img alt="" className="pm-workspace__orbit pm-workspace__orbit--slow" src={orbitSlowAsset} />
        <img alt="" className="pm-workspace__orbit pm-workspace__orbit--secondary" src={orbitSecondaryAsset} />
      </div>
      <div aria-hidden="true" className="pm-workspace__orbit-node-layer pm-workspace__orbit-node-layer--front">
        {orbitNodes.map((node) => (
          <span className={nodeClassName(node.orbit, node.phase, activeNode === node.id)} key={node.id}>
            <img alt="" src={node.asset} />
          </span>
        ))}
      </div>

      <div className="pm-workspace__orbit-node-layer pm-workspace__orbit-node-layer--hit">
        {orbitNodes.map((node) => (
          <button
            aria-label={node.label}
            className={nodeClassName(node.orbit, node.phase)}
            data-orbit-node={node.id}
            key={node.id}
            onBlur={() => setActiveNode(null)}
            onClick={() => void dispatch(orbitNodeCommand(node.id, node.label))}
            onFocus={() => setActiveNode(node.id)}
            onMouseEnter={() => setActiveNode(node.id)}
            onMouseLeave={() => setActiveNode(null)}
            type="button"
          />
        ))}
      </div>
    </>
  );
}
