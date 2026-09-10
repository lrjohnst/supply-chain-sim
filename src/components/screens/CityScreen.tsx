import { useGameStore } from "../../store/gameStore";
import { computeNetworkFactor } from "../../engine/city";
import { qty } from "../shared/fmt";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ============================================================
// CityScreen
// Two-column layout: left panel (city life stats) + right sidebar (RightPanel, unchanged in App.tsx).
// Opens for all node types when the user clicks a node on the map.
// ============================================================

interface Props {
  cityId: string;
  onBack: () => void;
}

export default function CityScreen({ cityId, onBack }: Props) {
  const { gameState } = useGameStore();
  if (!gameState) return null;

  const city = gameState.cityNodes[cityId];
  if (!city) return null;

  const networkFactor = computeNetworkFactor(gameState, cityId);

  // --- Trend: last 4 turns of history (one year) ---
  const popHist  = city.populationHistory;
  const wlthHist = city.wealthHistory;
  const popTrend  = trend(popHist,  4);
  const wlthTrend = trend(wlthHist, 4);

  // --- Land value: placeholder ---
  // TODO: replace with real land value formula once the land value system is implemented.
  const landValue = 1;
  const landTrend = { delta: 0, dir: "flat" as TrendDir };

  // --- Character icons ---
  const growthTier  = city.baseGrowthRate < 0.005 ? "Struggling" : city.baseGrowthRate < 0.010 ? "Moderate" : "Vigorous";
  const wealthTier  = city.baseWealthRate < -0.0003 ? "Eroding" : city.baseWealthRate < 0.0001 ? "Stable" : "Prospering";
  const connTier    = networkFactor < 1.0 ? "Remote" : networkFactor < 1.55 ? "Connected" : "Highly connected";

  const growthIcon  = growthTier === "Struggling" ? "🌱" : growthTier === "Moderate" ? "🌿" : "🌳";
  const wealthIcon  = wealthTier === "Eroding"    ? "📉" : wealthTier === "Stable"   ? "⚖️" : "📈";
  const connIcon    = connTier   === "Remote"      ? "🏝️" : connTier  === "Connected" ? "🔗" : "🌐";

  const growthColor = growthTier === "Struggling" ? "var(--danger)" : growthTier === "Moderate" ? "var(--warn)" : "var(--green)";
  const wealthColor = wealthTier === "Eroding"    ? "var(--danger)" : wealthTier === "Stable"   ? "var(--text-dim)" : "var(--green)";
  const connColor   = connTier   === "Remote"      ? "var(--danger)" : connTier  === "Connected" ? "var(--warn)" : "var(--green)";

  // --- Chart data ---
  const popChartData  = popHist.map((v, i)  => ({ turn: i, value: v }));
  const wlthChartData = wlthHist.map((v, i) => ({ turn: i, value: +v.toFixed(4) }));

  const nodeTypeLabel = city.type === "port" ? "Port City"
    : city.type === "harbor"  ? "Harbor"
    : city.type === "town"    ? "Town"
    : city.type === "airport" ? "Airport"
    : "City";

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24, boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ fontSize: 11, padding: "4px 10px" }}>← Map</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-head)" }}>{city.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{nodeTypeLabel}</div>
        </div>
      </div>

      {/* Headline stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard
          label="Population"
          value={qty(city.population)}
          trend={popTrend}
          trendFmt={(d) => `${d >= 0 ? "+" : ""}${Math.round(d).toLocaleString()} / turn`}
        />
        <StatCard
          label="Wealth Index"
          value={city.wealthIndex.toFixed(3)}
          trend={wlthTrend}
          trendFmt={(d) => `${d >= 0 ? "+" : ""}${d.toFixed(4)} / turn`}
        />
        <StatCard
          label="Land Value"
          value={`€${landValue.toLocaleString()}`}
          trend={landTrend}
          trendFmt={() => "placeholder"}
          dim
        />
      </div>

      {/* Character icons */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.05em", marginBottom: 14 }}>
          CITY CHARACTER
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <CharIcon icon={growthIcon} label={growthTier} sublabel="Population growth" color={growthColor} />
          <CharIcon icon={wealthIcon} label={wealthTier} sublabel="Wealth trajectory" color={wealthColor} />
          <CharIcon icon={connIcon}   label={connTier}   sublabel="Connectedness"     color={connColor} />
        </div>
      </div>

      {/* Charts */}
      {popChartData.length > 1 && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.05em", marginBottom: 12 }}>
            POPULATION OVER TIME
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={popChartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="turn" tick={{ fontSize: 10, fill: "var(--text-dim)" }} />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                width={36}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [v.toLocaleString(), "Population"]}
                labelFormatter={(t) => `Turn ${t}`}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {wlthChartData.length > 1 && (
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.05em", marginBottom: 12 }}>
            WEALTH INDEX OVER TIME
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={wlthChartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="turn" tick={{ fontSize: 10, fill: "var(--text-dim)" }} />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                tickFormatter={(v) => v.toFixed(1)}
                width={28}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [v.toFixed(3), "Wealth Index"]}
                labelFormatter={(t) => `Turn ${t}`}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--gold)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {popChartData.length <= 1 && (
        <div style={{ ...cardStyle, color: "var(--text-dim)", fontSize: 12 }}>
          Charts will appear after the first turn ends.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Trend helpers
// ============================================================

type TrendDir = "up" | "down" | "flat";
interface Trend { delta: number; dir: TrendDir }

function trend(history: number[], window: number): Trend {
  if (history.length < 2) return { delta: 0, dir: "flat" };
  const len = history.length;
  const w   = Math.min(window, len - 1);
  const delta = (history[len - 1] - history[len - 1 - w]) / w;
  const dir: TrendDir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { delta, dir };
}

const TREND_ARROW: Record<TrendDir, string> = { up: "↑", down: "↓", flat: "→" };
const TREND_COLOR: Record<TrendDir, string> = {
  up: "var(--green)", down: "var(--danger)", flat: "var(--text-dim)",
};

// ============================================================
// Sub-components
// ============================================================

function StatCard({
  label, value, trend, trendFmt, dim,
}: {
  label: string;
  value: string;
  trend: Trend;
  trendFmt: (delta: number) => string;
  dim?: boolean;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: dim ? "var(--text-dim)" : "var(--text-head)", fontFamily: "monospace", marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: dim ? "var(--text-dim)" : TREND_COLOR[trend.dir] }}>
        {dim ? "— placeholder" : `${TREND_ARROW[trend.dir]} ${trendFmt(trend.delta)}`}
      </div>
    </div>
  );
}

function CharIcon({ icon, label, sublabel, color }: {
  icon: string; label: string; sublabel: string; color: string;
}) {
  return (
    <div style={{
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "12px 8px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{sublabel}</div>
    </div>
  );
}

// ============================================================
// Shared styles
// ============================================================

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "14px 16px",
};

const tooltipStyle: React.CSSProperties = {
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontSize: 11,
  color: "var(--text-head)",
};
