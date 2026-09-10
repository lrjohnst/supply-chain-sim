import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { computeCorporateBooks, computeFirmBooks } from "../../engine/books";
import { euros, turnLabel } from "../shared/fmt";
import type { Transaction } from "../../types";

export default function BooksScreen() {
  const { gameState } = useGameStore();
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null);
  // selectedTurn: the turn currently displayed. Always a completed turn (never current in-progress turn).
  // null means "most recent completed turn" — resolved below.
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);

  if (!gameState) return null;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  if (gameState.turn === 0) {
    return (
      <div style={{ padding: 32, color: "var(--text-dim)", fontSize: 13 }}>
        No financial data yet. End your first turn to see results.
      </div>
    );
  }

  const lastCompletedTurn = gameState.turn - 1;
  const viewTurn = selectedTurn !== null ? selectedTurn : lastCompletedTurn;
  // Show the selected turn only (single-turn view with back/forward navigation).
  const turns = [viewTurn];

  const corpBooks = turns.map((t) => computeCorporateBooks(gameState, playerCorp.id, t));
  const latestBooks = corpBooks[0];

  const firmBooks = selectedFirmId
    ? turns.map((t) => computeFirmBooks(gameState, selectedFirmId, t))
    : null;

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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              disabled={viewTurn <= 0}
              onClick={() => setSelectedTurn(viewTurn - 1)}
              style={{ padding: "2px 10px" }}
            >
              ‹
            </button>
            <span style={{ fontSize: 12, color: "var(--text-dim)", minWidth: 80, textAlign: "center" }}>
              {turnLabel(viewTurn)}
            </span>
            <button
              disabled={viewTurn >= lastCompletedTurn}
              onClick={() => setSelectedTurn(Math.min(viewTurn + 1, lastCompletedTurn))}
              style={{ padding: "2px 10px" }}
            >
              ›
            </button>
            {viewTurn < lastCompletedTurn && (
              <button onClick={() => setSelectedTurn(null)} style={{ fontSize: 11 }}>
                Latest
              </button>
            )}
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
              {books.overheadCosts > 0 && (
                <SummaryRow label="Overhead" value={books.overheadCosts} />
              )}
              <SummaryRow label="Operating" value={books.operatingCosts} />
              {books.staffWageCosts > 0 && (
                <SummaryRow label="Staff wages" value={books.staffWageCosts} />
              )}
              {books.capitalExpenditure > 0 && (
                <SummaryRow label="Capital exp." value={books.capitalExpenditure} />
              )}
              {"loanInterest" in books && books.loanInterest > 0 && (
                <SummaryRow label="Interest" value={(books as typeof corpBooks[0]).loanInterest} />
              )}
              <hr style={{ margin: "6px 0" }} />
              <SummaryRow label="Net profit" value={books.netProfit} showSign />
              {"netWorth" in books && (
                <>
                  <SummaryRow label={`Net worth — end of ${turnLabel(books.turn)}`} value={(books as typeof corpBooks[0]).netWorth} positive />
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                    Reflects current state, not historical snapshot.
                  </div>
                </>
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
