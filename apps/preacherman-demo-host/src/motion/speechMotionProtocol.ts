export interface SpeechMotionResponse {
  readonly className: string;
  readonly requestId: string;
  readonly jointNames: readonly string[];
  readonly restPoseId: string;
  readonly dtype: string;
  readonly timelineStartFrame: number;
  readonly data: Uint8Array;
  readonly blendshapeNames: readonly string[];
}

class Writer {
  private readonly bytes: number[] = [];

  string(field: number, value: string): void {
    if (!value) return;
    const encoded = new TextEncoder().encode(value);
    this.varint((field << 3) | 2);
    this.varint(encoded.length);
    this.bytes.push(...encoded);
  }

  int32(field: number, value: number): void {
    if (value === 0) return;
    this.varint(field << 3);
    this.varint(value);
  }

  float(field: number, value: number): void {
    if (value === 0) return;
    this.varint((field << 3) | 5);
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    this.bytes.push(...new Uint8Array(buffer));
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }

  private varint(value: number): void {
    let remaining = value >>> 0;
    while (remaining > 0x7f) {
      this.bytes.push((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    this.bytes.push(remaining);
  }
}

function baseRequest(className: string, requestId: string): Writer {
  const writer = new Writer();
  writer.string(1, className);
  writer.string(2, requestId);
  return writer;
}

export function encodeMotionStart(requestId: string): Uint8Array {
  const writer = baseRequest("StreamingSpeech2MotionV3ChunkStart", requestId);
  writer.string(3, "preacherman-desktop");
  writer.string(4, "KQ-default");
  writer.string(5, "python_backend");
  writer.float(6, 0.35);
  writer.float(7, 0.65);
  writer.int32(12, 60);
  return writer.finish();
}

export function encodeMotionBody(
  requestId: string,
  text: string,
  duration: number,
): Uint8Array {
  const writer = baseRequest("StreamingSpeech2MotionV3ChunkBody", requestId);
  writer.float(15, duration);
  writer.string(16, text);
  return writer.finish();
}

export function encodeMotionEnd(requestId: string): Uint8Array {
  return baseRequest("StreamingSpeech2MotionV3ChunkEnd", requestId).finish();
}

export function decodeMotionResponse(input: ArrayBuffer): SpeechMotionResponse {
  const data = new Uint8Array(input);
  const decoder = new TextDecoder();
  let offset = 0;
  let className = "";
  let requestId = "";
  let restPoseId = "";
  let dtype = "";
  let timelineStartFrame = 0;
  let payload = new Uint8Array();
  const jointNames: string[] = [];
  const blendshapeNames: string[] = [];

  const varint = (): number => {
    let value = 0;
    let shift = 0;
    while (offset < data.length && shift < 35) {
      const byte = data[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value >>> 0;
      shift += 7;
    }
    throw new Error("Malformed Speech2Motion protobuf varint.");
  };
  const bytes = (): Uint8Array => {
    const length = varint();
    const end = offset + length;
    if (end > data.length) throw new Error("Truncated Speech2Motion protobuf field.");
    const value = data.slice(offset, end);
    offset = end;
    return value;
  };
  const string = (): string => decoder.decode(bytes());

  while (offset < data.length) {
    const tag = varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 2) {
      if (field === 1) className = string();
      else if (field === 2) requestId = string();
      else if (field === 3) jointNames.push(string());
      else if (field === 4) restPoseId = string();
      else if (field === 5) dtype = string();
      else if (field === 8) payload = bytes();
      else if (field === 10) blendshapeNames.push(string());
      else bytes();
    } else if (wire === 0) {
      const value = varint();
      if (field === 6) timelineStartFrame = value | 0;
    } else if (wire === 5) {
      offset += 4;
    } else if (wire === 1) {
      offset += 8;
    } else {
      throw new Error(`Unsupported Speech2Motion protobuf wire type ${wire}.`);
    }
    if (offset > data.length) throw new Error("Truncated Speech2Motion protobuf response.");
  }

  return {
    className,
    requestId,
    jointNames,
    restPoseId,
    dtype,
    timelineStartFrame,
    data: payload,
    blendshapeNames,
  };
}
