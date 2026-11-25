import React from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Radio } from 'lucide-react';
import { SPECTRA, SPECTRUM_ORDER, SpectrumId } from '../core/spectra';

export interface ControlDockProps {
  spectrum: SpectrumId;
  energy: number;
  paused: boolean;
  collapsed: boolean;
  onSelectSpectrum: (id: SpectrumId) => void;
  onChangeEnergy: (energy: number) => void;
  onTogglePause: () => void;
  onTriggerResonance: () => void;
  onToggleCollapse: () => void;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  spectrum,
  energy,
  paused,
  collapsed,
  onSelectSpectrum,
  onChangeEnergy,
  onTogglePause,
  onTriggerResonance,
  onToggleCollapse,
}) => {
  const activePalette = SPECTRA[spectrum];

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-[min(780px,94vw)] pointer-events-none"
      style={{ '--slider-accent': activePalette.accentHex } as React.CSSProperties}
    >
      {/* Collapse / Expand toggle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开控制面板' : '收起控制面板'}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-t-lg text-[11px] font-medium tracking-wide text-slate-300 hover:text-white bg-[rgba(9,13,24,0.86)] border border-white/10 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 whitespace-nowrap shrink-0"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>展开控制</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>收起控制</span>
          </>
        )}
      </button>

      {/* Collapsible Unified Control Bar */}
      <div
        className={`pointer-events-auto w-full rounded-xl bg-[rgba(8,12,22,0.88)] border border-white/10 shadow-[0_14px_40px_rgba(0,0,0,0.65)] transition-all duration-200 ease-out ${
          collapsed
            ? 'opacity-0 translate-y-6 pointer-events-none max-h-0 overflow-hidden border-transparent py-0'
            : 'opacity-100 translate-y-0 px-2.5 py-2 sm:px-4 sm:py-2.5'
        }`}
        aria-hidden={collapsed}
      >
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3">
          {/* Spectrum Presets */}
          <div
            role="group"
            aria-label="光谱主题"
            className="flex items-center gap-1 p-0.5 sm:p-1 rounded-lg bg-white/[0.04] border border-white/[0.06] shrink-0"
          >
            {SPECTRUM_ORDER.map((id) => {
              const item = SPECTRA[id];
              const isActive = spectrum === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectSpectrum(id)}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[34px] px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${
                    isActive
                      ? 'bg-white/12 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.swatchHex }}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Energy Slider */}
          <div className="flex items-center gap-2.5 flex-1 min-w-[140px] sm:min-w-[165px] px-1">
            <label
              htmlFor="energy-slider"
              className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0"
            >
              能量
            </label>
            <input
              id="energy-slider"
              type="range"
              min={0.2}
              max={2.0}
              step={0.05}
              value={energy}
              onChange={(e) => onChangeEnergy(parseFloat(e.target.value))}
              aria-label="调节星核能量"
              className="aureole-slider w-full h-5"
            />
            <span className="font-mono-tabular text-xs text-slate-300 w-10 text-right shrink-0">
              {energy.toFixed(2)}×
            </span>
          </div>

          {/* Action Buttons: Pause/Resume & Resonance */}
          <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
            <button
              type="button"
              onClick={onTogglePause}
              aria-pressed={paused}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
            >
              {paused ? (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>继续</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>暂停</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onTriggerResonance}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-950 transition-transform duration-150 active:scale-95 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ backgroundColor: activePalette.accentHex }}
            >
              <Radio className="w-3.5 h-3.5" aria-hidden="true" />
              <span>释放共振</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
