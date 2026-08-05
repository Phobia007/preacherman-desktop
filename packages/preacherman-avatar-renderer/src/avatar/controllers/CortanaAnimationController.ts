import type { AvatarAnimationPort } from "../contracts/AvatarAnimationPort";
import type {
  AvatarActionDescriptor,
  AvatarMotionState,
  PlayActionOptions,
} from "../types/avatarAnimation";

export class CortanaAnimationController implements AvatarAnimationPort {
  constructor(private readonly port: AvatarAnimationPort) {}

  load(): Promise<void> {
    return this.port.load();
  }

  listActions(): AvatarActionDescriptor[] {
    return this.port.listActions();
  }

  hasAction(id: string): boolean {
    return this.port.hasAction(id);
  }

  play(id: string, options?: PlayActionOptions): Promise<void> {
    return this.port.play(id, options);
  }

  crossFadeTo(id: string, duration?: number): Promise<void> {
    return this.port.crossFadeTo(id, duration);
  }

  stop(id?: string): void {
    this.port.stop(id);
  }

  setState(state: AvatarMotionState): Promise<void> {
    return this.port.setState(state);
  }

  dispose(): void {
    this.port.dispose();
  }
}
