/* The live view's 3D mode on the GPU (ADR 0073): recent spectra as a surface that runs from "now" at
   the front into the distance. Frequency across (log, as the 2D view), level as height and colour
   (the palette), a ridge line every few frames, the file's cutoff as a dashed line on the floor. It
   turns, zooms and moves with the pointer (OrbitControls); Reset puts it back. Loaded only when shown
   (three.js is large); without WebGL the 2D waterfall stays. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WF_BANDS, WF_DEPTH, type WaterfallFrame } from './waterfall';

const D = 2.6, H = 0.62;                 // the surface's depth, and its height at full level
const BG = 0x030406, RIDGE_EVERY = 4;
const TICKS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 40000, 80000];

/** Where the camera is, around what it looks at (for tests and Reset). */
export interface View3D { az: number; polar: number; dist: number }

export class Waterfall3D {
  readonly controls: OrbitControls;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 2, 0.01, 60);
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private cut: THREE.Line;
  private cutMat: THREE.LineDashedMaterial;
  private grid = new THREE.Group();
  private nyq = 0;
  /** The surface's width: wider in a wide box, so it fills it as the flat drawing does. */
  private W = 2;
  private cutHz: number | null = null;
  private things: { dispose(): void }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    // Kept after each frame, so the page (and tests) can read what's shown.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // The palette is already in screen colours: no conversion on the way out.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(BG);
    this.scene.fog = new THREE.Fog(BG, 2.3, 5.6);

    // The surface: one vertex per band and frame, frame 0 ("now") at the front.
    const n = WF_BANDS * WF_DEPTH, p = new Float32Array(n * 3);
    for (let d = 0; d < WF_DEPTH; d++) for (let b = 0; b < WF_BANDS; b++) p[(d * WF_BANDS + b) * 3 + 2] = -d / (WF_DEPTH - 1) * D;
    this.pos = new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage);
    this.across(this.W);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const tris: number[] = [], ridges: number[] = [], front: number[] = [];
    for (let d = 0; d < WF_DEPTH; d++) for (let b = 0; b < WF_BANDS - 1; b++) {
      const a = d * WF_BANDS + b;
      if (d < WF_DEPTH - 1) tris.push(a, a + WF_BANDS, a + 1, a + 1, a + WF_BANDS, a + WF_BANDS + 1);
      if (d === 0) front.push(a, a + 1); else if (d % RIDGE_EVERY === 0) ridges.push(a, a + 1);
    }
    const geo = (index: number[], colors: boolean) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', this.pos);
      if (colors) g.setAttribute('color', this.col);
      g.setIndex(index);
      this.things.push(g);
      return g;
    };
    const mat = <M extends THREE.Material>(m: M) => { this.things.push(m); return m; };
    this.scene.add(new THREE.Mesh(geo(tris, true), mat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))));
    this.scene.add(new THREE.LineSegments(geo(ridges, false), mat(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }))));
    this.scene.add(new THREE.LineSegments(geo(front, false), mat(new THREE.LineBasicMaterial({ color: 0xffffff }))));

    // The cutoff: dashed, on the floor, into the distance.
    const cg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.002, 0.06), new THREE.Vector3(0, 0.002, -D)]);
    this.cutMat = mat(new THREE.LineDashedMaterial({ color: 0xffd400, dashSize: 0.05, gapSize: 0.04 }));
    this.cut = new THREE.Line(cg, this.cutMat);
    this.cut.computeLineDistances();
    this.cut.visible = false;
    this.things.push(cg);
    this.scene.add(this.cut, this.grid);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.7;
    this.controls.maxDistance = 7;
    this.controls.maxPolarAngle = Math.PI * 0.49;   // never under the floor
    this.controls.target.set(0, -0.06, -D * 0.36);
    this.camera.position.set(0, 0.9, 1.35);
    this.controls.update();
    this.controls.saveState();
  }

  /** The newest spectra (frames[last] is "now"), the palette, the top of the scale, the cutoff. */
  update(frames: WaterfallFrame[], lut: Uint8ClampedArray, nyq: number, cutHz: number | null, accent: string) {
    const p = this.pos.array as Float32Array, c = this.col.array as Float32Array, n = frames.length;
    for (let d = 0; d < WF_DEPTH; d++) {
      const f = d < n ? frames[n - 1 - d].t : null;
      for (let b = 0; b < WF_BANDS; b++) {
        const i = (d * WF_BANDS + b) * 3, v = f ? f[b] : 0, li = Math.round(v * 255) * 3;
        p[i + 1] = v * H;
        c[i] = lut[li] / 255; c[i + 1] = lut[li + 1] / 255; c[i + 2] = lut[li + 2] / 255;
      }
    }
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
    if (nyq !== this.nyq) this.floor(nyq);
    this.cutHz = cutHz;
    this.cut.visible = !!cutHz && cutHz > 20 && cutHz < nyq;
    if (this.cut.visible) this.cut.position.x = this.xOf(cutHz!);
    try { this.cutMat.color.set(accent); } catch { /* not a colour three.js reads */ }
  }

  /** Across: 20 Hz at the left edge to the top of the scale at the right, logarithmic. */
  private xOf(hz: number) { return (Math.log(hz / 20) / Math.log(this.nyq / 20) - 0.5) * this.W; }
  /** Place the bands across a width. */
  private across(w: number) {
    this.W = w;
    const p = this.pos.array as Float32Array;
    for (let d = 0; d < WF_DEPTH; d++) for (let b = 0; b < WF_BANDS; b++) p[(d * WF_BANDS + b) * 3] = ((b + 0.5) / WF_BANDS - 0.5) * w;
    this.pos.needsUpdate = true;
    if (this.nyq) this.floor(this.nyq);
  }

  private floor(nyq: number) {
    this.nyq = nyq;
    for (const o of [...this.grid.children]) { this.grid.remove(o); (o as THREE.Line).geometry.dispose(); }
    const m = mat0 ??= new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 });
    const line = (a: THREE.Vector3, b: THREE.Vector3) => this.grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), m));
    for (const f of TICKS.filter(f => f < nyq * 0.98)) { const x = this.xOf(f); line(new THREE.Vector3(x, 0, 0.04), new THREE.Vector3(x, 0, -D)); }
    for (let k = 0; k <= 4; k++) { const z = -k / 4 * D; line(new THREE.Vector3(-this.W / 2, 0, z), new THREE.Vector3(this.W / 2, 0, z)); }
  }

  /** The frequency labels along the front edge, where they are on screen (px). */
  labels(w: number, h: number): { text: string; x: number; y: number }[] {
    if (!this.nyq) return [];
    const v = new THREE.Vector3();
    return TICKS.filter(f => f < this.nyq * 0.98).map(f => {
      v.set(this.xOf(f), 0, 0.08).project(this.camera);
      return { text: f >= 1000 ? f / 1000 + 'k' : String(f), x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, z: v.z };
    }).filter(l => l.z < 1 && l.x > -20 && l.x < w + 20 && l.y > -20 && l.y < h + 20);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    const width = Math.max(2, Math.min(6, 2 * this.camera.aspect / 2.2));
    if (Math.abs(width - this.W) > 0.01) { this.across(width); if (this.cut.visible && this.cutHz) this.cut.position.x = this.xOf(this.cutHz); }
  }
  render() { this.renderer.render(this.scene, this.camera); }
  reset() { this.controls.reset(); }
  view(): View3D { return { az: this.controls.getAzimuthalAngle(), polar: this.controls.getPolarAngle(), dist: this.controls.getDistance() }; }
  dispose() {
    this.controls.dispose();
    for (const o of this.grid.children) (o as THREE.Line).geometry.dispose();
    for (const t of this.things) t.dispose();
    this.renderer.dispose();
  }
}
let mat0: THREE.LineBasicMaterial | undefined;

/** A 3D view on this canvas, or null when the browser has no WebGL here. */
export function create3D(canvas: HTMLCanvasElement): Waterfall3D | null {
  try { return new Waterfall3D(canvas); } catch (e) { console.warn('No WebGL: the 3D view stays flat', e); return null; }
}
