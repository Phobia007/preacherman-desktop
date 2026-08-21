import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function protocolModule() {
  const source = await readFile(new URL("../src/motion/speechMotionProtocol.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
}

async function faceProtocolModule() {
  const source = await readFile(new URL("../src/motion/audioFaceProtocol.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
}

test("Speech2Motion request encoder matches the official V3 protobuf wire format", async () => {
  const protocol = await protocolModule();
  assert.equal(
    Buffer.from(protocol.encodeMotionStart("fixture")).toString("base64"),
    "CiJTdHJlYW1pbmdTcGVlY2gyTW90aW9uVjNDaHVua1N0YXJ0EgdmaXh0dXJlGhNwcmVhY2hlcm1hbi1kZXNrdG9wIgpLUS1kZWZhdWx0Kg5weXRob25fYmFja2VuZDUzM7M+PWZmJj9gPA==",
  );
  assert.equal(
    Buffer.from(protocol.encodeMotionBody("fixture", "hello", 2.5)).toString("base64"),
    "CiFTdHJlYW1pbmdTcGVlY2gyTW90aW9uVjNDaHVua0JvZHkSB2ZpeHR1cmV9AAAgQIIBBWhlbGxv",
  );
  assert.equal(
    Buffer.from(protocol.encodeMotionEnd("fixture")).toString("base64"),
    "CiBTdHJlYW1pbmdTcGVlY2gyTW90aW9uVjNDaHVua0VuZBIHZml4dHVyZQ==",
  );
});

test("Audio2Face encoder and decoder match the official V1 protobuf wire format", async () => {
  const protocol = await faceProtocolModule();
  assert.equal(
    Buffer.from(protocol.encodeFaceStart("fixture", 16_000)).toString("base64"),
    "Ch9TdHJlYW1pbmdBdWRpbzJGYWNlVjFDaHVua1N0YXJ0EgdmaXh0dXJlGIB9IAIoATIKS1EtZGVmYXVsdEAe",
  );
  assert.equal(
    Buffer.from(protocol.encodeFaceBody("fixture", new Uint8Array([1, 2]))).toString("base64"),
    "Ch5TdHJlYW1pbmdBdWRpbzJGYWNlVjFDaHVua0JvZHkSB2ZpeHR1cmVKAgEC",
  );
  const response = Buffer.from("Ch5BdWRpbzJGYWNlVjFSZXNwb25zZUNodW5rU3RhcnQSB2phd09wZW4SDGV5ZUJsaW5rTGVmdBoHZmxvYXQzMg==", "base64");
  const decoded = protocol.decodeFaceResponse(response.buffer.slice(response.byteOffset, response.byteOffset + response.byteLength));
  assert.deepEqual(decoded.blendshapeNames, ["jawOpen", "eyeBlinkLeft"]);
  assert.equal(decoded.dtype, "float32");
});

test("Speech2Motion response decoder preserves skeleton, face channels, and frame bytes", async () => {
  const protocol = await protocolModule();
  const start = Buffer.from("CiFTcGVlY2gyTW90aW9uVjNSZXNwb25zZUNodW5rU3RhcnQSB2ZpeHR1cmUaBFJvb3QaBEhpcHMiCktRLWRlZmF1bHQqB2Zsb2F0MzIwAFIFc21pbGU=", "base64");
  const metadata = protocol.decodeMotionResponse(start.buffer.slice(start.byteOffset, start.byteOffset + start.byteLength));
  assert.deepEqual(metadata.jointNames, ["Root", "Hips"]);
  assert.deepEqual(metadata.blendshapeNames, ["smile"]);
  assert.equal(metadata.restPoseId, "KQ-default");
  assert.equal(metadata.dtype, "float32");

  const body = Buffer.from("CiBTcGVlY2gyTW90aW9uVjNSZXNwb25zZUNodW5rQm9keRIHZml4dHVyZUIEAACAPw==", "base64");
  const frames = protocol.decodeMotionResponse(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  assert.equal(new Float32Array(frames.data.slice().buffer)[0], 1);
});
