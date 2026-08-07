import { useEffect, useRef } from "react";
import { useGameStore, type Screen } from "./store/gameStore";
import { corporationNetWorth } from "./engine/utils";
import NodeMap from "./components/map/NodeMap";
import RightPanel from "./components/panels/RightPanel";
import BottomBar from "./components/panels/BottomBar";
import TenderBoard from "./components/screens/TenderBoard";
import ContractsScreen from "./components/screens/ContractsScreen";
import BooksScreen from "./components/screens/BooksScreen";
import FinanceScreen from "./components/screens/FinanceScreen";
import ProductsScreen from "./components/screens/ProductsScreen";
import SettingsScreen from "./components/screens/SettingsScreen";
import StoreFirmOverview from "./components/screens/StoreFirmOverview";
import CityScreen from "./components/screens/CityScreen";
import StartScreen from "./components/screens/StartScreen";
import GatePrompt from "./components/notifications/GatePrompt";
import { NotificationBell, NotificationPanel } from "./components/notifications/NotificationPanel";
import DebugPanel from "./components/debug/DebugPanel";
import { startMusic, stopMusic, updateParams } from "./audio/musicEngine";
import { loadMusicSettings } from "./audio/musicSettings";

export default function App() {
  const { gameState, activeScreen, setScreen, startNewGame, showWinScreen,
    selectedStoreFirmId, closeStoreFirm,
    selectedCityScreenId, closeCityScreen } = useGameStore();
  // Singleton guard — prevents double-init in React strict mode
  const musicStarted = useRef(false);

  // Music: start once on app load, keep playing everywhere. Settings toggle is the control.
  useEffect(() => {
    if (!musicStarted.current) {
      const saved = loadMusicSettings();
      updateParams(saved);
      startMusic();
      musicStarted.current = true;
    }
  }, []);

  if (!gameState) {
    return <StartScreen onStart={startNewGame} />;
  }

  if (gameState.phase === "lost") {
    return <LossScreen />;
  }

  if (gameState.phase === "won" && showWinScreen) {
    return <WinScreen />;
  }

  // phase "won" or "playing" — both render the playing UI
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Debug panel — dev only, Shift+D */}
      {import.meta.env.DEV && <DebugPanel />}

      {/* Gate prompt — modal, intercepts End Turn */}
      <GatePrompt />

      {/* Notification panel — non-blocking side panel */}
      <NotificationPanel />

      {/* Top nav */}
      <div style={{
        height: 42,
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 4,
        flexShrink: 0,
        zIndex: 10,
      }}>
        <span style={{ color: "var(--gold)", fontWeight: 700, fontSize: 13, marginRight: 16, letterSpacing: "0.05em" }}>
          SUPPLY CHAIN SIM
        </span>
        {gameState.phase === "won" && (
          <span style={{ color: "var(--gold)", fontSize: 11, marginRight: 8 }}>🏆 Won</span>
        )}
        {(["map", "tenders", "contracts", "books", "finance", "products", "settings"] as const).map((s) => (
          <NavTab key={s} label={NAV_LABELS[s]} active={activeScreen === s} onClick={() => setScreen(s as Screen)} />
        ))}
        <div style={{ marginLeft: "auto" }}>
          <NotificationBell />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {activeScreen === "map" && selectedStoreFirmId ? (
          <StoreFirmOverview firmId={selectedStoreFirmId} onBack={closeStoreFirm} />
        ) : activeScreen === "map" && selectedCityScreenId ? (
          <>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <CityScreen cityId={selectedCityScreenId} onBack={closeCityScreen} />
            </div>
            <div style={{ width: 280, borderLeft: "1px solid var(--border)", flexShrink: 0, overflow: "hidden" }}>
              <RightPanel />
            </div>
          </>
        ) : activeScreen === "map" ? (
          <>
            <div style={{ flex: 1, overflow: "hidden" }}><NodeMap /></div>
            <div style={{ width: 280, borderLeft: "1px solid var(--border)", flexShrink: 0, overflow: "hidden" }}>
              <RightPanel />
            </div>
          </>
        ) : null}
        {activeScreen === "tenders" && <TenderBoard />}
        {activeScreen === "contracts" && <ContractsScreen />}
        {activeScreen === "books" && <BooksScreen />}
        {activeScreen === "finance" && <FinanceScreen />}
        {activeScreen === "products" && <ProductsScreen />}
        {activeScreen === "settings" && <SettingsScreen />}
      </div>

      <BottomBar />
    </div>
  );
}

function NavTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: "none",
      borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
      borderRadius: 0,
      color: active ? "var(--text-head)" : "var(--text-dim)",
      padding: "0 12px", height: 42, fontSize: 12,
      fontWeight: active ? 600 : 400,
    }}>
      {label}
    </button>
  );
}

const NAV_LABELS: Record<string, string> = {
  map: "Map", tenders: "Tenders", contracts: "Contracts", books: "Books", finance: "Finance", products: "Products", settings: "⚙",
};

// ============================================================
// Win screen
// ============================================================

function WinScreen() {
  const { gameState, endGame, dismissWinScreen } = useGameStore();
  if (!gameState) return null;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  const netWorth = Math.round(corporationNetWorth(gameState, playerCorp.id));
  const turn = gameState.turn;
  const year = 1980 + Math.floor(turn / 4);
  const quarter = (turn % 4) + 1;
  const firmCount = playerCorp.firmIds.length;
  const contractsCompleted = Object.values(gameState.contracts).filter(
    (c) => c.status === "completed" &&
      (c.sellerParty.corporationId === playerCorp.id || c.buyerParty.corporationId === playerCorp.id)
  ).length;

  // Peak revenue turn from the transaction ledger (covers the rolling window)
  const revenueByTurn = new Map<number, number>();
  for (const tx of gameState.transactions) {
    if (tx.corporationId === playerCorp.id && tx.category === "revenue") {
      revenueByTurn.set(tx.turn, (revenueByTurn.get(tx.turn) ?? 0) + tx.total);
    }
  }
  let peakRevenueTurn: number | null = null;
  let peakRevenue = 0;
  for (const [t, rev] of revenueByTurn) {
    if (rev > peakRevenue) { peakRevenue = rev; peakRevenueTurn = t; }
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    marginBottom: 6,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--bg)" }}>
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, width: 440 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ color: "var(--gold)", fontWeight: 700, fontSize: 28, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 6 }}>
            VICTORY
          </div>
          <div style={{ color: "var(--text-head)", fontSize: 15, fontWeight: 600 }}>
            {playerCorp.name}
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
            {year} Q{quarter} · Turn {turn}
          </div>
        </div>

        {/* Net worth highlight */}
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--gold)",
          borderRadius: 8,
          padding: "14px 20px",
          textAlign: "center",
          marginBottom: 20,
        }}>
          <div style={{ color: "var(--text-dim)", fontSize: 11, letterSpacing: "0.05em", marginBottom: 4 }}>FINAL NET WORTH</div>
          <div style={{ color: "var(--gold)", fontWeight: 700, fontSize: 26, fontFamily: "monospace" }}>
            €{netWorth.toLocaleString()}
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ marginBottom: 24 }}>
          <div style={cardStyle}>
            <span style={{ color: "var(--text-dim)" }}>Turns played</span>
            <span style={{ color: "var(--text-head)", fontWeight: 600 }}>{turn}</span>
          </div>
          <div style={cardStyle}>
            <span style={{ color: "var(--text-dim)" }}>Firms at game end</span>
            <span style={{ color: "var(--text-head)", fontWeight: 600 }}>{firmCount}</span>
          </div>
          <div style={cardStyle}>
            <span style={{ color: "var(--text-dim)" }}>Contracts completed</span>
            <span style={{ color: "var(--text-head)", fontWeight: 600 }}>{contractsCompleted}</span>
          </div>
          {peakRevenueTurn !== null && (
            <div style={cardStyle}>
              <span style={{ color: "var(--text-dim)" }}>Peak revenue turn</span>
              <span style={{ color: "var(--text-head)", fontWeight: 600 }}>
                Turn {peakRevenueTurn} — €{Math.round(peakRevenue).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ flex: 1, padding: "10px 0" }} onClick={endGame}>
            Play Again
          </button>
          <button className="primary" style={{ flex: 1, padding: "10px 0" }} onClick={dismissWinScreen}>
            Keep Playing
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Loss screen
// ============================================================

function LossScreen() {
  const { gameState, endGame, lastTickResult } = useGameStore();

  const lossReason = lastTickResult?.lossReason ?? null;
  const br = lastTickResult?.bankruptcyReason;
  const isAIWin = lossReason === "lost_ai_won";
  const isBankruptcy = lossReason === "lost_bankruptcy";
  const isTimeLimit = !isAIWin && !isBankruptcy;

  const playerCorp = gameState ? Object.values(gameState.corporations).find((c) => c.isPlayer) : null;
  const turn = gameState?.turn ?? 0;
  const year = 1980 + Math.floor(turn / 4);
  const quarter = (turn % 4) + 1;

  const heading = isBankruptcy ? "BANKRUPT" : isAIWin ? "DEFEATED" : "TIME'S UP";
  const subtext = isBankruptcy
    ? "Your corporation could not meet a financial obligation."
    : isAIWin
    ? "Your rival reached the net worth target first."
    : `200 turns elapsed without reaching the €5M net worth target.`;

  const cardStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    padding: "4px 0",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--bg)" }}>
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, width: 440 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ color: "var(--danger)", fontWeight: 700, fontSize: 28, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 6 }}>
            {heading}
          </div>
          {playerCorp && (
            <div style={{ color: "var(--text-head)", fontSize: 14, fontWeight: 600 }}>{playerCorp.name}</div>
          )}
          <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
            {year} Q{quarter} · Turn {turn}
          </div>
        </div>

        {/* Reason */}
        <div style={{ color: "var(--text)", fontSize: 13, textAlign: "center", marginBottom: 20 }}>
          {subtext}
        </div>

        {/* Bankruptcy detail */}
        {isBankruptcy && br && (
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "12px 16px",
            marginBottom: 20,
          }}>
            <div style={{ color: "var(--text-dim)", fontSize: 11, letterSpacing: "0.05em", marginBottom: 8 }}>FAILED OBLIGATION</div>
            <div style={{ color: "var(--text-head)", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{br.obligation}</div>
            <div style={cardStyle}>
              <span style={{ color: "var(--text-dim)" }}>Amount due</span>
              <span style={{ color: "var(--danger)" }}>€{Math.round(br.amount).toLocaleString()}</span>
            </div>
            <div style={cardStyle}>
              <span style={{ color: "var(--text-dim)" }}>Cash available</span>
              <span style={{ color: "var(--warn)" }}>€{Math.round(br.cashAvailable).toLocaleString()}</span>
            </div>
            <div style={{ ...cardStyle, borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
              <span style={{ color: "var(--text-dim)" }}>Shortfall</span>
              <span style={{ color: "var(--danger)", fontWeight: 700 }}>€{Math.round(br.shortfall).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Time limit detail */}
        {isTimeLimit && (
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "12px 16px",
            marginBottom: 20,
            textAlign: "center",
          }}>
            <div style={{ color: "var(--text-dim)", fontSize: 11, letterSpacing: "0.05em", marginBottom: 4 }}>TURN REACHED</div>
            <div style={{ color: "var(--text-head)", fontWeight: 700, fontSize: 22, fontFamily: "monospace" }}>{turn}</div>
          </div>
        )}

        <button className="primary" style={{ width: "100%", padding: "10px 0", fontSize: 14 }} onClick={endGame}>
          Try Again
        </button>
      </div>
    </div>
  );
}
