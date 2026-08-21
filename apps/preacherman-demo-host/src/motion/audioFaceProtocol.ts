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
    this.bytes.push(...value);
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

export function encodeFaceStart(requestId: string, sampleRate: number): Uint8Array {
  const writer = base("StreamingAudio2FaceV1ChunkStart", requestId);
  writer.int32(3, sampleRate);
  writer.int32(4, 2);
  writer.int32(5, 1);
  writer.string(6, "KQ-default");
  writer.int32(8, 30);
  return writer.finish();
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
