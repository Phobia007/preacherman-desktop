const FULL_TURN = Math.PI * 2;

export type OrbitLayerDepth = "back" | "front";

export interface WorkspaceOrbitNodeDefinition {
  id: string;
  label: string;
  phaseOffset: number;
}

export interface WorkspaceOrbitDefinition {
  id: "slow" | "secondary";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  initialTiltRadians: number;
  durationMs: number;
  direction: 1 | -1;
  strokeOpacity: number;
  nodes: readonly [WorkspaceOrbitNodeDefinition, WorkspaceOrbitNodeDefinition];
}

export interface OrbitNodeFrame extends WorkspaceOrbitNodeDefinition {
  x: number;
  y: number;
  phase: number;
  depth: number;
  layer: OrbitLayerDepth;
}

export interface OrbitFrame {
  progress: number;
  tiltRadians: number;
  nodes: readonly [OrbitNodeFrame, OrbitNodeFrame];
}

export const workspaceOrbitDefinitions = [
  {
    id: "slow",
    cx: 900,
    cy: 458,
    rx: 351.5,
    ry: 124.5,
    initialTiltRadians: -8 * Math.PI / 180,
    durationMs: 44_000,
    direction: 1,
    strokeOpacity: 0.16,
    nodes: [
      { id: "memory-core", label: "Memory Core", phaseOffset: 0 },
      { id: "research-scout", label: "Research Scout", phaseOffset: Math.PI },
    ],
  },
  {
    id: "secondary",
    cx: 900,
    cy: 468.5,
    rx: 336.5,
    ry: 86,
    initialTiltRadians: 13 * Math.PI / 180,
    durationMs: 36_000,
    direction: -1,
    strokeOpacity: 0.1,
    nodes: [
      { id: "code-copilot", label: "Code Copilot", phaseOffset: 0 },
      { id: "insight-miner", label: "Insight Miner", phaseOffset: Math.PI },
    ],
  },
] as const satisfies readonly WorkspaceOrbitDefinition[];

function normalizePhase(phase: number) {
  return ((phase % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function pointOnRotatedEllipse(
  orbit: WorkspaceOrbitDefinition,
  phase: number,
  tiltRadians: number,
) {
  const localX = orbit.rx * Math.cos(phase);
  const localY = orbit.ry * Math.sin(phase);
  const cosTilt = Math.cos(tiltRadians);
  const sinTilt = Math.sin(tiltRadians);
  return {
    x: orbit.cx + localX * cosTilt - localY * sinTilt,
    y: orbit.cy + localX * sinTilt + localY * cosTilt,
  };
}

export function orbitFrameAtElapsed(
  orbit: WorkspaceOrbitDefinition,
  elapsedMs: number,
): OrbitFrame {
  const progress = ((elapsedMs % orbit.durationMs) + orbit.durationMs) % orbit.durationMs / orbit.durationMs;
  const orbitPhase = orbit.direction * progress * FULL_TURN;
  const tiltRadians = orbit.initialTiltRadians + orbitPhase;
  const nodes = orbit.nodes.map((node) => {
    const phase = normalizePhase(orbitPhase + node.phaseOffset);
    const point = pointOnRotatedEllipse(orbit, phase, tiltRadians);
    const depth = Math.sin(phase);
    return {
      ...node,
      ...point,
      phase,
      depth,
      layer: depth >= 0 ? "front" : "back",
    } satisfies OrbitNodeFrame;
  }) as unknown as readonly [OrbitNodeFrame, OrbitNodeFrame];

  return { progress, tiltRadians, nodes };
}

export function ellipseEquationValue(
  orbit: WorkspaceOrbitDefinition,
  point: Pick<OrbitNodeFrame, "x" | "y">,
  tiltRadians: number,
) {
  const dx = point.x - orbit.cx;
  const dy = point.y - orbit.cy;
  const cosTilt = Math.cos(tiltRadians);
  const sinTilt = Math.sin(tiltRadians);
  const localX = dx * cosTilt + dy * sinTilt;
  const localY = -dx * sinTilt + dy * cosTilt;
  return (localX * localX) / (orbit.rx * orbit.rx) + (localY * localY) / (orbit.ry * orbit.ry);
}

function arcPath(
  orbit: WorkspaceOrbitDefinition,
  tiltRadians: number,
  startPhase: number,
  endPhase: number,
) {
  const samples = 64;
  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const phase = startPhase + (endPhase - startPhase) * index / samples;
    return pointOnRotatedEllipse(orbit, phase, tiltRadians);
  });
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(" ");
}

export function orbitTrackPaths(
  orbit: WorkspaceOrbitDefinition,
  tiltRadians: number,
) {
  return {
    front: arcPath(orbit, tiltRadians, 0, Math.PI),
    back: arcPath(orbit, tiltRadians, Math.PI, FULL_TURN),
  } as const;
}
