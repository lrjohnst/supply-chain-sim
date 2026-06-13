import { useGameStore } from "../../store/gameStore";
import { euros, qty, turnLabel } from "../shared/fmt";
import { displayName } from "../../engine/products";

export default function ContractsScreen() {
  const { gameState } = useGameStore();
  if (!gameState) return null;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  const allContracts = Object.values(gameState.contracts);

  const active = allContracts.filter(
    (c) =>
      c.status === "active" &&
      (c.sellerParty.corporationId === playerCorp.id ||
        c.buyerParty.corporationId === playerCorp.id)
  );

  const historical = allContracts.filter(
    (c) =>
      c.status !== "active" &&
      (c.sellerParty.corporationId === playerCorp.id ||
        c.buyerParty.corporationId === playerCorp.id)
  );

  function counterpartyLabel(c: (typeof allContracts)[0]) {
    const isSeller = c.sellerParty.corporationId === playerCorp!.id;
    if (isSeller) {
      if (c.buyerParty.type === "market") return "Market";
      if (c.buyerParty.firmId) return gameState!.firms[c.buyerParty.firmId]?.name ?? "Unknown";
      return "Unknown";
    } else {
      if (c.sellerParty.type === "harbor") return "Harbor";
      if (c.sellerParty.firmId) return gameState!.firms[c.sellerParty.firmId]?.name ?? "Unknown";
      return "Unknown";
    }
  }

  function roleLabel(c: (typeof allContracts)[0]) {
    return c.sellerParty.corporationId === playerCorp!.id ? "Seller" : "Buyer";
  }

  function turnsRemaining(c: (typeof allContracts)[0]) {
    const end = c.startTurn + c.durationTurns;
    return Math.max(0, end - gameState!.turn);
  }

  const col: React.CSSProperties = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    whiteSpace: "nowrap",
  };
  const head: React.CSSProperties = {
    ...col,
    color: "var(--text-dim)",
    fontWeight: 600,
    fontSize: 11,
    background: "var(--bg-panel)",
    position: "sticky",
    top: 0,
  };

  function ContractTable({ rows }: { rows: typeof allContracts }) {
    if (rows.length === 0)
      return <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "12px 0" }}>None.</div>;
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Role", "Product", "Counterparty", "Vol/turn", "Price/unit", "Started", "Duration", "Remaining", "Status", "Origin"].map(
                (h) => <th key={h} style={head}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const remaining = turnsRemaining(c);
              const isWarn = c.status === "active" && remaining <= 2;
              return (
                <tr key={c.id} style={{ background: "transparent" }}>
                  <td style={col}>{roleLabel(c)}</td>
                  <td style={col}>{displayName(c.product)}</td>
                  <td style={col}>{counterpartyLabel(c)}</td>
                  <td style={{ ...col, textAlign: "right" }}>{qty(c.volumePerTurn)}</td>
                  <td style={{ ...col, textAlign: "right" }}>{euros(c.unitPrice)}</td>
                  <td style={col}>{turnLabel(c.startTurn)}</td>
                  <td style={{ ...col, textAlign: "right" }}>{c.durationTurns}t</td>
                  <td style={{ ...col, textAlign: "right", color: isWarn ? "var(--warn)" : undefined }}>
                    {c.status === "active" ? `${remaining}t` : "—"}
                  </td>
                  <td style={{ ...col, color: c.status === "breached" ? "var(--danger)" : c.status === "completed" ? "var(--text-dim)" : undefined }}>
                    {c.status}
                  </td>
                  <td style={{ ...col, color: "var(--text-dim)" }}>
                    {c.originType === "tender" ? "tender" : c.originType ?? "direct"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      <h2 style={{ marginBottom: 20, fontSize: 16, color: "var(--text-head)" }}>Contracts</h2>

      <h3 style={{ fontSize: 13, marginBottom: 10, color: "var(--text-head)" }}>
        Active ({active.length})
      </h3>
      <ContractTable rows={active} />

      <h3 style={{ fontSize: 13, marginTop: 32, marginBottom: 10, color: "var(--text-dim)" }}>
        Historical ({historical.length})
      </h3>
      <ContractTable rows={historical} />
    </div>
  );
}
