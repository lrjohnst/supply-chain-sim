import { useEffect, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { corporationNetWorth } from "../../engine/utils";
import { checkWinCondition } from "../../engine/winCondition";
import { tick } from "../../engine/tick";
import { computeCorporateBooks } from "../../engine/books";
import { estimateTurnsToBankruptcy } from "../../engine/bankruptcy";
import { GameConfig } from "../../config/gameConfig";

// ================================================================
// DEBUG PANEL — development only
// This file is excluded from production builds via dead-code
// elimination: all usage is behind import.meta.env.DEV guards.
// Toggle: Shift+D
// ================================================================

export interface DebugAction {
  label: string;
  group?: string;
  action: () => void;
}

export interface DebugStat {
  label: string;
  value: string | number | boolean;
  group?: string;
  highlight?: "warn" | "danger" | "good";
}

interface DebugPanelProps {
  extraActions?: DebugAction[];
  extraStats?: DebugStat[];
}

export default function DebugPanel({ extraActions = [], extraStats = [] }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [jumpTurn, setJumpTurn] = useState("");

  const store = useGameStore();
  const { gameState } = store;

  // Shift+D toggles the panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "D") setOpen((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;
  if (!gameState) return <EmptyPanel onClose={() => setOpen(false)} />;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  const aiCorp = Object.values(gameState.corporations).find((c) => !c.isPlayer);

  const playerNW = playerCorp ? corporationNetWorth(gameState, playerCorp.id) : 0;
  const aiNW = aiCorp ? corporationNetWorth(gameState, aiCorp.id) : 0;
  const totalLoans = playerCorp
    ? playerCorp.loanIds.reduce((s, id) => s + (gameState.loans[id]?.outstandingBalance ?? 0), 0)
    : 0;

  const year = 1980 + Math.floor(gameState.turn / 4);
  const quarter = (gameState.turn % 4) + 1;

  const ttb = playerCorp
    ? estimateTurnsToBankruptcy(gameState, playerCorp.id, GameConfig.bankruptcy.lookbackTurns)
    : null;

  // ----------------------------------------------------------------
  // Built-in stats
  // ----------------------------------------------------------------
  const builtInStats: DebugStat[] = [
    { group: "Turn", label: "Turn number", value: gameState.turn },
    { group: "Turn", label: "Year / Quarter", value: `${year} Q${quarter}` },
    { group: "Turn", label: "Phase", value: gameState.phase },
    { group: "Player", label: "Net worth", value: `€${Math.round(playerNW).toLocaleString()}`, highlight: playerNW < 0 ? "danger" : playerNW > 4_000_000 ? "good" : undefined },
    { group: "Player", label: "Cash", value: `€${Math.round(playerCorp?.cash ?? 0).toLocaleString()}`, highlight: (playerCorp?.cash ?? 0) < 0 ? "danger" : undefined },
    { group: "Player", label: "Outstanding loans", value: `€${Math.round(totalLoans).toLocaleString()}`, highlight: totalLoans > 200_000 ? "warn" : undefined },
    { group: "Player", label: "Cumulative revenue", value: `€${Math.round(playerCorp?.cumulativeRevenue ?? 0).toLocaleString()}` },
    { group: "Player", label: "Firms", value: playerCorp?.firmIds.length ?? 0 },
    {
      group: "Player", label: "Turns to bankruptcy",
      value: ttb === null ? "safe" : ttb,
      highlight: ttb !== null && ttb <= GameConfig.bankruptcy.warningThresholdTurns ? "danger" : ttb !== null && ttb <= 20 ? "warn" : undefined,
    },
    { group: "Player", label: "Multi-year contracts", value: playerCorp?.multiYearContractsUnlocked ? "Unlocked" : "Locked" },
    { group: "AI", label: "AI net worth", value: `€${Math.round(aiNW).toLocaleString()}`, highlight: aiNW > 4_000_000 ? "warn" : undefined },
    { group: "AI", label: "AI cash", value: `€${Math.round(aiCorp?.cash ?? 0).toLocaleString()}` },
    { group: "AI", label: "AI firms", value: aiCorp?.firmIds.length ?? 0 },
    { group: "World", label: "recessionTurnsRemaining", value: gameState.recessionTurnsRemaining, highlight: gameState.recessionTurnsRemaining > 0 ? "warn" : undefined },
    { group: "World", label: "barcodeAvailable", value: String(gameState.barcodeAvailable) },
    { group: "World", label: "pendingEvents", value: gameState.pendingEvents.length },
    { group: "World", label: "Active contracts", value: Object.values(gameState.contracts).filter((c) => c.status === "active").length },
    { group: "World", label: "Open tenders", value: Object.values(gameState.tenders).filter((t) => t.status === "open").length },
    { group: "World", label: "Ledger entries", value: gameState.transactions.length },
    { group: "Store", label: "Gate queue depth", value: store.gateQueue.length, highlight: store.gateQueue.length > 0 ? "warn" : undefined },
    { group: "Store", label: "Notifications", value: store.notifications.length },
    { group: "Store", label: "Undismissed", value: store.notifications.filter((n) => !n.dismissed).length },
  ];

  const allStats = [...builtInStats, ...extraStats];

  // ----------------------------------------------------------------
  // Built-in actions
  // ----------------------------------------------------------------
  const builtInActions: DebugAction[] = [
    {
      group: "Cash",
      label: "+€100k cash",
      action: () => {
        if (!playerCorp) return;
        playerCorp.cash += 100_000;
        useGameStore.setState({ gameState: { ...gameState } });
      },
    },
    {
      group: "Cash",
      label: "+€1M cash",
      action: () => {
        if (!playerCorp) return;
        playerCorp.cash += 1_000_000;
        useGameStore.setState({ gameState: { ...gameState } });
      },
    },
    {
      group: "Conditions",
      label: "Trigger win check",
      action: () => {
        const result = checkWinCondition(gameState);
        alert(`Win check: gameOver=${result.gameOver}, isWin=${result.isWin}, reason=${result.reason ?? "none"}, netWorth=€${Math.round(result.netWorth).toLocaleString()}`);
      },
    },
    {
      group: "Conditions",
      label: "Force win threshold",
      action: () => {
        if (!playerCorp) return;
        // Add enough cash to cross threshold
        playerCorp.cash += 5_000_000;
        useGameStore.setState({ gameState: { ...gameState } });
      },
    },
    {
      group: "Conditions",
      label: "Trigger recession",
      action: () => {
        gameState.recessionTurnsRemaining = 4;
        useGameStore.setState({ gameState: { ...gameState } });
      },
    },
    {
      group: "Conditions",
      label: "Toggle barcode",
      action: () => {
        gameState.barcodeAvailable = !gameState.barcodeAvailable;
        useGameStore.setState({ gameState: { ...gameState } });
      },
    },
    {
      group: "Conditions",
      label: "Fire random macro event",
      action: () => {
        // Generate one random event and fire it immediately
        const types = ["interest_rate_change", "recession", "commodity_price_shock"] as const;
        const type = types[Math.floor(Math.random() * types.length)];
        const delta = type === "interest_rate_change" ? (Math.random() > 0.5 ? 0.02 : -0.01) : 0;
        const event = {
          id: `debug-${Date.now()}`,
          type,
          turn: gameState.turn,
          description: `[DEBUG] ${type} fired manually`,
          payload: type === "interest_rate_change"
            ? { delta }
            : type === "commodity_price_shock"
            ? { productId: "bauxite", multiplier: 0.85 + Math.random() * 0.35 }
            : {},
          acknowledged: false,
        };
        gameState.pendingEvents.push(event);
        useGameStore.setState({ gameState: { ...gameState } });
      },
    },
    {
      group: "Turn",
      label: "Advance turn (no tick)",
      action: () => {
        gameState.turn += 1;
        useGameStore.setState({ gameState: { ...gameState } });
      },
    },
    {
      group: "Turn",
      label: "Tick (normal end turn)",
      action: () => {
        store.endTurn();
      },
    },
    {
      group: "Turn",
      label: "Fast-forward 4 turns",
      action: () => {
        for (let i = 0; i < 4; i++) {
          if (gameState.phase === "lost") break;
          const result = tick(gameState);
          if (result.isLoss) { gameState.phase = "lost"; break; }
        }
        const pcId = Object.values(gameState.corporations).find((c) => c.isPlayer)!.id;
        const books = computeCorporateBooks(gameState, pcId, gameState.turn - 1);
        useGameStore.setState({ gameState: { ...gameState }, lastBooks: books });
      },
    },
    {
      group: "Gate / Notifications",
      label: "Clear gate queue",
      action: () => useGameStore.setState({ gateQueue: [] }),
    },
    {
      group: "Gate / Notifications",
      label: "Clear notifications",
      action: () => useGameStore.setState({ notifications: [] }),
    },
  ];

  const allActions = [...builtInActions, ...extraActions];
  const groups = [...new Set(allActions.map((a) => a.group ?? "Other"))];
  const statGroups = [...new Set(allStats.map((s) => s.group ?? "Other"))];

  return (
    <div style={{
      position: "fixed",
      top: 42,
      right: 0,
      width: 320,
      height: "calc(100vh - 42px)",
      background: "#0a0d14",
      border: "1px solid #ff4444",
      borderTop: "none",
      zIndex: 999,
      display: "flex",
      flexDirection: "column",
      fontFamily: "ui-monospace, Consolas, monospace",
      fontSize: 11,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "#ff4444",
        color: "#fff",
        padding: "4px 10px",
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: "0.1em",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <span>⚙ DEBUG — DEVELOPMENT ONLY</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, padding: "0 4px" }}
        >
          ✕
        </button>
      </div>

      <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>

        {/* State values */}
        {statGroups.map((group) => (
          <div key={group} style={{ marginBottom: 8 }}>
            <div style={{ padding: "2px 10px", color: "#ff6666", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
              {group.toUpperCase()}
            </div>
            {allStats.filter((s) => (s.group ?? "Other") === group).map((stat) => (
              <div key={stat.label} style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "2px 10px",
                borderBottom: "1px solid #1a1f2e",
              }}>
                <span style={{ color: "#8899aa" }}>{stat.label}</span>
                <span style={{
                  color: stat.highlight === "danger" ? "#ff4444"
                    : stat.highlight === "warn" ? "#ffaa00"
                    : stat.highlight === "good" ? "#44ff88"
                    : "#ccddee",
                  fontWeight: 600,
                }}>
                  {String(stat.value)}
                </span>
              </div>
            ))}
          </div>
        ))}

        <div style={{ borderTop: "1px solid #ff4444", margin: "8px 0" }} />

        {/* Jump to turn */}
        <div style={{ padding: "4px 10px 8px" }}>
          <div style={{ color: "#ff6666", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", marginBottom: 4 }}>
            JUMP TO TURN
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              value={jumpTurn}
              onChange={(e) => setJumpTurn(e.target.value)}
              placeholder="Turn number"
              style={{
                flex: 1, background: "#0f1520", border: "1px solid #2a3347",
                color: "#ccd", padding: "3px 6px", borderRadius: 3, fontSize: 11,
              }}
            />
            <button
              onClick={() => {
                const t = parseInt(jumpTurn);
                if (isNaN(t) || t < 0 || t > 999) return;
                gameState.turn = t;
                useGameStore.setState({ gameState: { ...gameState } });
                setJumpTurn("");
              }}
              style={{
                background: "#1a2535", border: "1px solid #2a3347", color: "#ccd",
                padding: "3px 10px", borderRadius: 3, cursor: "pointer", fontSize: 11,
              }}
            >
              Go
            </button>
          </div>
        </div>

        {/* Action buttons */}
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: 8 }}>
            <div style={{ padding: "2px 10px", color: "#ff6666", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
              {group.toUpperCase()}
            </div>
            <div style={{ padding: "2px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
              {allActions.filter((a) => (a.group ?? "Other") === group).map((action) => (
                <button
                  key={action.label}
                  onClick={action.action}
                  style={{
                    background: "#1a2535",
                    border: "1px solid #2a3347",
                    color: "#aabbcc",
                    padding: "4px 8px",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontSize: 11,
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#ff4444")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a3347")}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "4px 10px",
        borderTop: "1px solid #ff4444",
        color: "#556677",
        fontSize: 10,
        flexShrink: 0,
      }}>
        Shift+D to toggle · not in production
      </div>
    </div>
  );
}

function EmptyPanel({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", top: 42, right: 0, width: 320,
      background: "#0a0d14", border: "1px solid #ff4444", borderTop: "none",
      zIndex: 999, padding: 12, fontFamily: "monospace", fontSize: 11,
    }}>
      <div style={{ color: "#ff4444", fontWeight: 700, marginBottom: 8 }}>
        ⚙ DEBUG — No active game
      </div>
      <button onClick={onClose} style={{ color: "#8899aa", background: "transparent", border: "none", cursor: "pointer" }}>
        Close (Shift+D)
      </button>
    </div>
  );
}
