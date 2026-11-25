import { useCallback, useEffect, useRef, useState } from 'react';
import { SPECTRA, SpectrumId } from './core/spectra';
import { AureoleEngine } from './scene/AureoleEngine';
import { ControlDock } from './components/ControlDock';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AureoleEngine | null>(null);

  const [spectrum, setSpectrum] = useState<SpectrumId>('molten-gold');
  const [energy, setEnergy] = useState<number>(1.0);
  const [paused, setPaused] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [resonanceCount, setResonanceCount] = useState<number>(0);
  const [contextLost, setContextLost] = useState<boolean>(false);

  // Mount Three.js engine once in dedicated empty ref container
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new AureoleEngine(container, {
      onResonanceTrigger: () => {
        setResonanceCount((c) => c + 1);
      },
      onContextLost: (lost) => {
        setContextLost(lost);
      },
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleSelectSpectrum = useCallback((id: SpectrumId) => {
    setSpectrum(id);
    engineRef.current?.setSpectrum(id);
  }, []);

  const handleChangeEnergy = useCallback((nextEnergy: number) => {
    setEnergy(nextEnergy);
    engineRef.current?.setEnergy(nextEnergy);
  }, []);

  const handleTogglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      engineRef.current?.setPaused(next);
      return next;
    });
  }, []);

  const handleTriggerResonance = useCallback(() => {
    engineRef.current?.triggerResonance();
    setResonanceCount((c) => c + 1);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setDockCollapsed((prev) => !prev);
  }, []);

  // Keyboard shortcuts: H toggles panel, R triggers resonance
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        engineRef.current?.triggerResonance();
        setResonanceCount((c) => c + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activePalette = SPECTRA[spectrum];

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#02050c]"
      data-spectrum={spectrum}
      data-paused={String(paused)}
      data-energy={energy.toFixed(2)}
      data-resonance-count={String(resonanceCount)}
      data-dock-collapsed={String(dockCollapsed)}
    >
      {/* Isolated WebGL Canvas Mount */}
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="AUREOLE 星核圣殿 3D 实时交互画布"
      />

      {/* Minimal Editorial Title Overlay (Top-Left, Unboxed) */}
      <header className="pointer-events-none fixed top-5 left-5 sm:top-7 sm:left-8 z-10 flex flex-col gap-1">
        <div className="flex items-baseline gap-2.5">
          <h1 className="font-display text-lg sm:text-xl font-semibold tracking-[0.22em] text-slate-100">
            AUREOLE
          </h1>
          <span className="text-slate-500 text-xs" aria-hidden="true">
            ·
          </span>
          <span
            className="text-xs sm:text-sm font-medium tracking-[0.18em] transition-colors duration-300"
            style={{ color: activePalette.accentHex }}
          >
            星核圣殿
          </span>
        </div>
        <p className="hidden sm:block text-[11px] tracking-[0.06em] text-slate-400/80">
          拖动环绕 · 滚轮缩放 · 移动扰动星尘 · 双击释放共振
        </p>
      </header>

      {/* WebGL Context Loss Fallback */}
      {contextLost && (
        <div
          role="alert"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#02050c]/90 px-6 text-center"
        >
          <div className="max-w-sm space-y-2">
            <h2 className="font-display text-lg tracking-widest text-slate-100">
              WEBGL CONTEXT INTERRUPTED
            </h2>
            <p className="text-sm text-slate-400">
              图形上下文已暂停，正在等待浏览器恢复渲染资源。
            </p>
          </div>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock */}
      <ControlDock
        spectrum={spectrum}
        energy={energy}
        paused={paused}
        collapsed={dockCollapsed}
        onSelectSpectrum={handleSelectSpectrum}
        onChangeEnergy={handleChangeEnergy}
        onTogglePause={handleTogglePause}
        onTriggerResonance={handleTriggerResonance}
        onToggleCollapse={handleToggleCollapse}
      />
    </main>
  );
}
