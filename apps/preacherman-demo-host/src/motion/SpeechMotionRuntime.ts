import type {
  AvatarMotionRestJoint,
  AvatarMotionStreamEvent,
  AvatarMotionStreamMetadata,
  AvatarMotionStreamSource,
} from "@preacherman/avatar-renderer";
import restPoseJson from "../../../../asset-library/digital-humans/assets/realtime-performance/v1/rigs/KQ-default.json";
import { localServiceWebSocketUrl } from "../serviceConfig";
import {
  decodeMotionResponse,
  encodeMotionBody,
  encodeMotionEnd,
  encodeMotionStart,
} from "./speechMotionProtocol";
import {
  decodeFaceResponse,
  encodeFaceBody,
  encodeFaceEnd,
  encodeFaceStart,
} from "./audioFaceProtocol";

interface StartSpeechMotionOptions {
  readonly text: string;
  readonly duration: number;
  readonly interactionEpoch: number;
  readonly signal: AbortSignal;
}

interface StartAudioFaceStreamOptions {
  readonly sampleRate: number;
  readonly interactionEpoch: number;
  readonly signal: AbortSignal;
}

export interface AudioFaceInputStream {
  readonly firstFrame: Promise<boolean>;
  append(pcm: Int16Array): void;
  finish(): void;
}

interface ActiveStream {
  readonly id: string;
  readonly interactionEpoch: number;
  readonly socket: WebSocket;
  readonly events: AvatarMotionStreamEvent[];
  ready: boolean;
  terminal: boolean;
}

interface ActiveFaceStream extends ActiveStream {
  readonly inputSampleRate: number;
  readonly pending: Int16Array[];
  opened: boolean;
  ending: boolean;
}

const restJoints = restPoseJson.joints as readonly AvatarMotionRestJoint[];

function resamplePcm(
  chunks: readonly Int16Array[],
  inputRate: number,
  outputRate: number,
): Int16Array {
  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const input = new Int16Array(inputLength);
  let cursor = 0;
  for (const chunk of chunks) {
    input.set(chunk, cursor);
    cursor += chunk.length;
  }
  if (inputRate === outputRate || input.length === 0) return input;
  const output = new Int16Array(Math.max(1, Math.floor(input.length * outputRate / inputRate)));
  const ratio = inputRate / outputRate;
  for (let index = 0; index < output.length; index += 1) {
    const source = index * ratio;
    const left = Math.floor(source);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = source - left;
    output[index] = Math.round(input[left] * (1 - fraction) + input[right] * fraction);
  }
  return output;
}

export class SpeechMotionRuntime implements AvatarMotionStreamSource {
  private readonly listeners = new Set<(event: AvatarMotionStreamEvent) => void>();
  private active: ActiveStream | null = null;
  private activeFace: ActiveFaceStream | null = null;

  subscribe(listener: (event: AvatarMotionStreamEvent) => void): () => void {
    this.listeners.add(listener);
    for (const event of this.active?.events ?? []) listener(event);
    for (const event of this.activeFace?.events ?? []) listener(event);
    return () => this.listeners.delete(listener);
  }

  start(options: StartSpeechMotionOptions): Promise<boolean> {
    this.cancel(undefined, "superseded");
    const id = `motion_${crypto.randomUUID()}`;
    const socket = new WebSocket(localServiceWebSocketUrl("/api/motion/speech2motion"));
    socket.binaryType = "arraybuffer";
    const active: ActiveStream = {
      id,
      interactionEpoch: options.interactionEpoch,
      socket,
      events: [],
      ready: false,
      terminal: false,
    };
    this.active = active;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ready: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(ready);
      };
      const fail = (error: Error) => {
        if (this.active !== active || active.terminal) return;
        active.terminal = true;
        this.emit(active, { type: "failed", streamId: id, error });
        settle(false);
      };
      const timeout = window.setTimeout(() => {
        fail(new Error("Speech motion did not produce a frame before playback."));
        socket.close();
      }, 2_500);
      const abort = () => {
        this.cancel(options.interactionEpoch, "presentation-interrupted");
        settle(false);
      };
      options.signal.addEventListener("abort", abort, { once: true });

      socket.onopen = () => {
        if (this.active !== active || options.signal.aborted) return;
        socket.send(encodeMotionStart(id));
        socket.send(encodeMotionBody(id, options.text, options.duration));
        socket.send(encodeMotionEnd(id));
      };
      socket.onmessage = (message) => {
        if (this.active !== active || !(message.data instanceof ArrayBuffer)) return;
        try {
          const response = decodeMotionResponse(message.data);
          // The official V3 service omits request_id on body chunks. Start/end
          // remain correlated and each browser socket carries one request only.
          if (response.requestId && response.requestId !== id) return;
          if (response.className === "Speech2MotionV3ResponseChunkStart") {
            if (response.dtype !== "float32") {
              throw new Error(`Unsupported Speech2Motion dtype: ${response.dtype}.`);
            }
            if (response.restPoseId !== restPoseJson.id) {
              throw new Error(`Unsupported Speech2Motion rest pose: ${response.restPoseId}.`);
            }
            const metadata: AvatarMotionStreamMetadata = {
              streamId: id,
              interactionEpoch: options.interactionEpoch,
              frameRate: 30,
              jointNames: response.jointNames,
              blendshapeNames: response.blendshapeNames,
              restPoseId: response.restPoseId,
              restJoints,
              timelineStartFrame: response.timelineStartFrame,
            };
            this.emit(active, { type: "started", metadata });
          } else if (response.className === "Speech2MotionV3ResponseChunkBody") {
            if (response.data.byteLength % 4 !== 0) {
              throw new Error("Speech2Motion returned an unaligned float32 frame chunk.");
            }
            const copied = response.data.slice().buffer;
            this.emit(active, {
              type: "frames",
              streamId: id,
              values: new Float32Array(copied),
            });
            active.ready = true;
            settle(true);
          } else if (response.className === "Speech2MotionV3ResponseChunkEnd") {
            active.terminal = true;
            this.emit(active, { type: "ended", streamId: id });
            settle(active.ready);
            socket.close();
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
          socket.close();
        }
      };
      socket.onerror = () => fail(new Error("Speech motion service is unavailable."));
      socket.onclose = () => {
        options.signal.removeEventListener("abort", abort);
        if (!active.terminal) fail(new Error("Speech motion stream closed before completion."));
      };
    });
  }

  startFaceStream(options: StartAudioFaceStreamOptions): AudioFaceInputStream {
    this.cancelFace(undefined, "superseded");
    const id = `face_${crypto.randomUUID()}`;
    const socket = new WebSocket(localServiceWebSocketUrl("/api/face/audio2face"));
    socket.binaryType = "arraybuffer";
    const active: ActiveFaceStream = {
      id,
      interactionEpoch: options.interactionEpoch,
      socket,
      events: [],
      ready: false,
      terminal: false,
      inputSampleRate: options.sampleRate,
      pending: [],
      opened: false,
      ending: false,
    };
    this.activeFace = active;

    const firstFrame = new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ready: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(ready);
      };
      const fail = (error: Error) => {
        if (this.activeFace !== active || active.terminal) return;
        active.terminal = true;
        this.emit(active, { type: "face-failed", streamId: id, error });
        settle(false);
      };
      const timeout = window.setTimeout(() => {
        fail(new Error("Audio2Face did not produce a frame before playback."));
        socket.close();
      }, 4_500);
      const abort = () => {
        this.cancelFace(options.interactionEpoch, "presentation-interrupted");
        settle(false);
      };
      options.signal.addEventListener("abort", abort, { once: true });

      socket.onopen = () => {
        if (this.activeFace !== active || options.signal.aborted) return;
        const faceSampleRate = 16_000;
        active.opened = true;
        socket.send(encodeFaceStart(id, faceSampleRate));
        for (const pcm of active.pending.splice(0)) {
          const chunk = resamplePcm([pcm], active.inputSampleRate, faceSampleRate);
          socket.send(encodeFaceBody(
            id,
            new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
          ));
        }
        if (active.ending) socket.send(encodeFaceEnd(id));
      };
      socket.onmessage = (message) => {
        if (this.activeFace !== active || !(message.data instanceof ArrayBuffer)) return;
        try {
          const response = decodeFaceResponse(message.data);
          if (response.className === "Audio2FaceV1ResponseChunkStart") {
            if (response.dtype !== "float32") {
              throw new Error(`Unsupported Audio2Face dtype: ${response.dtype}.`);
            }
            this.emit(active, {
              type: "face-started",
              streamId: id,
              interactionEpoch: options.interactionEpoch,
              frameRate: 30,
              blendshapeNames: response.blendshapeNames,
            });
          } else if (response.className === "Audio2FaceV1ResponseChunkBody") {
            if (response.data.byteLength % 4 !== 0) {
              throw new Error("Audio2Face returned an unaligned float32 frame chunk.");
            }
            this.emit(active, {
              type: "face-frames",
              streamId: id,
              values: new Float32Array(response.data.slice().buffer),
            });
            active.ready = true;
            settle(true);
          } else if (response.className === "Audio2FaceV1ResponseChunkEnd") {
            active.terminal = true;
            this.emit(active, { type: "face-ended", streamId: id });
            settle(active.ready);
            socket.close();
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
          socket.close();
        }
      };
      socket.onerror = () => fail(new Error("Audio2Face service is unavailable."));
      socket.onclose = () => {
        options.signal.removeEventListener("abort", abort);
        if (!active.terminal) fail(new Error("Audio2Face stream closed before completion."));
      };
    });

    return {
      firstFrame,
      append: (pcm) => {
        if (this.activeFace !== active || active.terminal || active.ending || options.signal.aborted) return;
        if (!active.opened) {
          active.pending.push(pcm);
          return;
        }
        const faceSampleRate = 16_000;
        const chunk = resamplePcm([pcm], active.inputSampleRate, faceSampleRate);
        socket.send(encodeFaceBody(
          id,
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        ));
      },
      finish: () => {
        if (this.activeFace !== active || active.terminal || active.ending) return;
        active.ending = true;
        if (active.opened) socket.send(encodeFaceEnd(id));
      },
    };
  }

  cancel(interactionEpoch?: number, reason = "cancelled"): void {
    const active = this.active;
    if (active && (interactionEpoch === undefined || interactionEpoch === active.interactionEpoch)) {
      if (!active.terminal) {
        active.terminal = true;
        this.emit(active, { type: "cancelled", streamId: active.id, reason });
      }
      active.socket.close();
      this.active = null;
    }
    this.cancelFace(interactionEpoch, reason);
  }

  private cancelFace(interactionEpoch?: number, reason = "cancelled"): void {
    const active = this.activeFace;
    if (!active || (interactionEpoch !== undefined && interactionEpoch !== active.interactionEpoch)) return;
    if (!active.terminal) {
      active.terminal = true;
      this.emit(active, { type: "face-cancelled", streamId: active.id, reason });
    }
    active.socket.close();
    this.activeFace = null;
  }

  private emit(active: ActiveStream, event: AvatarMotionStreamEvent): void {
    active.events.push(event);
    for (const listener of this.listeners) listener(event);
  }
}

export const speechMotionRuntime = new SpeechMotionRuntime();
