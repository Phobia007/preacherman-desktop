import { CanvasTexture, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";
import { taskProfileCurve, taskProfileFragment, taskProfileSettings as settings, taskProfileVertex } from "./task-profile-source";

const cubic = (t: number, a: number, b: number, c: number, d: number) => {
  const r = 1 - t;
  return r * r * r * a + 3 * r * r * t * b + 3 * r * t * t * c + t * t * t * d;
};
export function taskProfileEase(value: number) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  for (const [x0, y0, x1, y1, x2, y2, x3, y3] of taskProfileCurve) {
    if (value > x3) continue;
    let low = 0, high = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (cubic(mid, x0, x1, x2, x3) < value) low = mid; else high = mid;
    }
    return cubic((low + high) / 2, y0, y1, y2, y3);
  }
  return 1;
}

// Task composites against black. Market's host model must remain visible through
// the horizon; only these three alpha expressions differ, never the lens math.
export const marketProfileFragment = taskProfileFragment
  .replace("return vec4(0.0, 0.0, 0.0, 1.0);", "return vec4(0.0);")
  .replace("vec4 col = vec4(cr.r, cg.g, cb.b, 1.0);", "vec4 col = vec4(cr.r, cg.g, cb.b, max(cr.a, max(cg.a, cb.a)));")
  .replace("mix(col, vec4(0.0, 0.0, 0.0, 1.0), inside)", "mix(col, vec4(0.0), inside)");

export class TaskProfileLens {
  private renderer: WebGLRenderer;
  private texture: CanvasTexture;
  private geometry = new PlaneGeometry(2, 2);
  private material: ShaderMaterial;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private request = 0;
  private progress = 0;
  private from = 0;
  private target = 0;
  private fromSquash = 0;
  private squash = 0;
  private started = 0;
  private clock = 0;
  private previous = 0;
  private disposed = false;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  constructor(private host: HTMLDivElement, source: HTMLCanvasElement, private onFrame: (progress: number, settled: boolean) => void) {
    const canvas = document.createElement("canvas");
    this.texture = new CanvasTexture(source);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.material = new ShaderMaterial({
      vertexShader: taskProfileVertex, fragmentShader: marketProfileFragment,
      uniforms: {
        u_scene: { value: this.texture }, u_aspect: { value: new Vector2(source.width / source.height, 1) },
        u_time: { value: 0 }, u_center: { value: new Vector2(0.5, 0.5) }, u_p: { value: 0 },
        u_radius: { value: 0.2 }, u_lens: { value: settings.lens }, u_reach: { value: settings.reach },
        u_orbit: { value: settings.orbit }, u_wave: { value: settings.wave }, u_aberr: { value: settings.aberration },
        u_squash: { value: 0 }, u_breath: { value: settings.breath },
        u_ballA: { value: 0 }, u_ballWarp: { value: 0 }, u_ballShade: { value: 0 },
        u_ballEdge: { value: new Vector2(0.22, 0.5) }, u_trail: { value: this.texture }, u_trailTexel: { value: new Vector2(1, 1) },
      }, transparent: true, depthTest: false, depthWrite: false,
    });
    this.scene.add(new Mesh(this.geometry, this.material));
    let renderer: WebGLRenderer | undefined;
    try {
      this.renderer = renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(source.width, source.height, false);
      this.renderer.setClearColor(0, 0);
      this.renderer.compile(this.scene, this.camera);
      host.append(canvas);
    } catch (error) {
      this.texture.dispose(); this.geometry.dispose(); this.material.dispose();
      renderer?.dispose(); renderer?.forceContextLoss();
      throw error;
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    this.reduced.addEventListener("change", this.onMotionPreference);
  }
  setOpen(open: boolean) {
    if (this.disposed) return;
    this.from = this.progress;
    this.fromSquash = this.squash;
    this.target = open ? 1 : 0;
    this.started = performance.now();
    this.previous = this.started;
    if (open && this.progress === 0) this.clock = 0;
    this.wake();
  }
  private wake = () => {
    if (!this.disposed && !this.request && !document.hidden) this.request = requestAnimationFrame(this.tick);
  };
  private onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(this.request); this.request = 0; }
    else { this.previous = performance.now(); this.wake(); }
  };
  private onMotionPreference = () => this.wake();
  private tick = (now: number) => {
    this.request = 0;
    if (this.disposed) return;
    const duration = this.target ? settings.open : settings.close;
    const elapsed = Math.min(1, Math.max(0, (now - this.started) / duration));
    this.progress = this.reduced.matches ? this.target : this.from + (this.target - this.from) * taskProfileEase(elapsed);
    const squashTime = Math.min(1, (now - this.started) / (this.target ? settings.squashOpen : settings.squashClose));
    const squashTo = this.target ? 0 : settings.closeSquash;
    this.squash = this.fromSquash + (squashTo - this.fromSquash) * (1 - Math.pow(1 - squashTime, 3));
    if (!this.reduced.matches) this.clock += Math.min(0.05, (now - this.previous) / 1000);
    this.previous = now;
    const uniforms = this.material.uniforms;
    uniforms.u_p.value = this.progress;
    uniforms.u_squash.value = this.reduced.matches ? 0 : this.squash;
    uniforms.u_time.value = this.clock;
    uniforms.u_breath.value = this.reduced.matches ? 0 : settings.breath;
    this.renderer.render(this.scene, this.camera);
    const settled = elapsed === 1 || this.reduced.matches;
    this.onFrame(this.progress, settled);
    if (!this.disposed && (this.progress > 0 || !settled) && !(settled && this.reduced.matches)) this.wake();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.request);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.reduced.removeEventListener("change", this.onMotionPreference);
    this.texture.dispose(); this.geometry.dispose(); this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
