class Writer {
  private readonly bytes: number[] = [];

  string(field: number, value: string): void {
    if (!value) return;
    this.bytesField(field, new TextEncoder().encode(value));
  }

  int32(field: number, value: number): void {
    if (value === 0) return;
    this.varint(field << 3);
    this.varint(value);
  }

  bytesField(field: number, value: Uint8Array): void {
    if (value.length === 0) return;
    this.varint((field << 3) | 2);
    this.varint(value.length);
    for (const byte of value) this.bytes.push(byte);
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

function base(className: string, requestId: string): Writer {
  const writer = new Writer();
  writer.string(1, className);
  writer.string(2, requestId);
  return writer;
}

export function encodeFaceStart(requestId: string, sampleRate: number, profile = "KQ-default"): Uint8Array {
  const writer = base("StreamingAudio2FaceV1ChunkStart", requestId);
  writer.int32(3, sampleRate);
  writer.int32(4, 2);
  writer.int32(5, 1);
  writer.string(6, profile);
  writer.int32(8, 10);
  return writer.finish();
}

/** The CPU Unitalker service emits IEEE 754 float16; older servers emit float32. */
export function decodeFaceValues(data: Uint8Array, dtype: string, channels: number): Float32Array {
  const size = dtype === "float16" ? 2 : dtype === "float32" ? 4 : 0;
  if (!size || !channels || !data.length || data.length % (size * channels)) throw new Error("Invalid Audio2Face frame chunk.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const values = new Float32Array(data.length / size);
  for (let i = 0; i < values.length; i++) {
    if (size === 4) values[i] = view.getFloat32(i * 4, true);
    else {
      const bits = view.getUint16(i * 2, true), exponent = (bits >>> 10) & 31, mantissa = bits & 1023;
      const magnitude = exponent === 0 ? mantissa * 2 ** -24 : exponent === 31 ? (mantissa ? NaN : Infinity) : (1 + mantissa / 1024) * 2 ** (exponent - 15);
      values[i] = (bits & 32768 ? -1 : 1) * magnitude;
    }
  }
  if (!values.every(Number.isFinite)) throw new Error("Non-finite Audio2Face values.");
  return values;
}

export function encodeFaceBody(requestId: string, pcmBytes: Uint8Array): Uint8Array {
  const writer = base("StreamingAudio2FaceV1ChunkBody", requestId);
  writer.bytesField(9, pcmBytes);
  return writer.finish();
}

export function encodeFaceEnd(requestId: string): Uint8Array {
  return base("StreamingAudio2FaceV1ChunkEnd", requestId).finish();
}

export interface AudioFaceResponse {
  readonly className: string;
  readonly blendshapeNames: readonly string[];
  readonly dtype: string;
  readonly data: Uint8Array;
}

export function decodeFaceResponse(input: ArrayBuffer): AudioFaceResponse {
  const data = new Uint8Array(input);
  const decoder = new TextDecoder();
  const blendshapeNames: string[] = [];
  let className = "";
  let dtype = "";
  let payload = new Uint8Array();
  let offset = 0;

  const varint = (): number => {
    let value = 0;
    let shift = 0;
    while (offset < data.length && shift < 35) {
      const byte = data[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value >>> 0;
      shift += 7;
    }
    throw new Error("Malformed Audio2Face protobuf varint.");
  };
  const bytes = (): Uint8Array => {
    const length = varint();
    const end = offset + length;
    if (end > data.length) throw new Error("Truncated Audio2Face protobuf field.");
    const value = data.slice(offset, end);
    offset = end;
    return value;
  };

  while (offset < data.length) {
    const tag = varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 2) {
      if (field === 1) className = decoder.decode(bytes());
      else if (field === 2) blendshapeNames.push(decoder.decode(bytes()));
      else if (field === 3) dtype = decoder.decode(bytes());
      else if (field === 4) payload = bytes();
      else bytes();
    } else if (wire === 0) varint();
    else if (wire === 5) offset += 4;
    else if (wire === 1) offset += 8;
    else throw new Error(`Unsupported Audio2Face protobuf wire type ${wire}.`);
    if (offset > data.length) throw new Error("Truncated Audio2Face protobuf response.");
  }
  return { className, blendshapeNames, dtype, data: payload };
}
