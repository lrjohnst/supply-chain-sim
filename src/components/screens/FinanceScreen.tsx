import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { euros } from "../shared/fmt";
import { GameConfig } from "../../config/gameConfig";
import { computeTotalAssets, getCreditLimit, getCreditFacility } from "../../engine/loans";

export default function FinanceScreen() {
  const { gameState, drawCredit, repayCredit, setCorporateTrainingIntensity, setMarketingBudget } = useGameStore();
  const [drawAmount, setDrawAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [drawError, setDrawError] = useState<string | null>(null);
  const [repayError, setRepayError] = useState<string | null>(null);

  if (!gameState) return null;
  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  const facility = getCreditFacility(gameState, playerCorp.id);
  const creditLimit = getCreditLimit(gameState, playerCorp.id);
  const outstanding = facility?.outstandingBalance ?? 0;
  const available = Math.max(0, creditLimit - outstanding);
  const annualRate = facility?.annualInterestRate ?? gameState.currentBaseInterestRate;
  const quarterlyRate = annualRate / GameConfig.game.quartersPerYear;
  const interestPerTurn = outstanding * quarterlyRate;

  function handleDraw() {
    const amount = parseFloat(drawAmount);
    if (isNaN(amount) || amount <= 0) { setDrawError("Enter a valid amount."); return; }
    const err = drawCredit(amount);
    if (err) setDrawError(err);
    else { setDrawError(null); setDrawAmount(""); }
  }

  function handleRepay() {
    const amount = parseFloat(repayAmount);
    if (isNaN(amount) || amount <= 0) { setRepayError("Enter a valid amount."); return; }
    const err = repayCredit(amount);
    if (err) setRepayError(err);
    else { setRepayError(null); setRepayAmount(""); }
  }

  const utilizationPct = creditLimit > 0 ? outstanding / creditLimit : 0;

  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginBottom: 20 }}>Finance</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 800 }}>

        {/* Credit facility overview */}
        <div style={{ ...cardStyle, gridColumn: "span 2" }}>
          <h3 style={{ marginBottom: 12 }}>Revolving credit facility</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
            <Stat label="Credit limit" value={euros(creditLimit)} />
            <Stat label="Outstanding" value={euros(outstanding)} danger={outstanding > 0} />
            <Stat label="Available" value={euros(available)} />
            <Stat label="Rate" value={`${(annualRate * 100).toFixed(1)}% p.a.`} />
          </div>
          {outstanding > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
                <span>Utilisation {(utilizationPct * 100).toFixed(0)}%</span>
                <span>Interest accruing: <span style={{ color: "var(--danger)" }}>{euros(interestPerTurn)}/turn</span></span>
              </div>
              <div style={{ height: 4, background: "var(--border)", borderRadius: 2 }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, utilizationPct * 100)}%`,
                  background: utilizationPct > 0.75 ? "var(--danger)" : "var(--warn)",
                  borderRadius: 2,
                }} />
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Variable rate — tracks the base interest rate. Draw and repay freely each turn.
            Limit is based on total asset value × leverage ratio.
          </div>
        </div>

        {/* Draw credit */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: 12 }}>Draw credit</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={labelStyle}>Amount (€)</label>
              <input
                type="number" value={drawAmount}
                onChange={(e) => setDrawAmount(e.target.value)}
                placeholder={`Max ${euros(available)}`}
                style={{ width: "100%" }}
              />
            </div>
            {drawAmount && parseFloat(drawAmount) > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--bg)", padding: "8px 10px", borderRadius: 4 }}>
                Additional interest: <strong style={{ color: "var(--warn)" }}>
                  {euros(parseFloat(drawAmount) * quarterlyRate)}/turn
                </strong>
              </div>
            )}
            {drawError && <div style={{ color: "var(--danger)", fontSize: 11 }}>{drawError}</div>}
            <button className="primary" onClick={handleDraw} disabled={available <= 0}>
              Draw funds
            </button>
          </div>
        </div>

        {/* Repay credit */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: 12 }}>Repay credit</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={labelStyle}>Amount (€)</label>
              <input
                type="number" value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                placeholder={outstanding > 0 ? `Max ${euros(outstanding)}` : "Nothing to repay"}
                style={{ width: "100%" }}
                disabled={outstanding <= 0}
              />
            </div>
            {repayAmount && parseFloat(repayAmount) > 0 && outstanding > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--bg)", padding: "8px 10px", borderRadius: 4 }}>
                Remaining after repayment: <strong>{euros(Math.max(0, outstanding - parseFloat(repayAmount)))}</strong>
              </div>
            )}
            {repayError && <div style={{ color: "var(--danger)", fontSize: 11 }}>{repayError}</div>}
            <button className="primary" onClick={handleRepay} disabled={outstanding <= 0}>
              Repay
            </button>
          </div>
        </div>

        {/* Training intensity */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: 4 }}>Training Intensity</h3>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 12 }}>
            Sets default training intensity for all firms. Per-firm overrides can be set in the firm panel.
            {playerCorp.corporateTrainingIntensity >= GameConfig.training.qualityThreshold
              ? " Quality improving."
              : " Below threshold — quality will decay."}
          </div>
          <input
            type="range"
            min={0} max={100} step={1}
            value={playerCorp.corporateTrainingIntensity}
            onChange={(e) => setCorporateTrainingIntensity(parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "var(--gold)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
            <span>0%</span>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>
              {playerCorp.corporateTrainingIntensity}% intensity
            </span>
            <span>100%</span>
          </div>
          {playerCorp.firmIds.length > 0 && (() => {
            const totalCost = playerCorp.firmIds.reduce((sum, fid) => {
              const f = gameState.firms[fid];
              if (!f) return sum;
              return sum + (GameConfig.training.baseTrainingCostPerTurn[f.type] ?? 0) * (f.trainingIntensity / 100);
            }, 0);
            return (
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
                Est. training cost: <span style={{ color: "var(--text)" }}>{euros(totalCost)}/turn</span>
                {" across "}{playerCorp.firmIds.length} firm{playerCorp.firmIds.length !== 1 ? "s" : ""}
              </div>
            );
          })()}
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
            style={{ width: "100%", accentColor: "var(--gold)" }}
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
              label="€100k gross revenue"
              description="Unlocks multi-year contracts (cumulative gross revenue)"
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

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "IBM Plex Mono, monospace", color: danger ? "var(--danger)" : "var(--text-head)" }}>
        {value}
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
