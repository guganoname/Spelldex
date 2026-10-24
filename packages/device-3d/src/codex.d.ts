import type * as THREE from 'three';

export interface CodexMaterialToken { color: string; metalness?: number; roughness?: number; clearcoat?: number }

/** Colors are sRGB hex like CSS; three converts them to linear. Mirrors @spelldex/design tokens. */
export interface CodexTokens {
  material: Record<'brass' | 'bronzeDark' | 'leather' | 'obsidian' | 'thread', CodexMaterialToken>;
  gem: Record<'W' | 'U' | 'B' | 'R' | 'G' | 'M' | 'C', { color: string }>;
  emissiveIntensity: { rest: number; active: number };
  screenGlow: string;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface CodexPoint { x: number; y: number }
export interface CodexScreenQuad {
  /** TL, TR, BR, BL in CSS pixels relative to the canvas. */
  corners: [CodexPoint, CodexPoint, CodexPoint, CodexPoint];
  rect: { x: number; y: number; left: number; top: number; right: number; bottom: number; width: number; height: number };
  axisAligned: boolean;
  /** False while the screen faces away from the camera (lid swinging). */
  facing: boolean;
  /** CSS pixels per world unit at the current pose; useful for font size and corner radius. */
  pxPerUnit: number;
}

export interface CodexGem {
  mesh: THREE.Mesh;
  intensity: number;
  apply(intensity: number): void;
}

export type CodexButton =
  | 'scan' | 'back' | 'search' | 'dpad-up' | 'dpad-down' | 'dpad-left' | 'dpad-right'
  | 'gem-0' | 'gem-1' | 'gem-2' | 'gem-3' | 'gem-4';

export interface Codex {
  group: THREE.Group;
  hinge: THREE.Group;
  lidPivot: THREE.Group;
  dims: typeof DIM;
  buttons: readonly CodexButton[];
  gems: { tabs: CodexGem[]; status: CodexGem[]; cover: CodexGem[]; seal: CodexGem; scan: CodexGem };
  readonly t: number;
  /** 0 closed .. 1 open; values above 1 (spring overshoot) swing the lid slightly past flat. */
  setOpen(t: number): void;
  /** Idle effects (seal pulse, gem fades, key travel). Returns true while anything still moves. */
  update(dtSeconds: number): boolean;
  /** Frames the device for the current t. At t >= 1 the camera looks straight on. */
  frameCamera(camera: THREE.PerspectiveCamera, aspect?: number): void;
  getScreenRects(camera: THREE.Camera, renderer: THREE.WebGLRenderer | { width: number; height: number }): { top: CodexScreenQuad; bottom: CodexScreenQuad };
  pickButton(ndc: { x: number; y: number }, camera: THREE.Camera): CodexButton | null;
  pickPart(ndc: { x: number; y: number }, camera: THREE.Camera): 'seal' | 'hinge' | null;
  pressButton(name: CodexButton): void;
  setActiveTab(index: number): void;
  /** Overrides a tab gem's glow; null returns it to automatic. */
  setGemGlow(index: number, intensity: number | null): void;
  setScanning(on: boolean): void;
  openClip(durationSeconds?: number): THREE.AnimationClip;
  /** Environment, AgX tone mapping and key light the materials are tuned for. Returns cleanup. */
  stage(scene: THREE.Scene, renderer: THREE.WebGLRenderer): () => void;
  dispose(): void;
}

export declare const DIM: { W: number; HALF: number; RH: number; DB: number; DL: number; CR: number };
export declare const DEFAULT_TOKENS: CodexTokens;
export declare const BUTTONS: readonly CodexButton[];
export declare function createCodex(opts?: { tokens?: DeepPartial<CodexTokens>; fontFamily?: string }): Codex;
export declare function quadToMatrix3d(width: number, height: number, corners: readonly CodexPoint[]): string;
export declare function lidEvents(prev: number, next: number): Array<'latch-release' | 'lid-detent'>;
export declare function codexEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture;
export declare function tokensFromDesign(design?: {
  color?: { mana?: Record<string, string> };
  material?: Record<string, CodexMaterialToken>;
  gem?: { emissiveIntensity?: { rest: number; active: number } };
}): DeepPartial<CodexTokens>;
