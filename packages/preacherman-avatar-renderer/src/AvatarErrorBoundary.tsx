import { Component, type ErrorInfo, type ReactNode } from "react";
import { normalizeAvatarError, type AvatarError } from "./types";

interface AvatarErrorBoundaryProps {
  readonly children: ReactNode;
  readonly resetKey?: string;
  readonly onError: (error: AvatarError) => void;
}
interface AvatarErrorBoundaryState {
  readonly failed: boolean;
}

export class AvatarErrorBoundary extends Component<
  AvatarErrorBoundaryProps,
  AvatarErrorBoundaryState
> {
  state: AvatarErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AvatarErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(normalizeAvatarError(error, "RENDER_FAILED"));
  }

  componentDidUpdate(previous: AvatarErrorBoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
