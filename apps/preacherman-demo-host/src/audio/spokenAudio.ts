/** Bounded phrase detection, retaining a short lead-in so initial consonants survive. */
export class SpokenPhrase {
  private blocks: Float32Array[] = [];
  private speechSamples = 0;
  private silence = 0;
  private samples = 0;
  private heard = false;
  private done = false;
  push(block: Float32Array): Float32Array[] | null {
    if (this.done) return null;
    let power = 0;
    for (const sample of block) power += sample * sample;
    const voiced = Math.sqrt(power / block.length) > 0.012;
    this.blocks.push(block); this.samples += block.length;
    if (voiced) { this.heard = true; this.speechSamples += block.length; this.silence = 0; }
    else this.silence += block.length;
    if (!this.heard) while (this.samples > 4800 && this.blocks.length > 1) this.samples -= this.blocks.shift()!.length;
    if (this.heard && (this.silence >= 10400 || this.samples >= 320000)) {
      this.done = true;
      return this.speechSamples >= 3200 ? this.blocks : [];
    }
    return null;
  }
}

/** Sentence-sized requests let playback begin while the following sentence is synthesized. */
export function spokenSentences(text: string, language: "en" | "zh" | "unknown" = "unknown") {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const segmenter = new Intl.Segmenter(language === "unknown" ? undefined : language, { granularity: "sentence" });
  return Array.from(segmenter.segment(trimmed), part => part.segment.trim()).filter(Boolean);
}

export function speechWav(blocks: Float32Array[]) {
  const count = blocks.reduce((sum, block) => sum + block.length, 0);
  const bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  tag(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); tag(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, count * 2, true);
  let offset = 44;
  for (const block of blocks) for (const sample of block) { view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 32767, true); offset += 2; }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
