import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { computeCorporateBooks, computeFirmBooks } from "../../engine/books";
import { euros } from "../shared/fmt";
import type { Transaction } from "../../types";

export default function BooksScreen() {
  const { gameState } = useGameStore();
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null);
  const [historyTurns, setHistoryTurns] = useState(4);

  if (!gameState) return null;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  const currentTurn = Math.max(0, gameState.turn - 1);
  const turns = Array.from({ length: historyTurns }, (_, i) => currentTurn - i).filter((t) => t >= 0);

  const corpBooks = turns.map((t) => computeCorporateBooks(gameState, playerCorp.id, t));
  const latestBooks = corpBooks[0];

  const firmBooks = selectedFirmId
    ? turns.map((t) => computeFirmBooks(gameState, selectedFirmId, t))
    : null;

  const turnLabel = (turn: number) => {
    const year = 1980 + Math.floor(turn / 4);
    const q = (turn % 4) + 1;
    return `${year} Q${q}`;
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* Left: firm selector */}
      <div style={{
        width: 220,
        borderRight: "1px solid var(--border)",
        overflowY: "auto",
        flexShrink: 0,
      }}>
        <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid var(--border)" }}>
          <h2>Books</h2>
        </div>

        <div
          onClick={() => setSelectedFirmId(null)}
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            cursor: "pointer",
            background: !selectedFirmId ? "var(--bg-hover)" : "transparent",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--text-head)", fontSize: 12 }}>
            {playerCorp.name}
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 11 }}>Consolidated</div>
          {latestBooks && (
            <div style={{
              color: latestBooks.netProfit >= 0 ? "var(--green)" : "var(--danger)",
              fontSize: 12, fontWeight: 600, marginTop: 2,
            }}>
              {latestBooks.netProfit >= 0 ? "+" : ""}{euros(latestBooks.netProfit)}
            </div>
          )}
        </div>

        {playerCorp.firmIds.map((id) => {
          const firm = gameState.firms[id];
          if (!firm) return null;
          const fb = latestBooks?.firmBooks.find((b) => b.firmId === id);
          return (
            <div
              key={id}
              onClick={() => setSelectedFirmId(id === selectedFirmId ? null : id)}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background: selectedFirmId === id ? "var(--bg-hover)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>{firm.type === "farm" ? "🌾" : firm.type === "factory" ? "🏭" : "🏪"}</span>
                <span style={{ color: "var(--text-head)", fontSize: 12 }}>{firm.name}</span>
              </div>
              {fb && (
                <div style={{
                  color: fb.netProfit >= 0 ? "var(--green)" : "var(--danger)",
                  fontSize: 11, marginTop: 2,
                }}>
                  {fb.netProfit >= 0 ? "+" : ""}{euros(fb.netProfit)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: P&L detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2>
            {selectedFirmId
              ? gameState.firms[selectedFirmId]?.name
              : `${playerCorp.name} — Consolidated`}
          </h2>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 4, 8].map((n) => (
              <button
                key={n}
                style={historyTurns === n ? { borderColor: "var(--accent)" } : {}}
                onClick={() => setHistoryTurns(n)}
              >
                {n === 1 ? "This turn" : `Last ${n} turns`}
              </button>
            ))}
          </div>
        </div>

        {/* Summary row per turn */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${turns.length}, 1fr)`,
          gap: 12,
          marginBottom: 24,
        }}>
          {(firmBooks ?? corpBooks).map((books, i) => (
            <div key={i} style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "12px 14px",
            }}>
              <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 6 }}>
                {turnLabel(books.turn)}
              </div>
              <SummaryRow label="Revenue" value={books.revenue} positive />
              <SummaryRow label="Input costs" value={books.inputCosts} />
              <SummaryRow label="Operating" value={books.operatingCosts} />
              {"loanInterest" in books && books.loanInterest > 0 && (
                <SummaryRow label="Interest" value={(books as typeof corpBooks[0]).loanInterest} />
              )}
              <hr style={{ margin: "6px 0" }} />
              <SummaryRow label="Net profit" value={books.netProfit} showSign />
              {"netWorth" in books && (
                <SummaryRow label="Net worth" value={(books as typeof corpBooks[0]).netWorth} positive />
              )}
            </div>
          ))}
        </div>

        {/* Transaction ledger for latest turn */}
        {(firmBooks ?? corpBooks)[0] && (
          <>
            <h3 style={{ marginBottom: 8 }}>Ledger — {turnLabel(turns[0])}</h3>
            <LedgerTable lines={(firmBooks ?? corpBooks)[0].lines} />
          </>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, positive, showSign }: {
  label: string; value: number; positive?: boolean; showSign?: boolean;
}) {
  let color = "var(--text)";
  if (showSign) color = value >= 0 ? "var(--green)" : "var(--danger)";
  else if (positive) color = "var(--text-head)";

  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ color, fontWeight: showSign ? 700 : 400 }}>
        {showSign && value >= 0 ? "+" : ""}
        {value < 0 ? "-" : ""}
        {euros(Math.abs(value))}
      </span>
    </div>
  );
}

function LedgerTable({ lines }: { lines: Transaction[] }) {
  if (lines.length === 0) {
    return <div style={{ color: "var(--text-dim)", fontSize: 12 }}>No transactions this turn.</div>;
  }

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 80px",
        padding: "4px 0",
        borderBottom: "1px solid var(--border)",
        color: "var(--text-dim)",
        fontWeight: 600,
      }}>
        <span>Description</span>
        <span style={{ textAlign: "right" }}>Amount</span>
      </div>
      {lines
        .filter((tx) => tx.total !== 0)
        .map((tx) => (
          <div key={tx.id} style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px",
            padding: "4px 0",
            borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tx.description}
            </span>
            <span style={{
              textAlign: "right",
              color: tx.total >= 0 ? "var(--green)" : "var(--danger)",
              fontWeight: 600,
            }}>
              {tx.total >= 0 ? "+" : ""}{euros(tx.total)}
            </span>
          </div>
        ))}
    </div>
  );
}
