import type { Locale } from "../preferences";

export type SpeechLifecycle = "idle" | "starting" | "playing" | "stopping";

export interface SpeechRequest {
  readonly generationId: string;
  readonly audioStreamId: string;
  readonly interactionEpoch: number;
  readonly taskId?: string;
  readonly text: string;
  readonly locale: Locale;
}

export interface PresentationAdapter {
  speak(request: SpeechRequest): void;
  stopSpeech(reason: "user_action" | "new_request"): void;
}

export interface TaskCancellationAdapter {
  cancelTask(taskRunId: string): Promise<void>;
}

type TranscriptListener = (text: string) => void;
type SpeechListener = (lifecycle: SpeechLifecycle) => void;

export class LiveCoordinator {
  private presentationAdapter: PresentationAdapter | null = null;
  private taskCancellationAdapter: TaskCancellationAdapter | null = null;
  private readonly transcriptListeners = new Set<TranscriptListener>();
  private readonly speechListeners = new Set<SpeechListener>();
  private speechLifecycle: SpeechLifecycle = "idle";
  private interactionEpoch = 0;

  connectPresentationAdapter(adapter: PresentationAdapter): () => void {
    this.presentationAdapter = adapter;
    return () => {
      if (this.presentationAdapter === adapter) this.presentationAdapter = null;
    };
  }

  connectTaskCancellationAdapter(adapter: TaskCancellationAdapter): () => void {
    this.taskCancellationAdapter = adapter;
    return () => {
      if (this.taskCancellationAdapter === adapter) this.taskCancellationAdapter = null;
    };
  }

  requestSpeech(text: string, locale: Locale, taskId?: string): boolean {
    const content = text.trim();
    if (!content || !this.presentationAdapter) return false;
    const generationId = `generation_${crypto.randomUUID()}`;
    this.presentationAdapter.speak({
      generationId,
      audioStreamId: `audio_${crypto.randomUUID()}`,
      interactionEpoch: ++this.interactionEpoch,
      taskId,
      text: content,
      locale,
    });
    return true;
  }

  stopSpeech(): boolean {
    if (!this.presentationAdapter || this.speechLifecycle === "idle") return false;
    this.presentationAdapter.stopSpeech("user_action");
    return true;
  }

  reportSpeechLifecycle(lifecycle: SpeechLifecycle): void {
    if (this.speechLifecycle === lifecycle) return;
    this.speechLifecycle = lifecycle;
    for (const listener of this.speechListeners) listener(lifecycle);
  }

  getSpeechLifecycle(): SpeechLifecycle {
    return this.speechLifecycle;
  }

  onSpeechLifecycle(listener: SpeechListener): () => void {
    this.speechListeners.add(listener);
    return () => this.speechListeners.delete(listener);
  }

  deliverFinalTranscript(text: string): void {
    const content = text.trim();
    if (!content) return;
    for (const listener of this.transcriptListeners) listener(content);
  }

  onFinalTranscript(listener: TranscriptListener): () => void {
    this.transcriptListeners.add(listener);
    return () => this.transcriptListeners.delete(listener);
  }

  async cancelTask(taskRunId: string): Promise<boolean> {
    if (!taskRunId || !this.taskCancellationAdapter) return false;
    await this.taskCancellationAdapter.cancelTask(taskRunId);
    return true;
  }
}
