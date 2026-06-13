import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { corporationNetWorth } from "../../engine/utils";
import { checkWinCondition } from "../../engine/winCondition";
import { tick } from "../../engine/tick";
import { computeCorporateBooks } from "../../engine/books";
import { estimateTurnsToBankruptcy } from "../../engine/bankruptcy";
import { GameConfig } from "../../config/gameConfig";
import { getHarborSoldProducts, getBasePrice } from "../../engine/harbor";
import { displayName } from "../../engine/products";
import { generateId } from "../../engine/utils";

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
    { group: "World", label: "recessionSeverity", value: gameState.recessionTurnsRemaining > 0 ? gameState.recessionSeverity.toFixed(3) : "—", highlight: gameState.recessionTurnsRemaining > 0 ? "warn" : undefined },
    { group: "World", label: "recessionCooldown", value: gameState.recessionCooldownRemaining },
    { group: "World", label: "activeShocks", value: gameState.activeHarborShocks.length, highlight: gameState.activeHarborShocks.length > 0 ? "warn" : undefined },
    { group: "World", label: "barcodeAvailable", value: String(gameState.barcodeAvailable) },
    { group: "World", label: "pendingEvents", value: gameState.pendingEvents.length },
    { group: "World", label: "Active contracts", value: Object.values(gameState.contracts).filter((c) => c.status === "active").length },
    { group: "World", label: "Open tenders", value: Object.values(gameState.tenders).filter((t) => t.status === "open").length },
    { group: "World", label: "Ledger entries", value: gameState.transactions.length },
    ...Object.values(gameState.cityNodes)
      .filter((c) => c.type !== "harbor")
      .map((c) => {
        const firmsHere = Object.values(gameState.firms).filter((f) => f.cityNodeId === c.id).length;
        return {
          group: "Cities",
          label: c.name,
          value: `pop ${(c.population / 1000).toFixed(0)}k | wealth ${c.wealthIndex.toFixed(3)} | demand×${c.demandModifier.toFixed(2)} | firms ${firmsHere}`,
        };
      }),
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
        gameState.recessionSeverity = 0.75;
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
      group: "Tenders",
      label: "Spawn alumina tender (2 turns)",
      action: () => {
        const closeTurn = gameState.turn + 2;
        const id = generateId();
        gameState.tenders[id] = {
          id,
          direction: "market",
          publishedByCorporationId: null,
          publishedByFirmId: null,
          product: "alumina",
          volumeRequired: 500,
          targetUnitPrice: 92,
          minQuality: GameConfig.tenderEvents.minQuality,
          durationTurns: 2,
          openTurn: gameState.turn,
          closeTurn,
          status: "open",
          bids: [],
          awardedBids: [],
          contractDurationTurns: GameConfig.tenders.contractDurationTurns,
          renewalGapTurns: GameConfig.tenders.renewalGapTurns,
          cycleNumber: 1,
          previousTenderId: null,
          qualityDriftPerCycle: GameConfig.tenders.qualityDriftPerCycle,
          volumeGrowthFactor: 1.0,
          incumbentCorporationId: null,
          incumbentNoticeGiven: false,
        };
        useGameStore.setState({ gameState: { ...gameState } });
      },
    },
    {
      group: "Tenders",
      label: "Spawn aluminium tender (2 turns)",
      action: () => {
        const closeTurn = gameState.turn + 2;
        const id = generateId();
        gameState.tenders[id] = {
          id,
          direction: "market",
          publishedByCorporationId: null,
          publishedByFirmId: null,
          product: "aluminium",
          volumeRequired: 300,
          targetUnitPrice: 195,
          minQuality: GameConfig.tenderEvents.minQuality,
          durationTurns: 2,
          openTurn: gameState.turn,
          closeTurn,
          status: "open",
          bids: [],
          awardedBids: [],
          contractDurationTurns: GameConfig.tenders.contractDurationTurns,
          renewalGapTurns: GameConfig.tenders.renewalGapTurns,
          cycleNumber: 1,
          previousTenderId: null,
          qualityDriftPerCycle: GameConfig.tenders.qualityDriftPerCycle,
          volumeGrowthFactor: 1.0,
          incumbentCorporationId: null,
          incumbentNoticeGiven: false,
        };
        useGameStore.setState({ gameState: { ...gameState } });
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

        {/* ── Active tender contracts ── */}
        <TenderContractsSection state={gameState} />

        {/* ── Pending renewals ── */}
        <PendingRenewalsSection state={gameState} />

        {/* ── Music ── */}
        <MusicDebugSection />

        {/* ── Harbor prices ── */}
        <HarborPricesSection state={gameState} />

        {/* ── Economic history sparklines ── */}
        <HistorySection state={gameState} />

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

// ================================================================
// Active tender contracts section
// ================================================================

function TenderContractsSection({ state }: { state: import("../../types").GameState }) {
  const active = Object.values(state.contracts).filter(
    (c) => c.originType === "tender" && c.status === "active"
  );
  if (active.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: "2px 10px", color: "#ff6666", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
        ACTIVE TENDER CONTRACTS ({active.length})
      </div>
      {active.map((c) => {
        const turnsRemaining = c.startTurn + c.durationTurns - state.turn;
        return (
          <div key={c.id} style={{ padding: "2px 10px", borderBottom: "1px solid #1a1f2e", fontSize: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#8899aa" }}>{displayName(c.product as import("../../types").ProductId)}</span>
              <span style={{ color: "#ccddee" }}>{Math.round(c.volumePerTurn)}u/t @ €{c.unitPrice.toFixed(2)}</span>
            </div>
            <div style={{ color: "#445566" }}>
              {turnsRemaining}t remaining · origin tender {c.originId?.slice(-6)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ================================================================
// Pending renewals section
// ================================================================

function PendingRenewalsSection({ state }: { state: import("../../types").GameState }) {
  if (state.pendingTenderRenewals.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: "2px 10px", color: "#ff6666", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
        PENDING RENEWALS ({state.pendingTenderRenewals.length})
      </div>
      {state.pendingTenderRenewals.map((r, i) => {
        const corp = r.incumbentCorporationId
          ? state.corporations[r.incumbentCorporationId]?.name ?? r.incumbentCorporationId.slice(-6)
          : "none";
        return (
          <div key={i} style={{ padding: "2px 10px", borderBottom: "1px solid #1a1f2e", fontSize: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#8899aa" }}>{displayName(r.productId as import("../../types").ProductId)}</span>
              <span style={{ color: "#ccddee" }}>turn {r.scheduledForTurn}</span>
            </div>
            <div style={{ color: "#445566" }}>incumbent: {corp}</div>
          </div>
        );
      })}
    </div>
  );
}

// ================================================================
// Harbor prices section
// ================================================================

function HarborPricesSection({ state }: { state: import("../../types").GameState }) {
  const products = getHarborSoldProducts();
  const last = state.economicHistory[state.economicHistory.length - 1];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: "2px 10px", color: "#ff6666", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
        HARBOR PRICES
      </div>
      {products.map((p) => {
        const base = getBasePrice(p);
        const current = (state.harborNode.prices as Record<string, number>)[p] ?? base;
        const shock = state.activeHarborShocks.find((s) => s.productId === p);
        const noise = last?.harborNoiseTerm[p];
        const disp = last?.harborShockDisplacements[p];
        return (
          <div key={p} style={{ padding: "2px 10px", borderBottom: "1px solid #1a1f2e" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#8899aa" }}>{displayName(p)}</span>
              <span style={{ color: current > base * 1.05 ? "#ffaa00" : current < base * 0.95 ? "#ff8844" : "#ccddee", fontWeight: 600 }}>
                €{current.toFixed(2)}
              </span>
            </div>
            <div style={{ color: "#445566", fontSize: 10, display: "flex", gap: 8 }}>
              <span>base €{base.toFixed(2)}</span>
              {disp !== undefined && disp !== 0 && (
                <span style={{ color: disp > 0 ? "#ffaa00" : "#ff8844" }}>
                  shock {disp > 0 ? "+" : ""}{disp.toFixed(2)}
                </span>
              )}
              {noise !== undefined && (
                <span style={{ color: "#334455" }}>
                  noise {noise > 0 ? "+" : ""}{noise.toFixed(3)}
                </span>
              )}
              {shock && (
                <span style={{ color: "#556677" }}>
                  t{shock.turnsElapsed}/{shock.normalizationDuration}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {/* Active shocks detail */}
      {state.activeHarborShocks.length > 0 && (
        <div style={{ padding: "2px 10px", color: "#556677", fontSize: 10 }}>
          {state.activeHarborShocks.map((s) => {
            const k = GameConfig.commodityShockEvents.kSteepness;
            const mid = s.normalizationDuration / 2;
            const progress = 1 / (1 + Math.exp(-k * (s.turnsElapsed - mid)));
            return (
              <div key={s.id}>
                {displayName(s.productId)} · shocked €{s.shockedPrice.toFixed(2)} ·{" "}
                progress {(progress * 100).toFixed(0)}% · {s.turnsElapsed}/{s.normalizationDuration}t
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ================================================================
// Economic history section (sparklines as text lists)
// ================================================================

function HistorySection({ state }: { state: import("../../types").GameState }) {
  const history = state.economicHistory.slice(-20);
  if (history.length === 0) return null;

  const products = getHarborSoldProducts();

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: "2px 10px", color: "#ff6666", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
        HISTORY (last {history.length} turns)
      </div>

      {/* Harbor price history per product */}
      <div style={{ padding: "2px 10px", color: "#556677", fontSize: 9 }}>
        <div style={{ color: "#667788", marginBottom: 2 }}>Harbor prices:</div>
        {products.map((p) => {
          const vals = history.map((h) => h.harborPrices[p] ?? 0);
          return (
            <div key={p} style={{ marginBottom: 1 }}>
              <span style={{ color: "#445566" }}>{displayName(p).slice(0, 14).padEnd(14)}</span>{" "}
              <span style={{ color: "#334455", fontFamily: "monospace" }}>
                {vals.map((v) => v.toFixed(1)).join(" ")}
              </span>
            </div>
          );
        })}
      </div>

      {/* Demand history per store per product */}
      {Object.entries(state.firms)
        .filter(([, f]) => f.type === "store")
        .map(([firmId, firm]) => {
          const demandProducts = history
            .flatMap((h) => Object.keys(h.effectiveDemand[firmId] ?? {}))
            .filter((v, i, a) => a.indexOf(v) === i) as import("../../types").ProductId[];
          if (demandProducts.length === 0) return null;
          return (
            <div key={firmId} style={{ padding: "2px 10px", color: "#556677", fontSize: 9 }}>
              <div style={{ color: "#667788", marginBottom: 2 }}>{firm.name} demand:</div>
              {demandProducts.map((p) => {
                const vals = history.map((h) => h.effectiveDemand[firmId]?.[p] ?? 0);
                return (
                  <div key={p} style={{ marginBottom: 1 }}>
                    <span style={{ color: "#445566" }}>{displayName(p as import("../../types").ProductId).slice(0, 14).padEnd(14)}</span>{" "}
                    <span style={{ color: "#334455", fontFamily: "monospace" }}>
                      {vals.map((v) => String(v).padStart(4)).join(" ")}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}

      {/* Net worth history */}
      <div style={{ padding: "2px 10px", color: "#556677", fontSize: 9 }}>
        <div style={{ color: "#667788", marginBottom: 2 }}>Net worth (k€):</div>
        <div>
          <span style={{ color: "#445566" }}>{"Player        "}</span>{" "}
          <span style={{ color: "#334455", fontFamily: "monospace" }}>
            {history.map((h) => Math.round(h.playerNetWorth / 1000).toString().padStart(5)).join(" ")}
          </span>
        </div>
        <div>
          <span style={{ color: "#445566" }}>{"AI            "}</span>{" "}
          <span style={{ color: "#334455", fontFamily: "monospace" }}>
            {history.map((h) => Math.round(h.aiNetWorth / 1000).toString().padStart(5)).join(" ")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Music debug section
// ================================================================
import {
  isPlaying as musicIsPlaying, startMusic, stopMusic, getParams,
  getCurrentChaosIntensity, currentChaosLevel,
} from "../../audio/musicEngine";
import { loadMusicSettings } from "../../audio/musicSettings";

function MusicDebugSection() {
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function loop() { setTick((t) => t + 1); rafRef.current = requestAnimationFrame(loop); }
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  const playing = musicIsPlaying();
  const p = getParams();
  const intensity = getCurrentChaosIntensity();

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: "2px 10px", color: "#e8c84a", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
        MUSIC
      </div>
      <div style={{ padding: "2px 10px", fontSize: 10, color: "#8899aa", display: "flex", flexDirection: "column", gap: 2 }}>
        <div>isPlaying: <span style={{ color: playing ? "#4ae8a0" : "#ff6666" }}>{String(playing)}</span></div>
        <div>chaosX: <span style={{ color: "#ccddee" }}>{currentChaosLevel.toFixed(4)}</span></div>
        <div>chaos intensity: <span style={{ color: "#ccddee" }}>{Math.round(intensity * 100)}%</span></div>
        <div>BPM: <span style={{ color: "#ccddee" }}>{p.bpm}</span></div>
        <div>enabled: <span style={{ color: p.enabled ? "#4ae8a0" : "#ff6666" }}>{String(p.enabled)}</span></div>
        <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
          <button style={{ fontSize: 9, padding: "2px 6px" }} onClick={() => {
            stopMusic();
            const saved = loadMusicSettings();
            startMusic();
            setTick((t) => t + 1);
            void saved;
          }}>
            Restart Music
          </button>
          <button style={{ fontSize: 9, padding: "2px 6px" }} onClick={() => { stopMusic(); setTick((t) => t + 1); }}>
            Stop
          </button>
        </div>
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
