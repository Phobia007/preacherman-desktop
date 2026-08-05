export type VoiceInteractionState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type CodexTaskState =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface CodexTaskSnapshot {
  readonly id: string;
  readonly status: CodexTaskState;
  readonly instruction: string;
  readonly phase: string;
  readonly summary: string;
  readonly error: string | null;
}

interface RealtimeFunctionCall {
  readonly type: "function_call";
  readonly name: string;
  readonly call_id: string;
  readonly arguments: string;
}

interface RealtimeServerEvent {
  readonly type: string;
  readonly response?: {
    readonly output?: readonly RealtimeFunctionCall[];
  };
  readonly error?: {
    readonly message?: string;
  };
}

interface RealtimeVoiceClientCallbacks {
  readonly onStateChange: (state: VoiceInteractionState) => void;
  readonly onTaskChange: (task: CodexTaskSnapshot | null) => void;
  readonly onError: (message: string) => void;
}

const DEFAULT_SERVICE_URL = "http://127.0.0.1:8787";

const PREACHERMAN_INSTRUCTIONS = `
You are Preacherman, a natural, concise desktop voice assistant.
Speak in the user's language. Sound calm, direct, and conversational.
For coding or repository-change requests, call start_codex_task with the complete instruction.
Do not claim that a coding task is complete until the application reports completion.
While a task runs, continue the conversation normally and use get_codex_status when needed.
Use steer_codex_task when the user adds or corrects a requirement, and cancel_codex_task when asked to stop.
Keep spoken updates short and avoid Markdown formatting.
`.trim();

const CODEX_TOOLS = [
  {
    type: "function",
    name: "start_codex_task",
    description: "Start a coding task in the fixed local Preacherman workspace. Return immediately after the task is accepted.",
    parameters: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "A complete, implementation-ready description of the requested workspace change.",
        },
      },
      required: ["instruction"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "steer_codex_task",
    description: "Add or correct a requirement on an existing Codex task.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        instruction: { type: "string" },
      },
      required: ["taskId", "instruction"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_codex_status",
    description: "Get the current state and latest summary for a Codex task.",
    parameters: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "cancel_codex_task",
    description: "Cancel a running Codex task when the user explicitly asks to stop it.",
    parameters: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false,
    },
  },
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The voice session could not start.";
}

export class RealtimeVoiceClient {
  private readonly callbacks: RealtimeVoiceClientCallbacks;
  private readonly serviceUrl: string;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private microphoneStream: MediaStream | null = null;
  private outputAudio: HTMLAudioElement | null = null;
  private taskEvents: EventSource | null = null;
  private currentTask: CodexTaskSnapshot | null = null;
  private readonly handledCalls = new Set<string>();

  constructor(
    callbacks: RealtimeVoiceClientCallbacks,
    serviceUrl = import.meta.env.VITE_PREACHERMAN_SERVICE_URL || DEFAULT_SERVICE_URL,
  ) {
    this.callbacks = callbacks;
    this.serviceUrl = serviceUrl.replace(/\/$/, "");
  }

  async connect(): Promise<void> {
    this.cleanupVoice();
    this.callbacks.onError("");
    this.callbacks.onStateChange("connecting");
    try {
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const secret = await this.request<{ value: string }>(
        "/api/realtime/client-secret",
        { method: "POST" },
      );
      if (!secret.value) throw new Error("The local service returned an invalid Realtime secret.");

      const peerConnection = new RTCPeerConnection();
      this.peerConnection = peerConnection;
      this.outputAudio = new Audio();
      this.outputAudio.autoplay = true;
      peerConnection.ontrack = (event) => {
        if (this.outputAudio) this.outputAudio.srcObject = event.streams[0];
      };
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "failed") {
          this.fail("The Realtime connection was lost.");
        }
      };
      for (const track of this.microphoneStream.getTracks()) {
        peerConnection.addTrack(track, this.microphoneStream);
      }

      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.dataChannel = dataChannel;
      dataChannel.onmessage = (event) => this.handleRealtimeMessage(event.data);
      dataChannel.onerror = () => this.fail("The Realtime event channel failed.");
      dataChannel.onopen = () => {
        this.send({
          type: "session.update",
          session: {
            type: "realtime",
            instructions: PREACHERMAN_INSTRUCTIONS,
            tools: CODEX_TOOLS,
            tool_choice: "auto",
          },
        });
        this.callbacks.onStateChange("listening");
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const answerResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret.value}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!answerResponse.ok) {
        throw new Error(`Realtime connection failed (${answerResponse.status}).`);
      }
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await answerResponse.text(),
      });
    } catch (error) {
      this.cleanupVoice();
      this.fail(errorMessage(error));
    }
  }

  disconnect(): void {
    this.cleanupVoice();
    this.callbacks.onError("");
    this.callbacks.onStateChange("idle");
  }

  dispose(): void {
    this.taskEvents?.close();
    this.taskEvents = null;
    this.cleanupVoice();
  }

  async cancelCurrentTask(): Promise<void> {
    if (!this.currentTask) return;
    try {
      const result = await this.request<{ task: CodexTaskSnapshot }>(
        `/api/codex/tasks/${encodeURIComponent(this.currentTask.id)}/cancel`,
        { method: "POST" },
      );
      this.currentTask = result.task;
      this.callbacks.onTaskChange(result.task);
    } catch (error) {
      this.callbacks.onError(errorMessage(error));
    }
  }

  private cleanupVoice(): void {
    this.dataChannel?.close();
    this.dataChannel = null;
    this.peerConnection?.close();
    this.peerConnection = null;
    for (const track of this.microphoneStream?.getTracks() ?? []) track.stop();
    this.microphoneStream = null;
    if (this.outputAudio) this.outputAudio.srcObject = null;
    this.outputAudio = null;
    this.handledCalls.clear();
  }

  private fail(message: string): void {
    this.callbacks.onError(message);
    this.callbacks.onStateChange("error");
  }

  private send(event: unknown): void {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(event));
    }
  }

  private handleRealtimeMessage(rawEvent: string): void {
    let event: RealtimeServerEvent;
    try {
      event = JSON.parse(rawEvent) as RealtimeServerEvent;
    } catch {
      return;
    }
    if (event.type === "input_audio_buffer.speech_started") {
      this.callbacks.onStateChange("listening");
    } else if (
      event.type === "input_audio_buffer.speech_stopped"
      || event.type === "response.created"
    ) {
      this.callbacks.onStateChange("thinking");
    } else if (
      event.type === "response.output_audio.delta"
      || event.type === "response.audio.delta"
    ) {
      this.callbacks.onStateChange("speaking");
    } else if (event.type === "error") {
      this.fail(event.error?.message || "Realtime reported an error.");
    }
    if (event.type === "response.done") void this.handleResponseDone(event);
  }

  private async handleResponseDone(event: RealtimeServerEvent): Promise<void> {
    const calls = (event.response?.output ?? []).filter(
      (item): item is RealtimeFunctionCall => item.type === "function_call",
    );
    if (calls.length === 0) {
      this.callbacks.onStateChange("listening");
      return;
    }
    for (const call of calls) {
      if (this.handledCalls.has(call.call_id)) continue;
      this.handledCalls.add(call.call_id);
      let output: unknown;
      try {
        output = await this.executeFunction(call);
      } catch (error) {
        output = { ok: false, error: errorMessage(error) };
      }
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        },
      });
    }
    this.send({ type: "response.create" });
  }

  private async executeFunction(call: RealtimeFunctionCall): Promise<unknown> {
    const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
    if (call.name === "start_codex_task") {
      const result = await this.request<{ accepted: boolean; task: CodexTaskSnapshot }>(
        "/api/codex/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: args.instruction }),
        },
      );
      this.currentTask = result.task;
      this.callbacks.onTaskChange(result.task);
      this.watchTask(result.task.id);
      return { accepted: result.accepted, taskId: result.task.id, status: result.task.status };
    }
    if (call.name === "get_codex_status") {
      return this.request(`/api/codex/tasks/${encodeURIComponent(String(args.taskId))}`);
    }
    if (call.name === "steer_codex_task") {
      return this.request(`/api/codex/tasks/${encodeURIComponent(String(args.taskId))}/steer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: args.instruction }),
      });
    }
    if (call.name === "cancel_codex_task") {
      return this.request(`/api/codex/tasks/${encodeURIComponent(String(args.taskId))}/cancel`, {
        method: "POST",
      });
    }
    throw new Error(`Unknown function ${call.name}.`);
  }

  private watchTask(taskId: string): void {
    this.taskEvents?.close();
    const source = new EventSource(
      `${this.serviceUrl}/api/codex/tasks/${encodeURIComponent(taskId)}/events`,
    );
    this.taskEvents = source;
    const eventTypes = [
      "task.started",
      "phase.changed",
      "command.started",
      "command.completed",
      "file.changed",
      "message",
      "task.completed",
      "task.failed",
      "task.cancelled",
    ];
    for (const type of eventTypes) {
      source.addEventListener(type, (message) => {
        const event = JSON.parse((message as MessageEvent<string>).data) as {
          readonly type: string;
          readonly data: Record<string, unknown>;
        };
        void this.refreshTask(taskId, event.type, event.data);
      });
    }
  }

  private async refreshTask(
    taskId: string,
    eventType: string,
    eventData: Record<string, unknown>,
  ): Promise<void> {
    try {
      const result = await this.request<{ task: CodexTaskSnapshot }>(
        `/api/codex/tasks/${encodeURIComponent(taskId)}`,
      );
      this.currentTask = result.task;
      this.callbacks.onTaskChange(result.task);
      if (["task.completed", "task.failed", "task.cancelled"].includes(eventType)) {
        this.taskEvents?.close();
        this.taskEvents = null;
        const outcome = eventType === "task.completed"
          ? `completed successfully. ${String(eventData.summary || result.task.summary)}`
          : eventType === "task.cancelled"
            ? "was cancelled."
            : `failed. ${String(eventData.error || result.task.error)}`;
        this.send({
          type: "response.create",
          response: {
            instructions: `The local Codex task ${outcome} Briefly tell the user what happened.`,
          },
        });
      }
    } catch (error) {
      this.callbacks.onError(errorMessage(error));
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.serviceUrl}${path}`, init);
    const body = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(body.error || `Local service failed (${response.status}).`);
    return body;
  }
}
