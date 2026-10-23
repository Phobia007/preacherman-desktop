// Average resampling to mono 16 kHz. Only active while the voice button listens.
class VoiceCapture extends AudioWorkletProcessor {
  constructor() { super(); this.sum = 0; this.count = 0; this.position = 0; this.buffer = []; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      this.sum += sample; this.count++; this.position += 16000;
      if (this.position >= sampleRate) {
        this.position -= sampleRate; this.buffer.push(this.sum / this.count); this.sum = 0; this.count = 0;
        if (this.buffer.length === 512) {
          const block = new Float32Array(this.buffer); this.port.postMessage(block, [block.buffer]); this.buffer = [];
        }
      }
    }
    return true;
  }
}
registerProcessor("preacherman-voice-capture", VoiceCapture);
