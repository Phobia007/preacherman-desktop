import type { SurfaceCommand, SurfaceCommandResult } from "@preacherman/surface-skin";

export interface DemoActionEntry {
  readonly sequence: number;
  readonly timestamp: string;
  readonly command: SurfaceCommand;
  readonly result: SurfaceCommandResult;
}

export interface DemoActionLog {
  record(command: SurfaceCommand, result: SurfaceCommandResult): void;
  entries(): ReadonlyArray<DemoActionEntry>;
}

export function createDemoActionLog(): DemoActionLog {
  const entries: DemoActionEntry[] = [];

  return {
    record(command, result) {
      const entry = {
        sequence: entries.length + 1,
        timestamp: new Date().toISOString(),
        command,
        result,
      };
      entries.push(entry);
      console.info("[DemoHostBridge]", entry);
    },
    entries() {
      return entries.slice();
    },
  };
}
