import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { euros } from "../shared/fmt";
import { GameConfig } from "../../config/gameConfig";

export default function FinanceScreen() {
  const { gameState, requestLoan, setTrainingBudget, setMarketingBudget } = useGameStore();
  const [loanAmount, setLoanAmount] = useState("");
  const [loanTurns, setLoanTurns] = useState("8");
  const [loanError, setLoanError] = useState<string | null>(null);

  if (!gameState) return null;
  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  const loans = playerCorp.loanIds.map((id) => gameState.loans[id]).filter(Boolean);
  const totalDebt = loans.reduce((s, l) => s + l.outstandingBalance, 0);

  function handleLoan() {
    const amount = parseFloat(loanAmount);
    const turns = parseInt(loanTurns);
    if (isNaN(amount) || amount <= 0) { setLoanError("Enter a valid loan amount."); return; }
    if (isNaN(turns)) { setLoanError("Enter a valid duration."); return; }
    const err = requestLoan(amount, turns);
    if (err) setLoanError(err);
    else { setLoanError(null); setLoanAmount(""); }
  }

  const quarterlyPaymentEstimate = (amount: number, turns: number) => {
    const r = GameConfig.loans.baseAnnualInterestRate / 4;
    if (r === 0) return amount / turns;
    return (amount * r) / (1 - Math.pow(1 + r, -turns));
  };

  const parsedAmount = parseFloat(loanAmount) || 0;
  const parsedTurns = parseInt(loanTurns) || 8;
  const estimatedPayment = parsedAmount > 0 ? quarterlyPaymentEstimate(parsedAmount, parsedTurns) : 0;

  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginBottom: 20 }}>Finance</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 800 }}>

        {/* Active loans */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: 12 }}>Active loans</h3>
          {loans.length === 0 && (
            <div style={{ color: "var(--text-dim)", fontSize: 12 }}>No active loans.</div>
          )}
          {loans.map((loan) => (
            <div key={loan.id} style={{
              background: "var(--bg)", borderRadius: 4, padding: "10px 12px", marginBottom: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>Principal {euros(loan.principal)}</span>
                <span style={{ color: "var(--danger)" }}>{(loan.annualInterestRate * 100).toFixed(1)}% p.a.</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                Outstanding: {euros(loan.outstandingBalance)}
                {" · "}Quarterly payment: {euros(loan.quarterlyPayment)}
              </div>
              {/* Balance bar */}
              <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginTop: 6 }}>
                <div style={{
                  height: "100%",
                  width: `${(loan.outstandingBalance / loan.principal) * 100}%`,
                  background: "var(--danger)", borderRadius: 2,
                }} />
              </div>
            </div>
          ))}
          {totalDebt > 0 && (
            <div style={{ marginTop: 8, color: "var(--text-dim)", fontSize: 12 }}>
              Total debt: <span style={{ color: "var(--danger)", fontWeight: 600 }}>{euros(totalDebt)}</span>
            </div>
          )}
        </div>

        {/* Take a loan */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: 12 }}>Take a loan</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={labelStyle}>Amount (€)</label>
              <input
                type="number" value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                placeholder={`Max ~${euros(playerCorp.cash * GameConfig.loans.maxLoanMultiple)}`}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={labelStyle}>Duration (turns)</label>
              <input
                type="number" value={loanTurns}
                onChange={(e) => setLoanTurns(e.target.value)}
                placeholder="8"
                style={{ width: "100%" }}
              />
            </div>
            {parsedAmount > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--bg)", padding: "8px 10px", borderRadius: 4 }}>
                Base rate: {(GameConfig.loans.baseAnnualInterestRate * 100).toFixed(1)}% p.a.
                <br />
                Est. quarterly payment: <strong style={{ color: "var(--warn)" }}>{euros(estimatedPayment)}</strong>
                <br />
                Total repayment: {euros(estimatedPayment * parsedTurns)}
              </div>
            )}
            {loanError && <div style={{ color: "var(--danger)", fontSize: 11 }}>{loanError}</div>}
            <button className="primary" onClick={handleLoan}>Take loan</button>
          </div>
        </div>

        {/* Training budget */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: 4 }}>Training budget</h3>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 12 }}>
            Applied equally across all firms. Prevents quality decay. Current: {euros(playerCorp.trainingBudgetPerTurn)}/turn
          </div>
          <input
            type="range"
            min={0} max={GameConfig.training.maxBudgetPerTurn} step={500}
            value={playerCorp.trainingBudgetPerTurn}
            onChange={(e) => setTrainingBudget(parseInt(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
            <span>€0</span>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>
              {euros(playerCorp.trainingBudgetPerTurn)}/turn
            </span>
            <span>{euros(GameConfig.training.maxBudgetPerTurn)}</span>
          </div>
          {playerCorp.firmIds.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
              Per firm: {euros(playerCorp.trainingBudgetPerTurn / playerCorp.firmIds.length)}/turn
              {playerCorp.trainingBudgetPerTurn / playerCorp.firmIds.length < GameConfig.training.budgetPerFirmForEffect
                ? " — insufficient to prevent quality decay"
                : " — quality maintained"}
            </div>
          )}
        </div>

        {/* Marketing budget */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: 4 }}>Marketing budget</h3>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 12 }}>
            Boosts consumer demand across all stores. Current: {euros(playerCorp.marketingBudgetPerTurn)}/turn
          </div>
          <input
            type="range"
            min={0} max={GameConfig.marketing.maxBudgetPerTurn} step={1000}
            value={playerCorp.marketingBudgetPerTurn}
            onChange={(e) => setMarketingBudget(parseInt(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
            <span>€0</span>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>
              {euros(playerCorp.marketingBudgetPerTurn)}/turn
            </span>
            <span>{euros(GameConfig.marketing.maxBudgetPerTurn)}</span>
          </div>
        </div>

        {/* Milestones */}
        <div style={{ ...cardStyle, gridColumn: "span 2" }}>
          <h3 style={{ marginBottom: 8 }}>Milestones</h3>
          <div style={{ display: "flex", gap: 16 }}>
            <MilestoneChip
              label="€100k revenue"
              description="Unlocks multi-year contracts"
              achieved={playerCorp.multiYearContractsUnlocked}
              current={playerCorp.cumulativeRevenue}
              target={GameConfig.game.multiYearContractRevenueThreshold}
            />
            <MilestoneChip
              label="Barcode scanning"
              description="Available 1984 Q1"
              achieved={gameState.barcodeAvailable}
              current={gameState.turn}
              target={GameConfig.game.barcodeAvailableTurn}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MilestoneChip({ label, description, achieved, current, target }: {
  label: string; description: string; achieved: boolean; current: number; target: number;
}) {
  const progress = Math.min(1, current / target);
  return (
    <div style={{
      flex: 1, background: "var(--bg)", borderRadius: 6, padding: "10px 14px",
      border: `1px solid ${achieved ? "var(--green-dim)" : "var(--border)"}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: achieved ? "var(--green)" : "var(--text-head)" }}>
          {label}
        </span>
        {achieved && <span className="tag tag-green">✓ Unlocked</span>}
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 6 }}>{description}</div>
      {!achieved && (
        <div style={{ height: 3, background: "var(--border)", borderRadius: 2 }}>
          <div style={{
            height: "100%", width: `${progress * 100}%`,
            background: "var(--accent)", borderRadius: 2,
          }} />
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 16,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-dim)",
  marginBottom: 3,
};
