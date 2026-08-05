import type {
  AvatarActionDescriptor,
  AvatarMotionState,
  PlayActionOptions,
} from "../types/avatarAnimation";

export interface AvatarAnimationPort {
  load(): Promise<void>;
  listActions(): AvatarActionDescriptor[];
  hasAction(id: string): boolean;
  play(id: string, options?: PlayActionOptions): Promise<void>;
  crossFadeTo(id: string, duration?: number): Promise<void>;
  stop(id?: string): void;
  setState(state: AvatarMotionState): Promise<void>;
  dispose(): void;
}
