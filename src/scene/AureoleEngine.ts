import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  SPECTRA,
  ShockwaveState,
  SpectrumId,
  createInitialShockwaves,
  dampValue,
  stepShockwaves,
  triggerShockwave,
} from '../core/spectra';
import { createProceduralTextures } from './textures';
import { createStarCoreAssembly } from './coreBuilder';
import { createRingsAssembly } from './ringsBuilder';
import { createParticleSystem } from './particleSystem';
import { createAtmosphereAssembly } from './atmosphereBuilder';

export interface AureoleEngineCallbacks {
  onResonanceTrigger?: () => void;
  onContextLost?: (lost: boolean) => void;
}

const CinematicVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignetteOffset: { value: 1.05 },
    uVignetteDarkness: { value: 0.72 },
    uChromaticAmount: { value: 0.0014 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignetteOffset;
    uniform float uVignetteDarkness;
    uniform float uChromaticAmount;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - vec2(0.5);
      float dist = length(centered);
      vec2 shift = centered * dist * uChromaticAmount;

      float r = texture2D(tDiffuse, vUv + shift).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - shift).b;
      vec3 col = vec3(r, g, b);

      // Soft cinematic vignette keeping center luminous and corners deep
      float vig = smoothstep(uVignetteOffset, uVignetteOffset - 0.68, dist * 1.414);
      col *= mix(1.0 - uVignetteDarkness * 0.55, 1.0, vig);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class AureoleEngine {
  private container: HTMLElement;
  private callbacks: AureoleEngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private composer: EffectComposer | null = null;
  private bloomTight: UnrealBloomPass | null = null;
  private bloomWide: UnrealBloomPass | null = null;

  private textures: ReturnType<typeof createProceduralTextures>;
  private atmosphere: ReturnType<typeof createAtmosphereAssembly>;
  private starCore: ReturnType<typeof createStarCoreAssembly>;
  private rings: ReturnType<typeof createRingsAssembly>;
  private particles: ReturnType<typeof createParticleSystem>;

  private frameId = 0;
  private isTimeoutId = false;
  private disposed = false;

  // Interactive & simulation state
  private paused = false;
  private targetEnergy = 1.0;
  private currentEnergy = 1.0;
  private targetSpectrum: SpectrumId = 'molten-gold';
  private pulseBoost = 0;
  private shockwaves: ShockwaveState[] = createInitialShockwaves();

  private simTime = 0;
  private lastPerfTime = performance.now();
  private adaptiveDprScale = 1.0;
  private slowFrameAccumulator = 0;
  private slowFrameCount = 0;

  // Scratch objects (zero GC in render loop)
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _pointerNdc = new THREE.Vector2(0, 0);
  private readonly _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly _camDir = new THREE.Vector3();
  private readonly _hitPoint = new THREE.Vector3();
  private readonly _mouseWorld = new THREE.Vector3();
  private readonly _mouseTarget = new THREE.Vector3();
  private readonly _prevMouseWorld = new THREE.Vector3();
  private readonly _mouseVel = new THREE.Vector3();
  private mouseActiveTarget = 0;
  private mouseActive = 0;
  private pointerDirty = false;
  private lastPointerMoveMs = 0;

  private viewportWidth = 1;
  private viewportHeight = 1;
  private currentPixelRatio = 1;

  // Bound event listeners
  private handleResizeBound: () => void;
  private handlePointerMoveBound: (e: PointerEvent) => void;
  private handlePointerLeaveBound: () => void;
  private handleDoubleClickBound: (e: MouseEvent) => void;
  private handleContextLostBound: (e: Event) => void;
  private handleContextRestoredBound: () => void;

  constructor(container: HTMLElement, callbacks: AureoleEngineCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    this.viewportWidth = width;
    this.viewportHeight = height;

    // WebGL 2 renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.currentPixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(width, height);

    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('data-testid', 'aureole-canvas');
    container.appendChild(canvas);

    // Scene & Camera (responsive FOV keeps full 3-ring armillary framed on narrow viewports)
    this.scene = new THREE.Scene();
    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(
      this.computeResponsiveFov(aspect),
      aspect,
      0.15,
      220,
    );
    this.camera.position.set(0.65, 4.2, 13.6);

    // Smooth OrbitControls with inertia & multi-touch pinch/drag
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.055;
    this.controls.rotateSpeed = 0.78;
    this.controls.zoomSpeed = 0.92;
    this.controls.enablePan = false;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 24.0;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.update();

    // Build Scene Assemblies
    const initialPalette = SPECTRA[this.targetSpectrum];
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.atmosphere = createAtmosphereAssembly(
      this.scene,
      this.renderer,
      initialPalette,
      this.isSoftwareGl,
    );
    this.starCore = createStarCoreAssembly(initialPalette, this.textures);
    this.rings = createRingsAssembly(initialPalette, this.textures);
    this.particles = createParticleSystem(initialPalette);

    this.scene.add(this.starCore.group);
    this.scene.add(this.rings.group);
    this.scene.add(this.particles.points);

    // Multi-Scale Bloom + Cinematic Tone Mapping Composer on GPU
    if (!this.isSoftwareGl) {
      this.setupPostProcessing(width, height);
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind Listeners
    this.handleResizeBound = this.onResize.bind(this);
    this.handlePointerMoveBound = this.onPointerMove.bind(this);
    this.handlePointerLeaveBound = this.onPointerLeave.bind(this);
    this.handleDoubleClickBound = this.onDoubleClick.bind(this);
    this.handleContextLostBound = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost?.(true);
    };
    this.handleContextRestoredBound = () => {
      this.callbacks.onContextLost?.(false);
    };

    window.addEventListener('resize', this.handleResizeBound);
    canvas.addEventListener('pointermove', this.handlePointerMoveBound, { passive: true });
    canvas.addEventListener('pointerleave', this.handlePointerLeaveBound);
    canvas.addEventListener('dblclick', this.handleDoubleClickBound);
    canvas.addEventListener('webglcontextlost', this.handleContextLostBound);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestoredBound);

    this.lastPerfTime = performance.now();
    this.scheduleNextFrame();
  }

  private setupPostProcessing(width: number, height: number): void {
    const rt = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: 2,
    });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(this.currentPixelRatio);
    composer.setSize(width, height);

    composer.addPass(new RenderPass(this.scene, this.camera));

    // Tight crisp highlight bloom
    const bloomTight = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(width * 0.5), Math.floor(height * 0.5)),
      0.34, // strength
      0.28, // radius
      0.78, // threshold - keeps dark obsidian unbloomed
    );
    composer.addPass(bloomTight);

    // Wide atmospheric scattering bloom
    const bloomWide = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(width * 0.25), Math.floor(height * 0.25)),
      0.24, // strength
      0.88, // radius
      0.66, // threshold
    );
    composer.addPass(bloomWide);

    const vignettePass = new ShaderPass(CinematicVignetteShader);
    composer.addPass(vignettePass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    this.composer = composer;
    this.bloomTight = bloomTight;
    this.bloomWide = bloomWide;
  }

  public setSpectrum(id: SpectrumId): void {
    this.targetSpectrum = id;
  }

  public setEnergy(energy: number): void {
    this.targetEnergy = Math.max(0.2, Math.min(2.0, energy));
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public triggerResonance(): void {
    this.shockwaves = triggerShockwave(this.shockwaves, 1.0 + this.currentEnergy * 0.25, 24);
    this.pulseBoost = Math.min(1.4, this.pulseBoost + 1.0);
  }

  public getParticleCount(): number {
    return this.particles.totalCount;
  }

  private onPointerMove(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this._pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointerDirty = true;
    this.mouseActiveTarget = 1.0;
    this.lastPointerMoveMs = performance.now();
  }

  private onPointerLeave(): void {
    this.mouseActiveTarget = 0;
  }

  private onDoubleClick(e: MouseEvent): void {
    e.preventDefault();
    this.triggerResonance();
    this.callbacks.onResonanceTrigger?.();
  }

  private onResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.viewportWidth = width;
    this.viewportHeight = height;

    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = this.computeResponsiveFov(aspect);
    this.camera.updateProjectionMatrix();

    this.updatePixelRatio();
    this.renderer.setSize(width, height);

    if (this.composer) {
      this.composer.setPixelRatio(this.currentPixelRatio);
      this.composer.setSize(width, height);
    }
    if (this.bloomTight) {
      this.bloomTight.resolution.set(Math.floor(width * 0.5), Math.floor(height * 0.5));
    }
    if (this.bloomWide) {
      this.bloomWide.resolution.set(Math.floor(width * 0.25), Math.floor(height * 0.25));
    }
  }

  private computeResponsiveFov(aspect: number): number {
    const baseFovDeg = 44;
    if (aspect >= 0.95) return baseFovDeg;
    const baseHalfRad = THREE.MathUtils.degToRad(baseFovDeg * 0.5);
    const scaledTan = Math.tan(baseHalfRad) / Math.max(0.56, aspect * 0.98);
    return Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(scaledTan)));
  }

  private updatePixelRatio(): void {
    if (this.isSoftwareGl) {
      this.currentPixelRatio = 1;
    } else {
      const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
      this.currentPixelRatio = Math.max(0.75, baseDpr * this.adaptiveDprScale);
    }
    this.renderer.setPixelRatio(this.currentPixelRatio);
  }

  private updateMouseWorld(dt: number): void {
    const now = performance.now();
    if (now - this.lastPointerMoveMs > 1800) {
      this.mouseActiveTarget = 0;
    }

    if (this.pointerDirty) {
      this.pointerDirty = false;
      this.camera.getWorldDirection(this._camDir);
      this._plane.setFromNormalAndCoplanarPoint(this._camDir, this.controls.target);
      this._raycaster.setFromCamera(this._pointerNdc, this.camera);
      if (this._raycaster.ray.intersectPlane(this._plane, this._hitPoint)) {
        this._mouseTarget.copy(this._hitPoint);
      }
    }

    this._prevMouseWorld.copy(this._mouseWorld);
    const followAlpha = 1 - Math.exp(-14 * Math.max(0.001, dt));
    this._mouseWorld.lerp(this._mouseTarget, followAlpha);

    if (dt > 0.0001) {
      this._mouseVel
        .copy(this._mouseWorld)
        .sub(this._prevMouseWorld)
        .divideScalar(Math.max(0.016, dt))
        .clampLength(0, 8.0);
    }

    this.mouseActive = dampValue(this.mouseActive, this.mouseActiveTarget, 6.0, dt);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = Math.min(0.1, Math.max(0.001, (now - this.lastPerfTime) / 1000));
    this.lastPerfTime = now;

    // Adaptive resolution guard on GPU if frame time exceeds 28ms consistently
    if (!this.isSoftwareGl && rawDt > 0.028) {
      this.slowFrameAccumulator += rawDt;
      this.slowFrameCount++;
      if (this.slowFrameCount > 24 && this.adaptiveDprScale > 0.72) {
        this.adaptiveDprScale = Math.max(0.72, this.adaptiveDprScale - 0.15);
        this.updatePixelRatio();
        this.composer?.setPixelRatio(this.currentPixelRatio);
        this.slowFrameCount = 0;
        this.slowFrameAccumulator = 0;
      }
    } else if (this.slowFrameCount > 0) {
      this.slowFrameCount = Math.max(0, this.slowFrameCount - 1);
    }
    void this.slowFrameAccumulator;

    // Camera controls always update smoothly even when paused
    this.controls.update();
    this.updateMouseWorld(rawDt);

    // Smooth energy & spectrum transitions
    this.currentEnergy = dampValue(this.currentEnergy, this.targetEnergy, 5.5, rawDt);
    const palette = SPECTRA[this.targetSpectrum];
    const colorBlend = 1 - Math.exp(-4.5 * rawDt);
    this.atmosphere.applySpectrum(palette, colorBlend);
    this.starCore.applySpectrum(palette, colorBlend);
    this.rings.applySpectrum(palette, colorBlend);
    this.particles.applySpectrum(palette, colorBlend);

    // Advance simulation when unpaused
    const simDt = this.paused ? 0 : rawDt;
    this.simTime += simDt;

    if (!this.paused) {
      this.pulseBoost = dampValue(this.pulseBoost, 0, 2.2, rawDt);
      this.shockwaves = stepShockwaves(this.shockwaves, simDt, this.currentEnergy);
    }

    // Update assemblies
    this.atmosphere.update(this.simTime, this.currentEnergy, this.pulseBoost);
    this.starCore.update(
      this.simTime,
      simDt,
      this.currentEnergy,
      this.pulseBoost,
      this.shockwaves,
    );
    this.rings.update(simDt, this.currentEnergy, this.pulseBoost);

    const focusDistance = this.camera.position.distanceTo(this.controls.target);
    this.particles.update(
      this.simTime,
      this.currentPixelRatio,
      this.viewportHeight,
      focusDistance,
      this.currentEnergy,
      this._mouseWorld,
      this._mouseVel,
      this.mouseActive,
      this.shockwaves,
    );

    if (this.bloomTight && this.bloomWide) {
      this.bloomTight.strength = 0.3 + this.currentEnergy * 0.06 + this.pulseBoost * 0.16;
      this.bloomWide.strength = 0.2 + this.currentEnergy * 0.05 + this.pulseBoost * 0.12;
    }

    // Render frame
    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }

    this.scheduleNextFrame();
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.isTimeoutId = true;
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.isTimeoutId = true;
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.isTimeoutId = true;
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.isTimeoutId = true;
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.isTimeoutId = false;
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.isTimeoutId) {
      clearTimeout(this.frameId);
    } else {
      cancelAnimationFrame(this.frameId);
    }

    const canvas = this.renderer.domElement;
    window.removeEventListener('resize', this.handleResizeBound);
    canvas.removeEventListener('pointermove', this.handlePointerMoveBound);
    canvas.removeEventListener('pointerleave', this.handlePointerLeaveBound);
    canvas.removeEventListener('dblclick', this.handleDoubleClickBound);
    canvas.removeEventListener('webglcontextlost', this.handleContextLostBound);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestoredBound);

    this.controls.dispose();
    this.particles.dispose();
    this.rings.dispose();
    this.starCore.dispose();
    this.atmosphere.dispose();
    this.textures.dispose();
    this.composer?.dispose();
    this.renderer.dispose();

    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
