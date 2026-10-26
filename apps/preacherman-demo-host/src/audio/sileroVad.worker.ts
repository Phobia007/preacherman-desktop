import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";

// The model and WASM are packaged with the desktop app; no CDN or download at runtime.
let session: InferenceSession | undefined;
let state = new Float32Array(256);
let context = new Float32Array(64);
let chain = Promise.resolve();
let stopped = false;
self.onmessage = (event: MessageEvent<{ root?: string; block?: Float32Array }>) => {
  chain = chain.then(async () => {
    if (stopped) return;
    if (event.data.root) {
      env.wasm.numThreads = 1;
      env.wasm.proxy = false;
      env.wasm.wasmPaths = event.data.root;
      session = await InferenceSession.create(event.data.root + "silero_vad.onnx", { executionProviders: ["wasm"] });
      self.postMessage({ ready: true });
      return;
    }
    const block = event.data.block;
    if (!session || !block || block.length !== 512) throw new Error("Invalid voice detection frame.");
    const input = new Float32Array(576);
    input.set(context); input.set(block, 64);
    const result = await session.run({
      input: new Tensor("float32", input, [1, 576]),
      state: new Tensor("float32", state, [2, 1, 128]),
      sr: new Tensor("int64", BigInt64Array.of(16000n), []),
    });
    state = new Float32Array(result.stateN.data as Float32Array);
    context = block.slice(-64);
    self.postMessage({ block, probability: Number(result.output.data[0]) }, { transfer: [block.buffer] });
    Object.values(result).forEach(tensor => tensor.dispose());
  }).catch(() => {
    stopped = true;
    self.postMessage({ error: "Local speech detection is unavailable." });
  });
};
