import { useState } from "react";
import { useGameStore, type Screen } from "./store/gameStore";
import NodeMap from "./components/map/NodeMap";
import RightPanel from "./components/panels/RightPanel";
import BottomBar from "./components/panels/BottomBar";
import TenderBoard from "./components/screens/TenderBoard";
import BooksScreen from "./components/screens/BooksScreen";
import FinanceScreen from "./components/screens/FinanceScreen";
import ProductsScreen from "./components/screens/ProductsScreen";
import GatePrompt from "./components/notifications/GatePrompt";
import { NotificationBell, NotificationPanel } from "./components/notifications/NotificationPanel";
import DebugPanel from "./components/debug/DebugPanel";

export default function App() {
  const { gameState, activeScreen, setScreen, startNewGame } = useGameStore();
  const [playerName, setPlayerName] = useState("");

  if (!gameState) {
    return <StartScreen playerName={playerName} setPlayerName={setPlayerName} onStart={startNewGame} />;
  }

  if (gameState.phase === "lost") {
    return <LossScreen />;
  }

  // phase "won" or "playing" — both render the playing UI
  // The gate handles win acknowledgement; the player can keep playing after winning.
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
        {(["map", "tenders", "books", "finance", "products"] as const).map((s) => (
          <NavTab key={s} label={NAV_LABELS[s]} active={activeScreen === s} onClick={() => setScreen(s as Screen)} />
        ))}
        <div style={{ marginLeft: "auto" }}>
          <NotificationBell />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {activeScreen === "map" && (
          <>
            <div style={{ flex: 1, overflow: "hidden" }}><NodeMap /></div>
            <div style={{ width: 280, borderLeft: "1px solid var(--border)", flexShrink: 0, overflow: "hidden" }}>
              <RightPanel />
            </div>
          </>
        )}
        {activeScreen === "tenders" && <TenderBoard />}
        {activeScreen === "books" && <BooksScreen />}
        {activeScreen === "finance" && <FinanceScreen />}
        {activeScreen === "products" && <ProductsScreen />}
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
  map: "Map", tenders: "Tenders", books: "Books", finance: "Finance", products: "Products",
};

function StartScreen({ playerName, setPlayerName, onStart }: {
  playerName: string; setPlayerName: (v: string) => void; onStart: (name: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--bg)" }}>
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, width: 380, textAlign: "center" }}>
        <div style={{ color: "var(--gold)", fontWeight: 700, fontSize: 20, letterSpacing: "0.05em", marginBottom: 4 }}>
          SUPPLY CHAIN SIM
        </div>
        <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 32 }}>
          Build a corporate empire. Start year: 1980.
        </div>
        <div style={{ textAlign: "left", marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
            Corporation name
          </label>
          <input
            style={{ width: "100%" }}
            placeholder="Enter your corporation name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && playerName.trim() && onStart(playerName.trim())}
          />
        </div>
        <button className="primary" style={{ width: "100%", padding: "10px 0", fontSize: 14 }}
          disabled={!playerName.trim()} onClick={() => onStart(playerName.trim())}>
          Start Game
        </button>
        <div style={{ marginTop: 24, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.7 }}>
          €100,000 starting capital · 200 turns · one AI rival<br />Win condition: €5M net worth
        </div>
      </div>
    </div>
  );
}

function LossScreen() {
  const { startNewGame } = useGameStore();
  const [name, setName] = useState("");
  const lastResult = useGameStore((s) => s.lastTickResult);

  const isBankruptcy = !!lastResult?.bankruptcyReason;
  const br = lastResult?.bankruptcyReason;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--bg)" }}>
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, width: 400, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{isBankruptcy ? "💸" : "⏰"}</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "var(--danger)", marginBottom: 8 }}>
          {isBankruptcy ? "Bankruptcy" : "Time Limit Reached"}
        </div>
        {isBankruptcy && br ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "var(--text)", fontSize: 13, marginBottom: 8 }}>
              Your corporation could not meet an obligation.
            </div>
            <div style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "10px 14px", textAlign: "left",
            }}>
              <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 3 }}>OBLIGATION</div>
              <div style={{ color: "var(--text-head)", fontSize: 13, marginBottom: 8 }}>{br.obligation}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-dim)" }}>Amount due</span>
                <span style={{ color: "var(--danger)" }}>€{Math.round(br.amount).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-dim)" }}>Cash available</span>
                <span style={{ color: "var(--warn)" }}>€{Math.round(br.cashAvailable).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>
                <span style={{ color: "var(--text-dim)" }}>Shortfall</span>
                <span style={{ color: "var(--danger)", fontWeight: 700 }}>€{Math.round(br.shortfall).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 20 }}>
            200 turns elapsed without reaching the net worth target.
          </div>
        )}
        <input style={{ width: "100%", marginBottom: 10 }} placeholder="New corporation name"
          value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" style={{ width: "100%", padding: "10px 0" }}
          disabled={!name.trim()} onClick={() => startNewGame(name.trim())}>
          Play Again
        </button>
      </div>
    </div>
  );
}
