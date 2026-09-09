import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

/** Bounded diagnostic samples on the Canvas; no HUD or React render per frame. */
export function AvatarFrameMetrics() {
  const { gl } = useThree();
  const sample = useRef({ start: 0, last: 0, intervals: [] as number[] });
  useFrame(() => {
    const now = performance.now(), data = sample.current;
    if (!data.start || now - data.last > 250) {
      data.start = now; data.last = now; data.intervals.length = 0;
      return;
    }
    if (data.intervals.length < 1024) data.intervals.push(now - data.last);
    data.last = now;
    if (now - data.start < 2000) return;
    const intervals = data.intervals.sort((a, b) => a - b);
    gl.domElement.dataset.avatarMetrics = JSON.stringify({
      samples: intervals.length,
      frameMsP95: intervals[Math.floor(intervals.length * 0.95)],
      drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
    });
    data.start = now; data.intervals.length = 0;
  });
  return null;
}
