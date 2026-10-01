import { CanvasTexture, Color, LinearFilter, LinearSRGBColorSpace, Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderer } from "three";
import { taskCardFragment, taskCardSettings as settings, taskCardVertex } from "./task-featured-card-source";
import type { MarketSearchItem } from "./marketSearchData";

export const FEATURED_SPEED = 48;
export const featuredOffset = (distance: number, index: number, step: number, count: number) => {
  const span = step * count;
  return ((index * step - distance + span / 2) % span + span) % span - span / 2;
};

function material(texture: CanvasTexture, title = false) {
  // The title shares the same sheet; retain its canvas alpha instead of the opaque image mask.
  return new ShaderMaterial({ vertexShader: taskCardVertex, fragmentShader: title ? taskCardFragment.replace("vec4(tex.rgb, alpha)", "vec4(tex.rgb, alpha * tex.a)") : taskCardFragment, transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      u_texture: { value: texture }, u_size: { value: new Vector2(1200, 675) }, u_res: { value: new Vector2(1, 1) },
      u_alpha: { value: 1 }, u_shade: { value: title ? 0 : 1 }, u_shadeS: { value: settings.spread }, u_corner: { value: 0 },
      u_hover: { value: 0 }, u_dent: { value: settings.dent }, u_white: { value: 0 }, u_wash: { value: new Color(1, 1, 1) }, u_scrim: { value: title ? 0 : 1 },
      u_clip: { value: new Vector4() }, u_clipR: { value: 0 }, u_clipOn: { value: 0 }, u_clipBow: { value: 0 }, u_clipWarp: { value: new Vector3() },
      u_sheetW: { value: 0 }, u_sheetD: { value: 0 }, u_sheetV: { value: 0 }, u_sheetT: { value: settings.span }, u_sheetC: { value: 1 }, u_sheetP: { value: 1 },
      u_leanA: { value: 0 }, u_leanW: { value: 0 }, u_bulgeA: { value: 0 }, u_bulgeH: { value: 0 },
    },
  });
}

function texture(canvas: HTMLCanvasElement) {
  const result = new CanvasTexture(canvas);
  result.minFilter = result.magFilter = LinearFilter; result.generateMipmaps = false;
  return result;
}

/** Task's curved card material and geometry, hosted in a cropped part of the same stage. */
export class TaskFeaturedCards {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(settings.fov, 1, .1, 2000);
  private geometry = new PlaneGeometry(1, 1, settings.segments, settings.segments);
  private cards: { image: Mesh<PlaneGeometry, ShaderMaterial>; title: Mesh<PlaneGeometry, ShaderMaterial>; hover: number; target: number; button: HTMLButtonElement }[] = [];
  private textures: CanvasTexture[] = [];
  private labels: { canvas: HTMLCanvasElement; texture: CanvasTexture; name: string }[] = [];
  private request = 0;
  private last = 0;
  private distance = 0;
  private running = false;
  private active = true;
  private reduced = false;
  private disposed = false;
  private width = 1;
  private height = 1;
  private cardWidth = 1;
  private cardHeight = 1;
  private worldPixel = 1;
  private halfWidth = 1;
  private resizeObserver: ResizeObserver;
  private themeObserver: MutationObserver;
  private cleanups: (() => void)[] = [];

  static async create(host: HTMLDivElement, buttons: HTMLButtonElement[], models: readonly MarketSearchItem[], signal: AbortSignal) {
    const controller = new TaskFeaturedCards(host, buttons, models);
    try { await controller.load(models, signal); if (signal.aborted) throw new DOMException("Cancelled", "AbortError"); return controller; }
    catch (error) { controller.dispose(); throw error; }
  }
  private constructor(private host: HTMLDivElement, buttons: HTMLButtonElement[], models: readonly MarketSearchItem[]) {
    this.camera.position.z = settings.cameraZ;
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(1.25, devicePixelRatio)); this.renderer.setClearColor(0, 0);
    this.renderer.domElement.setAttribute("aria-hidden", "true"); this.host.prepend(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    this.themeObserver = new MutationObserver(() => { this.paintLabels(); this.draw(); });
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
    for (let index = 0; index < models.length * 2; index++) {
      const button = buttons[index], enter = () => this.hover(index), leave = () => this.hover(-1);
      button.addEventListener("pointerenter", enter); button.addEventListener("pointerleave", leave);
      button.addEventListener("focus", enter); button.addEventListener("blur", leave);
      this.cleanups.push(() => { button.removeEventListener("pointerenter", enter); button.removeEventListener("pointerleave", leave); button.removeEventListener("focus", enter); button.removeEventListener("blur", leave); });
    }
    this.resize();
  }
  private async load(models: readonly MarketSearchItem[], signal: AbortSignal) {
    await document.fonts.load('400 24px "Market Brilliant Cut"');
    const loaded: CanvasTexture[] = [];
    for (const model of models) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); image.onload = image.onerror = null; };
        const abort = () => { cleanup(); image.src = ""; reject(new DOMException("Cancelled", "AbortError")); };
        const timer = window.setTimeout(() => { cleanup(); reject(new Error("Model preview could not load.")); }, 8000);
        image.onload = () => { cleanup(); resolve(); }; image.onerror = () => { cleanup(); reject(new Error("Model preview could not load.")); };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) { abort(); return; }
        image.src = `/market-love/${model.image}`;
      });
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 675;
      const context = canvas.getContext("2d")!;
      // Extend the image's own empty edge; the whole model remains inside the wide Task card.
      const width = image.width / image.height * canvas.height;
      const side = (canvas.width - width) / 2;
      if (side > 0) {
        context.drawImage(image, 0, 0, 1, image.height, 0, 0, side + 1, canvas.height);
        context.drawImage(image, image.width - 1, 0, 1, image.height, canvas.width - side - 1, 0, side + 1, canvas.height);
      }
      context.drawImage(image, side, 0, width, canvas.height);
      const picture = texture(canvas); loaded.push(picture); this.textures.push(picture);
      const label = document.createElement("canvas"); label.width = 1200; label.height = 675;
      const ink = texture(label); this.textures.push(ink); this.labels.push({ canvas: label, texture: ink, name: model.name });
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const buttons = [...this.host.querySelectorAll<HTMLButtonElement>(".market-search-promos__card")];
    for (let index = 0; index < models.length * 2; index++) {
      const image = new Mesh(this.geometry, material(loaded[index % models.length]));
      const title = new Mesh(this.geometry, material(this.labels[index % models.length].texture, true));
      image.renderOrder = index * 2; title.renderOrder = index * 2 + 1; image.frustumCulled = title.frustumCulled = false;
      this.scene.add(image, title); this.cards.push({ image, title, hover: 0, target: 0, button: buttons[index] });
    }
    this.paintLabels(); this.resize(); this.renderer.compile(this.scene, this.camera); this.draw();
  }
  private paintLabels() {
    const css = getComputedStyle(this.host);
    for (const label of this.labels) {
      const context = label.canvas.getContext("2d")!; context.clearRect(0, 0, 1200, 675);
      context.fillStyle = css.getPropertyValue("--demo-theme-market-text").trim();
      context.font = '400 36px "Market Brilliant Cut", sans-serif'; context.textBaseline = "bottom";
      context.fillText(label.name, 28, 650, 1080);
      label.texture.needsUpdate = true;
    }
  }
  private resize() {
    if (this.disposed) return;
    this.width = this.host.clientWidth || 1; this.height = this.host.clientHeight || 1;
    // Keep Task's desktop perspective inside this strip, including tall/narrow windows.
    const stageHeight = Math.max(this.height, this.width / 1.86);
    this.camera.aspect = this.width / stageHeight;
    this.camera.setViewOffset(this.width, stageHeight, 0, (stageHeight - this.height) / 2, this.width, this.height);
    this.camera.updateProjectionMatrix();
    const halfHeight = Math.tan(settings.fov * Math.PI / 360) * settings.cameraZ;
    this.halfWidth = halfHeight * this.width / stageHeight; this.worldPixel = 2 * this.halfWidth / this.width;
    this.cardHeight = this.height * .78; this.cardWidth = this.cardHeight * 16 / 9;
    this.renderer.setSize(this.width, this.height, false); this.draw();
  }
  setState(active: boolean, running: boolean, reduced: boolean) {
    this.active = active; this.running = running; this.reduced = reduced; this.last = 0;
    if (!active) { cancelAnimationFrame(this.request); this.request = 0; return; }
    this.draw(); this.schedule();
  }
  private hover(index: number) {
    this.cards.forEach((card, i) => { card.target = i === index ? 1 : 0; if (this.reduced) card.hover = card.target; }); this.schedule();
  }
  private schedule() { if (!this.request && !this.disposed && this.active) this.request = requestAnimationFrame(this.tick); }
  private tick = (now: number) => {
    this.request = 0;
    if (this.disposed || !this.active) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, .05) : 0; this.last = now;
    if (this.running) this.distance += FEATURED_SPEED * dt;
    let unsettled = false;
    for (const card of this.cards) {
      card.hover += (card.target - card.hover) * (1 - Math.exp(-14 * dt));
      if (Math.abs(card.hover - card.target) < .001) card.hover = card.target; else unsettled = true;
    }
    this.draw();
    if (this.running || unsettled) this.schedule(); else this.last = 0;
  };
  private draw() {
    if (this.disposed) return;
    const step = this.cardWidth + settings.gap, worldHeight = this.cardHeight * this.worldPixel;
    const velocity = Math.tanh((FEATURED_SPEED / 6) / settings.velocityNorm) ** 2;
    for (let index = 0; index < this.cards.length; index++) {
      const card = this.cards[index], x = featuredOffset(this.distance, index, step, this.cards.length);
      for (const mesh of [card.image, card.title]) {
        mesh.position.set(x * this.worldPixel, 0, 0); mesh.scale.set(this.cardWidth * this.worldPixel, worldHeight, 1);
        const uniforms = mesh.material.uniforms;
        uniforms.u_res.value.set(this.cardWidth * this.worldPixel, worldHeight); uniforms.u_corner.value = settings.radius / this.cardHeight;
        uniforms.u_sheetW.value = this.halfWidth; uniforms.u_sheetD.value = this.halfWidth * settings.depth * (1 + settings.velocityDepth * velocity);
        uniforms.u_sheetV.value = velocity; uniforms.u_leanA.value = this.halfWidth * settings.door; uniforms.u_leanW.value = this.halfWidth; uniforms.u_hover.value = card.hover;
      }
      // As in Task, DOM hit targets follow the travelling card; names are painted by GL on the sheet.
      card.button.style.width = `${this.cardWidth}px`; card.button.style.height = `${this.cardHeight}px`;
      card.button.style.transform = `translate3d(${this.width / 2 + x - this.cardWidth / 2}px,${(this.height - this.cardHeight) / 2}px,0)`;
      const shown = x + this.cardWidth / 2 > -this.width / 2 && x - this.cardWidth / 2 < this.width / 2;
      card.button.tabIndex = shown ? 0 : -1; card.button.setAttribute("aria-hidden", String(!shown));
    }
    this.renderer.render(this.scene, this.camera);
    this.host.dataset.distance = this.distance.toFixed(3); this.host.dataset.speed = String(FEATURED_SPEED);
  }
  snapshot() { this.draw(); return this.renderer.domElement; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.request); this.resizeObserver.disconnect(); this.themeObserver.disconnect(); this.cleanups.forEach(cleanup => cleanup());
    this.cards.forEach(card => { card.image.material.dispose(); card.title.material.dispose(); }); this.textures.forEach(item => item.dispose()); this.geometry.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
