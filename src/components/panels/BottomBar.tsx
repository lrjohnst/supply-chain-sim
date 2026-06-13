import { useGameStore, selectPlayerCorp, selectTurnLabel } from "../../store/gameStore";
import { euros, turnLabel } from "../shared/fmt";
import { corporationNetWorth } from "../../engine/utils";
import { estimateTurnsToBankruptcy } from "../../engine/bankruptcy";
import { GameConfig } from "../../config/gameConfig";

export default function BottomBar() {
  const gameState = useGameStore((s) => s.gameState);
  const playerCorp = useGameStore(selectPlayerCorp);
  const currentTurnLabel = useGameStore(selectTurnLabel);
  const lastTickResult = useGameStore((s) => s.lastTickResult);
  const endTurn = useGameStore((s) => s.endTurn);
  const lastBooks = useGameStore((s) => s.lastBooks);

  if (!gameState || !playerCorp) return null;

  const netWorth = corporationNetWorth(gameState, playerCorp.id);
  const ttb = estimateTurnsToBankruptcy(gameState, playerCorp.id, GameConfig.bankruptcy.lookbackTurns);
  const showBurnWarning = ttb !== null && ttb <= GameConfig.bankruptcy.warningThresholdTurns;

  const totalDebt = playerCorp.loanIds.reduce(
    (sum, id) => sum + gameState.loans[id].outstandingBalance,
    0
  );
  const winThreshold = GameConfig.game.netWorthWinThreshold;
  const progress = Math.min(1, netWorth / winThreshold);

  const firedEvents = lastTickResult?.firedEvents ?? [];
  const latestEvent = firedEvents[firedEvents.length - 1];

  return (
    <div style={{
      height: 52,
      background: "var(--bg-panel)",
      borderTop: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: 24,
      flexShrink: 0,
    }}>
      {/* Turn */}
      <div>
        <span style={{ color: "var(--text-dim)", fontSize: 11 }}>TURN</span>
        <div style={{ color: "var(--text-head)", fontWeight: 700, fontSize: 14 }}>{currentTurnLabel}</div>
      </div>

      <div style={{ width: 1, height: 32, background: "var(--border)" }} />

      {/* Cash */}
      <div>
        <span style={{ color: "var(--text-dim)", fontSize: 11 }}>CASH</span>
        <div style={{ color: "var(--green)", fontWeight: 600, fontSize: 13 }}>
          {euros(playerCorp.cash)}
        </div>
      </div>

      {/* Debt */}
      {totalDebt > 0 && (
        <div>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>DEBT</span>
          <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: 13 }}>
            {euros(totalDebt)}
          </div>
        </div>
      )}

      {/* Net worth + progress */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>NET WORTH</span>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
            {euros(netWorth)} / {euros(winThreshold)}
          </span>
        </div>
        <div style={{
          height: 4, background: "var(--bg-card)", borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: progress > 0.75 ? "var(--gold)" : "var(--accent)",
            borderRadius: 2,
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Last event */}
      {latestEvent && (
        <div style={{
          maxWidth: 300,
          fontSize: 11,
          color: "var(--warn)",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}>
          ⚡ {latestEvent.description}
        </div>
      )}

      <div style={{ width: 1, height: 32, background: "var(--border)" }} />

      {/* P&L this turn */}
      {lastBooks && (
        <div>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>P&L — {turnLabel(lastBooks.turn)}</span>
          <div style={{
            fontWeight: 600, fontSize: 13,
            color: lastBooks.netProfit >= 0 ? "var(--green)" : "var(--danger)",
          }}>
            {lastBooks.netProfit >= 0 ? "+" : ""}{euros(lastBooks.netProfit)}
          </div>
        </div>
      )}

      {/* Live burn-rate warning — always current, never stale */}
      {showBurnWarning && (
        <div style={{
          marginLeft: "auto",
          fontSize: 12,
          fontWeight: 600,
          color: ttb! <= 3 ? "var(--danger)" : "var(--warn)",
          whiteSpace: "nowrap",
        }}>
          ⚠ ~{ttb} turn{ttb === 1 ? "" : "s"} to insolvency
        </div>
      )}

      <button
        className="primary"
        style={{ marginLeft: showBurnWarning ? 16 : "auto", padding: "8px 20px", fontSize: 13 }}
        disabled={gameState.phase === "lost"}
        onClick={endTurn}
      >
        End Turn →
      </button>
    </div>
  );
}
