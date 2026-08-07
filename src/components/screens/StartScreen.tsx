import { useState } from "react";
import type { MapConfig } from "../../types";
import {
  defaultMapConfig,
  europeanMapConfig,
  frontierMapConfig,
  developingMapConfig,
  industrialMapConfig,
} from "../../config/gameConfig";

// ============================================================
// StartScreen — landing + optional game config
// ============================================================

interface Props {
  onStart: (playerName: string, mapConfig?: MapConfig) => void;
}

type Mode = "landing" | "config";

const PRESETS: { label: string; description: string; config: MapConfig }[] = [
  { label: "Default",     description: "Balanced trading nation, developed infrastructure", config: defaultMapConfig },
  { label: "European",    description: "Dense roads, advanced highways, few rural dead-ends", config: europeanMapConfig },
  { label: "Developing",  description: "Sparse roads, basic highway spine between major cities", config: developingMapConfig },
  { label: "Frontier",    description: "Isolated settlements, no highways, hard terrain", config: frontierMapConfig },
  { label: "Industrial",  description: "Industrial zone bias, normal connectivity", config: industrialMapConfig },
];

const MAP_SIZES = [
  { label: "Small",  value: 30 },
  { label: "Normal", value: 50 },
  { label: "Large",  value: 80 },
];

export default function StartScreen({ onStart }: Props) {
  const [mode, setMode] = useState<Mode>("landing");
  const [playerName, setPlayerName] = useState("");
  const [config, setConfig] = useState<MapConfig>(defaultMapConfig);
  const [activePreset, setActivePreset] = useState<string | null>("Default");

  function applyPreset(p: typeof PRESETS[number]) {
    setConfig(p.config);
    setActivePreset(p.label);
  }

  function updateConfig(patch: Partial<MapConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
    setActivePreset(null);
  }

  const canStart = playerName.trim().length > 0;

  if (mode === "landing") {
    return (
      <div style={outerStyle}>
        <div style={cardStyle}>
          <div style={{ color: "var(--gold)", fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", fontFamily: "monospace", marginBottom: 8 }}>
            Supply Chain Sim
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 28 }}>
            Build a supply chain empire. Start small. Grow fast. Don't go bankrupt.
          </div>

          <label style={labelStyle}>Corporation name</label>
          <input
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 20 }}
            placeholder="Enter corporation name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canStart && onStart(playerName.trim())}
            autoFocus
          />

          <button
            className="primary"
            style={{ width: "100%", padding: "10px 0", fontSize: 14, marginBottom: 10 }}
            disabled={!canStart}
            onClick={() => onStart(playerName.trim())}
          >
            Quick Game
          </button>
          <button
            style={{ width: "100%", padding: "8px 0", fontSize: 13 }}
            disabled={!canStart}
            onClick={() => setMode("config")}
          >
            Configure Map...
          </button>

          <div style={{ marginTop: 24, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.8 }}>
            1980 · €100,000 capital · 200 turns · one AI rival
            <br />Win condition: €5M net worth
          </div>
        </div>
      </div>
    );
  }

  // ── Config mode ──────────────────────────────────────────────
  const mapSizeLabel = MAP_SIZES.find((s) => s.value === config.nodeCount)?.label ?? "Custom";

  return (
    <div style={{ ...outerStyle, alignItems: "flex-start", padding: 32, overflowY: "auto" }}>
      <div style={{ ...cardStyle, width: 560, textAlign: "left" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setMode("landing")}>
            ← Back
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-head)" }}>
            Configure New Game
          </div>
          {activePreset && (
            <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", background: "var(--bg)", border: "1px solid var(--accent)", borderRadius: 4, padding: "2px 8px" }}>
              {activePreset}
            </div>
          )}
        </div>

        {/* Corp name */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Corporation name</label>
          <input
            style={{ width: "100%", boxSizing: "border-box" }}
            placeholder="Enter corporation name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Presets */}
        <SectionHeader>Presets</SectionHeader>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              title={p.description}
              style={{
                fontSize: 12,
                padding: "6px 14px",
                background: activePreset === p.label ? "var(--accent)" : "var(--bg)",
                color: activePreset === p.label ? "#fff" : "var(--text-body)",
                border: `1px solid ${activePreset === p.label ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 6,
                cursor: "pointer",
              }}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {activePreset && (
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: -18, marginBottom: 20 }}>
            {PRESETS.find((p) => p.label === activePreset)?.description}
          </div>
        )}

        {/* World settings */}
        <SectionHeader>World</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: 24 }}>

          <ParamRow label="Map type">
            <SegmentedControl
              options={["trading", "industrial", "frontier"]}
              labels={["Trading", "Industrial", "Frontier"]}
              value={config.mapType}
              onChange={(v) => updateConfig({ mapType: v as MapConfig["mapType"] })}
            />
          </ParamRow>

          <ParamRow label="Difficulty">
            <SegmentedControl
              options={["easy", "medium", "hard"]}
              labels={["Easy", "Medium", "Hard"]}
              value={config.difficulty}
              onChange={(v) => updateConfig({ difficulty: v as MapConfig["difficulty"] })}
            />
          </ParamRow>

          <ParamRow label="Map size">
            <SegmentedControl
              options={MAP_SIZES.map((s) => String(s.value))}
              labels={MAP_SIZES.map((s) => s.label)}
              value={String(config.nodeCount)}
              onChange={(v) => updateConfig({ nodeCount: Number(v) })}
            />
            <span style={hintStyle}>{mapSizeLabel === "Custom" ? `${config.nodeCount} nodes` : `${config.nodeCount} cities`}</span>
          </ParamRow>

          <ParamRow label="Ports">
            <SegmentedControl
              options={["1", "2", "3", "4", "5"]}
              labels={["1", "2", "3", "4", "5"]}
              value={String(config.portCount)}
              onChange={(v) => updateConfig({ portCount: Number(v) })}
            />
          </ParamRow>

        </div>

        {/* Connectivity settings */}
        <SectionHeader>Connectivity</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginBottom: 28 }}>

          <ParamRow label="Road network" hint="How densely settlements are interconnected">
            <SegmentedControl
              options={["isolated", "sparse", "normal", "dense"]}
              labels={["Isolated", "Sparse", "Normal", "Dense"]}
              value={config.connectivity}
              onChange={(v) => updateConfig({ connectivity: v as MapConfig["connectivity"] })}
            />
          </ParamRow>

          <ParamRow label="Highways" hint="Which cities receive a highway connection">
            <SegmentedControl
              options={["undeveloped", "basic", "developed", "advanced"]}
              labels={["None", "Basic", "Developed", "Advanced"]}
              value={config.infrastructure}
              onChange={(v) => updateConfig({ infrastructure: v as MapConfig["infrastructure"] })}
            />
          </ParamRow>

          <ParamRow label="Min. connections" hint="Minimum road connections guaranteed per settlement">
            <SegmentedControl
              options={["0", "1", "2", "3"]}
              labels={["0 — dead-ends ok", "1 — always connected", "2 — well-linked", "3 — grid-like"]}
              value={String(config.minimumDegree)}
              onChange={(v) => updateConfig({ minimumDegree: Number(v) })}
            />
          </ParamRow>

        </div>

        <button
          className="primary"
          style={{ width: "100%", padding: "10px 0", fontSize: 14 }}
          disabled={!canStart}
          onClick={() => canStart && onStart(playerName.trim(), config)}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Shared sub-components
// ============================================================

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.08em",
      color: "var(--text-dim)",
      textTransform: "uppercase",
      marginBottom: 10,
      borderBottom: "1px solid var(--border)",
      paddingBottom: 6,
    }}>
      {children}
    </div>
  );
}

function ParamRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5 }}>
        {label}
        {hint && <span style={{ marginLeft: 6, color: "var(--text-dim)", opacity: 0.7 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({ options, labels, value, onChange }: {
  options: string[];
  labels: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {options.map((opt, i) => (
        <button
          key={opt}
          style={{
            fontSize: 11,
            padding: "4px 10px",
            background: value === opt ? "var(--accent)" : "var(--bg)",
            color: value === opt ? "#fff" : "var(--text-dim)",
            border: `1px solid ${value === opt ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 4,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onClick={() => onChange(opt)}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const outerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100%",
  background: "var(--bg)",
  padding: 24,
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 36,
  width: 400,
  textAlign: "center",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-dim)",
  marginBottom: 6,
  textAlign: "left",
};

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-dim)",
  marginTop: 3,
  display: "block",
};
