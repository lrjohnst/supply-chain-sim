import { useGameStore } from "../../store/gameStore";
import { euros, qty } from "../shared/fmt";
import { GameConfig } from "../../config/gameConfig";
import { getBasePrice } from "../../engine/harbor";
import { displayName, getProductsBySaleDestination } from "../../engine/products";
import type { ProductId } from "../../types";

/** All products that can be sold at consumer retail — driven by the registry. */
const RETAIL_PRODUCTS: ProductId[] = getProductsBySaleDestination("consumer_retail");

export default function ProductsScreen() {
  const { gameState, lastBooks } = useGameStore();
  if (!gameState) return null;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  const aiCorp = Object.values(gameState.corporations).find((c) => !c.isPlayer);
  if (!playerCorp) return null;

  const playerFirms = playerCorp.firmIds.map((id) => gameState.firms[id]).filter(Boolean);
  const aiFirms = aiCorp ? aiCorp.firmIds.map((id) => gameState.firms[id]).filter(Boolean) : [];

  // For each product, find which player stores sell it and last turn's revenue
  type ProductRow = {
    product: ProductId;
    firms: string[];
    price: number;
    benchmark: number;
    soldLastTurn: number;
    revenueLastTurn: number;
    margin: number;
    trend: { symbol: string; color: string };
  };

  type AIRow = {
    product: ProductId;
    firms: string[];
    soldLastTurn: number;
    revenueLastTurn: number;
    trend: { symbol: string; color: string };
  };

  const lastTurn = Math.max(0, gameState.turn - 1);

  /** Revenue sum for a corporation + product across a single turn. */
  function revenueForTurn(corpId: string, product: ProductId, turn: number): number {
    return gameState.transactions
      .filter((tx) => tx.turn === turn && tx.corporationId === corpId && tx.category === "revenue" && tx.product === product)
      .reduce((s, tx) => s + tx.total, 0);
  }

  /** ↑ / ↓ / — based on comparing turn t-1 vs t-3 revenue. */
  function trendIndicator(corpId: string, product: ProductId): { symbol: string; color: string } {
    const t1 = revenueForTurn(corpId, product, lastTurn);
    const t3 = revenueForTurn(corpId, product, Math.max(0, lastTurn - 2));
    if (lastTurn < 2) return { symbol: "—", color: "var(--text-dim)" };
    if (t1 > t3 + 0.01) return { symbol: "↑", color: "var(--green)" };
    if (t1 < t3 - 0.01) return { symbol: "↓", color: "var(--danger)" };
    return { symbol: "—", color: "var(--text-dim)" };
  }

  function buildPlayerRows(): ProductRow[] {
    return RETAIL_PRODUCTS.map((product) => {
      const sellingFirms = playerFirms.filter((f) =>
        f.type === "store" &&
        f.inventory.some((l) => l.product === product || true) &&
        f.investments.some((i) => i.status === "complete" && investmentCoversProduct(i.type, product))
      );

      const price = sellingFirms[0]?.retailPrices[product]
        ?? GameConfig.retailBenchmarkPrices[product] ?? 0;
      const benchmark = GameConfig.retailBenchmarkPrices[product] ?? 0;
      const harborCost = getBasePrice(product);
      const margin = price > 0 ? (price - harborCost) / price : 0;

      const txs = gameState.transactions.filter(
        (tx) => tx.turn === lastTurn && tx.corporationId === playerCorp.id &&
          tx.category === "revenue" && tx.product === product
      );
      const revenueLastTurn = txs.reduce((s, tx) => s + tx.total, 0);
      const soldLastTurn = txs.reduce((s, tx) => s + (tx.quantity ?? 0), 0);

      return {
        product, benchmark, price, margin,
        firms: sellingFirms.map((f) => f.name),
        soldLastTurn, revenueLastTurn,
        trend: trendIndicator(playerCorp.id, product),
      };
    }).filter((r) => r.firms.length > 0);
  }

  function buildAIRows(): AIRow[] {
    return RETAIL_PRODUCTS.map((product) => {
      const sellingFirms = aiFirms.filter((f) =>
        f.type === "store" &&
        f.investments.some((i) => i.status === "complete" && investmentCoversProduct(i.type, product))
      );
      const txs = aiCorp ? gameState.transactions.filter(
        (tx) => tx.turn === lastTurn && tx.corporationId === aiCorp.id &&
          tx.category === "revenue" && tx.product === product
      ) : [];
      const soldLastTurn = txs.reduce((s, tx) => s + (tx.quantity ?? 0), 0);
      const revenueLastTurn = txs.reduce((s, tx) => s + tx.total, 0);
      return {
        product, firms: sellingFirms.map((f) => f.name),
        soldLastTurn, revenueLastTurn,
        trend: aiCorp ? trendIndicator(aiCorp.id, product) : { symbol: "—", color: "var(--text-dim)" },
      };
    }).filter((r) => r.firms.length > 0);
  }

  const playerRows = buildPlayerRows();
  const aiRows = buildAIRows();

  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginBottom: 20 }}>Products</h2>

      <div style={{ display: "flex", gap: 24 }}>

        {/* Your products */}
        <div style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 12 }}>Your products</h3>
          {playerRows.length === 0 ? (
            <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
              No active retail products. Build a store and invest in sections.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                  <th style={th}>Product</th>
                  <th style={th}>Firms</th>
                  <th style={th}>Price</th>
                  <th style={th}>Benchmark</th>
                  <th style={th}>Sold</th>
                  <th style={th}>Revenue</th>
                  <th style={th}>Margin</th>
                  <th style={{ ...th, textAlign: "center" }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((row) => (
                  <tr key={row.product} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>{displayName(row.product)}</td>
                    <td style={{ ...td, color: "var(--text-dim)" }}>{row.firms.join(", ")}</td>
                    <td style={td}>{euros(row.price)}</td>
                    <td style={{ ...td, color: "var(--text-dim)" }}>{euros(row.benchmark)}</td>
                    <td style={td}>{qty(row.soldLastTurn)}</td>
                    <td style={{ ...td, color: "var(--green)" }}>{euros(row.revenueLastTurn)}</td>
                    <td style={{
                      ...td,
                      color: row.margin > 0.3 ? "var(--green)" : row.margin > 0.1 ? "var(--warn)" : "var(--danger)",
                    }}>
                      {(row.margin * 100).toFixed(1)}%
                    </td>
                    <td style={{ ...td, textAlign: "center", color: row.trend.color, fontWeight: 700 }}>
                      {row.trend.symbol}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Competitor */}
        <div style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 12 }}>
            {aiCorp?.name ?? "Competitor"} <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(approximate)</span>
          </h3>
          {aiRows.length === 0 ? (
            <div style={{ color: "var(--text-dim)", fontSize: 12 }}>No competitor retail activity observed.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                  <th style={th}>Product</th>
                  <th style={th}>Firms</th>
                  <th style={th}>Sold</th>
                  <th style={th}>Revenue</th>
                  <th style={{ ...th, textAlign: "center" }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {aiRows.map((row) => (
                  <tr key={row.product} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>{displayName(row.product)}</td>
                    <td style={{ ...td, color: "var(--text-dim)" }}>{row.firms.join(", ")}</td>
                    <td style={td}>{qty(row.soldLastTurn)}</td>
                    <td style={{ ...td, color: "var(--red)" }}>{euros(row.revenueLastTurn)}</td>
                    <td style={{ ...td, textAlign: "center", color: row.trend.color, fontWeight: 700 }}>
                      {row.trend.symbol}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function investmentCoversProduct(invType: string, product: ProductId): boolean {
  if (invType === "grocery_section") return ["chicken", "chicken_soup", "ice_cream_strawberry"].includes(product);
  if (invType === "electronics_section") return ["laptop_branded", "printer_branded"].includes(product);
  return false;
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "4px 8px", fontWeight: 600, fontSize: 11,
};
const td: React.CSSProperties = {
  padding: "5px 8px", color: "var(--text)",
};
