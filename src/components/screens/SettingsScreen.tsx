import { useState, useEffect, useRef } from "react";
import {
  updateParams, getParams, resetParams, setVizCallback, isPlaying,
  getCurrentChaosIntensity,
} from "../../audio/musicEngine";
import { saveMusicSettings } from "../../audio/musicSettings";
import type { MusicParams } from "../../audio/musicEngine";

type Tab = "music" | "game";

export default function SettingsScreen() {
  const [tab, setTab] = useState<Tab>("music");
  const [p, setP] = useState<MusicParams>(getParams);
  const [bars, setBars] = useState<number[]>(Array(16).fill(2));
  const [chaosIntensity, setChaosIntensity] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Poll chaos intensity when music isn't driving viz callbacks
  // (viz callback only fires when AudioContext is running)
  useEffect(() => {
    function poll() {
      setChaosIntensity(getCurrentChaosIntensity());
      rafRef.current = requestAnimationFrame(poll);
    }
    rafRef.current = requestAnimationFrame(poll);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Wire viz bars when on music tab
  useEffect(() => {
    if (tab === "music") {
      setVizCallback((b, ci) => { setBars(b); setChaosIntensity(ci); });
    }
    return () => setVizCallback(null);
  }, [tab]);

  function apply(next: Partial<MusicParams>) {
    const updated = { ...p, ...next };
    setP(updated);
    updateParams(next);
    saveMusicSettings(updated);
  }

  function handleReset() {
    resetParams();
    const fresh = getParams();
    setP(fresh);
    saveMusicSettings(fresh);
  }

  const row: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 0", borderBottom: "1px solid var(--border)",
  };
  const label: React.CSSProperties = { fontSize: 12, color: "var(--text-dim)", minWidth: 160 };
  const val: React.CSSProperties = { fontSize: 11, color: "var(--text-head)", minWidth: 36, textAlign: "right" };

  function Slider({
    min, max, step, value, onChange,
  }: { min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
    return (
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, margin: "0 12px", accentColor: "var(--gold)" }}
      />
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", maxWidth: 600 }}>
      <h2 style={{ marginBottom: 20, fontSize: 16, color: "var(--text-head)" }}>Settings</h2>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 24 }}>
        {(["music", "game"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "transparent", border: "none",
            borderBottom: tab === t ? "2px solid var(--gold)" : "2px solid transparent",
            borderRadius: 0, color: tab === t ? "var(--gold)" : "var(--text-dim)",
            padding: "6px 20px", fontSize: 12, fontWeight: tab === t ? 600 : 400,
            textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
          }}>
            {t === "music" ? "♪ Music" : "⚙ Game"}
          </button>
        ))}
      </div>

      {tab === "game" && (
        <div style={{ color: "var(--text-dim)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>
          Coming soon — difficulty, game speed, and other game settings.
        </div>
      )}

      {tab === "music" && (
        <div>
          {/* Visualizer */}
          <div style={{
            display: "flex", alignItems: "flex-end", gap: 3, height: 64,
            width: "100%", maxWidth: 320, marginBottom: 20,
          }}>
            {bars.map((h, i) => (
              <div key={i} style={{
                flex: 1, minHeight: 2, borderRadius: "1px 1px 0 0",
                height: h,
                background: i % 3 === 2 ? "#4ae8a0" : i % 2 === 1 ? "#4ab8e8" : "var(--gold)",
                transition: "height 0.05s",
              }} />
            ))}
          </div>

          {/* Chaos index bar */}
          <div style={{ marginBottom: 24, maxWidth: 320 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
              <span>Chaos Index</span>
              <span>{Math.round(chaosIntensity * 100)}%</span>
            </div>
            <div style={{ height: 3, background: "var(--bg-card)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.1s",
                width: `${Math.round(chaosIntensity * 100)}%`,
                background: "linear-gradient(90deg, #4ae8a0, #e8c84a, #e84a6a)",
              }} />
            </div>
          </div>

          {/* Master controls */}
          <SectionHead>Master</SectionHead>
          <div style={row}>
            <span style={label}>Enabled</span>
            <input type="checkbox" checked={p.enabled}
              onChange={(e) => apply({ enabled: e.target.checked })}
              style={{ accentColor: "var(--gold)", width: 16, height: 16 }} />
          </div>
          <div style={row}>
            <span style={label}>Master Volume</span>
            <Slider min={0} max={1} step={0.01} value={p.masterVolume} onChange={(v) => apply({ masterVolume: v })} />
            <span style={val}>{Math.round(p.masterVolume * 100)}%</span>
          </div>
          <div style={row}>
            <span style={label}>Tempo</span>
            <span style={{ ...val, flex: 1, textAlign: "left", paddingLeft: 12 }}>{p.bpm} BPM</span>
          </div>

          {/* Chaos Parameters */}
          <SectionHead>Chaos Parameters</SectionHead>
          <div style={row}>
            <span style={label}>Chaos Intensity (R)</span>
            <Slider min={3.5} max={3.99} step={0.01} value={p.chaosR} onChange={(v) => apply({ chaosR: v })} />
            <span style={val}>{p.chaosR.toFixed(2)}</span>
          </div>
          <div style={{ ...row, flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            <span style={label}>Starting Condition</span>
            <span style={{ fontSize: 10, color: "var(--text-dim)" }}>Same value produces same sequence</span>
            <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
              <Slider min={0.01} max={0.99} step={0.01} value={p.chaosInitialX} onChange={(v) => apply({ chaosInitialX: v })} />
              <span style={val}>{p.chaosInitialX.toFixed(2)}</span>
            </div>
          </div>

          {/* Voice levels */}
          <SectionHead>Voice Levels</SectionHead>
          {([
            ["Melody",     "melodyGain", 0, 1, 0.01] as const,
            ["Bass",       "bassGain",   0, 1, 0.01] as const,
            ["Arpeggio",   "arpGain",    0, 1, 0.01] as const,
            ["Percussion", "percGain",   0, 1, 0.01] as const,
          ]).map(([lbl, key, min, max, step]) => (
            <div key={key} style={row}>
              <span style={label}>{lbl}</span>
              <Slider min={min} max={max} step={step} value={p[key]} onChange={(v) => apply({ [key]: v } as Partial<MusicParams>)} />
              <span style={val}>{Math.round(p[key] * 100)}%</span>
            </div>
          ))}

          {/* Status */}
          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, color: "var(--text-dim)" }}>
            {isPlaying() ? "▶ Playing" : "⏸ Stopped"}
          </div>

          {/* Reset */}
          <button onClick={handleReset} style={{ marginTop: 8, fontSize: 11 }}>
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 20, marginBottom: 4,
      fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.12em",
      textTransform: "uppercase", fontWeight: 700,
    }}>
      {children}
    </div>
  );
}
