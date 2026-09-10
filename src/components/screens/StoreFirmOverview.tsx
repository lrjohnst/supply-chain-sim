import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { euros, qty } from "../shared/fmt";
import { GameConfig } from "../../config/gameConfig";
import { estimatedDemand } from "../../engine/retail";
import { getHarborCostBreakdown } from "../../engine/harborSpotPurchase";
import { displayName, isSoldByHarbor, STORE_SECTION_PRODUCTS, SECTION_EXPANSION_TYPE, getSectionSlotCount } from "../../engine/products";
import type { Firm, ProductId, InvestmentType, Transaction, GameState } from "../../types";

// ============================================================
// Visual identity maps
// ============================================================

const PRODUCT_COLOR: Record<ProductId, string> = {
  raw_chicken:          "#8B4513",
  chicken:              "#D2691E",
  chicken_soup:         "#A0522D",
  bauxite:              "#8B0000",
  alumina:              "#888",
  aluminium:            "#B8C0CC",
  laptop_whitelabel:    "#4682B4",
  laptop_branded:       "#1E3A5F",
  ice_cream_strawberry: "#E75480",
  printer_branded:      "#2F4F4F",
};

const PRODUCT_INITIALS: Record<ProductId, string> = {
  raw_chicken:          "RC",
  chicken:              "PC",
  chicken_soup:         "CS",
  bauxite:              "BA",
  alumina:              "AL",
  aluminium:            "AU",
  laptop_whitelabel:    "WL",
  laptop_branded:       "BL",
  ice_cream_strawberry: "IC",
  printer_branded:      "PR",
};

// ============================================================
// Section config
// ============================================================

// Canonical section → product list now lives in engine/products.ts (STORE_SECTION_PRODUCTS),
// shared with retail.ts and harborSpotPurchase.ts so capacity allocation order matches the UI.
const SECTION_PRODUCTS = STORE_SECTION_PRODUCTS;

const SECTION_LABEL: Partial<Record<InvestmentType, string>> = {
  grocery_section:     "Grocery",
  electronics_section: "Electronics",
  cosmetics_section:   "Cosmetics",
  hardware_section:    "Hardware",
  clothing_section:    "Clothing",
  pharmacy_section:    "Pharmacy",
};

// Canonical section → expansion type mapping now lives in engine/products.ts.
const SECTION_EXPANSION = SECTION_EXPANSION_TYPE;

// ============================================================
// Investment build panel config
// ============================================================

const INVESTMENT_DESCRIPTIONS: Partial<Record<InvestmentType, string>> = {
  grocery_section:               "Opens food & beverage products",
  electronics_section:           "Opens electronics products",
  cosmetics_section:             "Opens beauty & personal care",
  hardware_section:              "Opens tools & hardware",
  clothing_section:              "Opens apparel products",
  pharmacy_section:              "Opens health & pharmacy",
  grocery_section_expansion:     "Adds 1 grocery product slot",
  electronics_section_expansion: "Adds 1 electronics product slot",
  warehouse_capacity:            "Reduces stockout risk",
  barcode_scanning:              "+5% unit sales efficiency",
  training_store:                "Speeds staff quality improvement",
};

const INVESTMENT_GROUPS: { label: string; types: InvestmentType[] }[] = [
  { label: "Sections",   types: ["grocery_section", "electronics_section", "cosmetics_section", "hardware_section", "clothing_section", "pharmacy_section"] },
  { label: "Expansions", types: ["grocery_section_expansion", "electronics_section_expansion"] },
  { label: "Upgrades",   types: ["warehouse_capacity", "barcode_scanning"] },
  { label: "Training",   types: ["training_store"] },
];

// ============================================================
// Helpers
// ============================================================

// computeEmployeeCount now lives in engine/operatingCosts.ts (canonical, also used by the tick).

function computeBallDisplay(employeeCount: number, trainedFraction: number) {
  // Scale to 5–20 balls regardless of headcount
  const scaleFactor = Math.max(1, Math.round(employeeCount / 12));
  const ballCount   = Math.min(20, Math.max(5, Math.round(employeeCount / scaleFactor)));
  const blueBalls   = Math.round(ballCount * trainedFraction);
  return { ballCount, blueBalls };
}

function getActiveProducts(firm: Firm, sectionType: InvestmentType): ProductId[] {
  const candidates = SECTION_PRODUCTS[sectionType] ?? [];
  return candidates.filter(
    (p) => firm.harborAutoSource[p] === true || firm.retailPrices[p] !== undefined,
  );
}

// getSectionSlotCount now imported from engine/products.ts (canonical, shared with capacity allocation).

// Fix 2: all chart helpers exclude tx.turn >= currentTurn
function firmRevByTurn(txs: Transaction[], firmId: string, turns: number, currentTurn: number): number[] {
  const arr = Array(turns).fill(0);
  for (const tx of txs) {
    if (tx.firmId !== firmId || tx.category !== "revenue" || tx.turn >= currentTurn) continue;
    const idx = turns + tx.turn - currentTurn;
    if (idx >= 0 && idx < turns) arr[idx] += tx.total;
  }
  return arr;
}

function firmProfitByTurn(txs: Transaction[], firmId: string, turns: number, currentTurn: number): number[] {
  const arr = Array(turns).fill(0);
  for (const tx of txs) {
    if (tx.firmId !== firmId || tx.turn >= currentTurn) continue;
    const idx = turns + tx.turn - currentTurn;
    if (idx >= 0 && idx < turns) arr[idx] += tx.total;
  }
  return arr;
}

function productRevByTurn(txs: Transaction[], firmId: string, productId: ProductId, turns: number, currentTurn: number): number[] {
  const arr = Array(turns).fill(0);
  for (const tx of txs) {
    if (tx.firmId !== firmId || tx.product !== productId || tx.category !== "revenue" || tx.turn >= currentTurn) continue;
    const idx = turns + tx.turn - currentTurn;
    if (idx >= 0 && idx < turns) arr[idx] += tx.total;
  }
  return arr;
}

function productProfitByTurn(txs: Transaction[], firmId: string, productId: ProductId, turns: number, currentTurn: number): number[] {
  const arr = Array(turns).fill(0);
  for (const tx of txs) {
    if (tx.firmId !== firmId || tx.product !== productId || tx.turn >= currentTurn) continue;
    if (tx.category !== "revenue" && tx.category !== "input_cost") continue;
    const idx = turns + tx.turn - currentTurn;
    if (idx >= 0 && idx < turns) arr[idx] += tx.total;
  }
  return arr;
}

function productUnitsByTurn(txs: Transaction[], firmId: string, productId: ProductId, turns: number, currentTurn: number): number[] {
  const arr = Array(turns).fill(0);
  for (const tx of txs) {
    if (tx.firmId !== firmId || tx.product !== productId || tx.category !== "revenue" || tx.turn >= currentTurn) continue;
    const idx = turns + tx.turn - currentTurn;
    if (idx >= 0 && idx < turns) arr[idx] += tx.quantity ?? 0;
  }
  return arr;
}

function avgPurchaseCost(txs: Transaction[], firmId: string, productId: ProductId, turns: number, currentTurn: number): number {
  const relevant = txs.filter(
    (t) => t.firmId === firmId && t.product === productId && t.category === "input_cost"
      && t.turn < currentTurn && t.turn > currentTurn - turns,
  );
  if (relevant.length === 0) return 0;
  const totalUnits = relevant.reduce((s, t) => s + (t.quantity ?? 0), 0);
  const totalCost  = relevant.reduce((s, t) => s + Math.abs(t.total), 0);
  return totalUnits > 0 ? totalCost / totalUnits : 0;
}

// Returns the effective cost per unit for margin calculations.
// Harbor sources → full breakdown total; own-supply → inventory unitCost; missing → null
function getEffectiveCost(firm: Firm, productId: ProductId, gameState: GameState): number | null {
  if (firm.harborAutoSource[productId] === true) {
    const breakdown = getHarborCostBreakdown(gameState, firm.cityNodeId, productId);
    return breakdown?.totalPerUnit ?? null;
  }
  const invLine = firm.inventory.find((l) => l.product === productId);
  return invLine?.unitCost ?? null;
}

// ============================================================
// Shared sub-components
// ============================================================

function Sparkline({ data, color = "var(--accent)", height = 32, width = 100 }: {
  data: number[]; color?: string; height?: number; width?: number;
}) {
  if (data.length === 0) return <div style={{ width, height }} />;
  const max  = Math.max(...data, 1);
  const step = width / Math.max(data.length - 1, 1);
  const pts  = data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Compact inline bar for the 2×2 grid
function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{
        fontSize: 9, color: "var(--text-dim)", width: 40, flexShrink: 0,
        fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2 }}>
        <div style={{ height: 3, width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{
        fontSize: 9, color: "var(--text-dim)", width: 22, textAlign: "right",
        fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
      }}>
        {pct}%
      </span>
    </div>
  );
}

// Utilization bar: green <80%, amber 80–95%, red >95% (display value clamped at 100%).
// The "at capacity" warning is driven by atCapacity (capacityLimitedSlot), not by the
// displayed percentage — a slot can show >100% fair-share load without actually having
// lost any sales to the capacity pool running out.
function UtilizationBar({ value, atCapacity }: { value: number; atCapacity: boolean }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = pct > 95 ? "var(--danger)" : pct >= 80 ? "var(--warn)" : "var(--green)";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{
          fontSize: 9, color: "var(--text-dim)", width: 64, flexShrink: 0,
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
        }}>
          Utilization
        </span>
        <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2 }}>
          <div style={{ height: 3, width: `${pct}%`, background: color, borderRadius: 2 }} />
        </div>
        <span style={{
          fontSize: 9, color: "var(--text-dim)", width: 22, textAlign: "right",
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
        }}>
          {pct}%
        </span>
      </div>
      {atCapacity && (
        <div style={{ fontSize: 9, color: "var(--danger)", marginTop: 2, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
          At capacity — expand section or improve training to sell more.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Product slot — compact card with collapsible drilldown
// ============================================================

function ProductSlot({
  productId, firm, gameState, onPriceChange, onStopSelling,
}: {
  productId: ProductId;
  firm: Firm;
  gameState: GameState;
  onPriceChange: (p: ProductId, price: number) => void;
  onStopSelling: (p: ProductId) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const city       = gameState.cityNodes[firm.cityNodeId];
  const currentTurn = gameState.turn;
  const txs        = gameState.transactions;

  const benchmark  = GameConfig.retailBenchmarkPrices[productId] ?? 0;
  const retailPrice = firm.retailPrices[productId] ?? benchmark;
  const isHarborSource = firm.harborAutoSource[productId] === true;
  const sourceLabel = isHarborSource
    ? "Harbor"
    : (() => {
        // Find supplying firm name via internal contracts if any
        const contract = Object.values(gameState.contracts).find(
          (c) => c.status === "active" && c.isInternal
            && c.buyerParty.firmId === firm.id && c.product === productId,
        );
        if (contract?.sellerParty.firmId) {
          return gameState.firms[contract.sellerParty.firmId]?.name ?? "Own supply";
        }
        return "Own supply";
      })();

  const harborBreakdown = isHarborSource
    ? getHarborCostBreakdown(gameState, firm.cityNodeId, productId)
    : null;
  const effectiveCost  = getEffectiveCost(firm, productId, gameState);
  const avg5yr         = avgPurchaseCost(txs, firm.id, productId, 20, currentTurn);
  const costBasis      = avg5yr > 0 ? avg5yr : effectiveCost;
  const liveMargin     = costBasis !== null ? retailPrice - costBasis : null;

  const marketSize = city
    ? estimatedDemand(city.population, productId, retailPrice, {
        locationClass: firm.locationClass,
        size: firm.size,
      })
    : 0;

  const competitors = Object.values(gameState.firms).filter(
    (f) => f.id !== firm.id && f.cityNodeId === firm.cityNodeId
      && (f.harborAutoSource[productId] === true || f.retailPrices[productId] !== undefined),
  ).map((f) => ({
    name: gameState.corporations[f.corporationId]?.name ?? "?",
    price: f.retailPrices[productId] ?? benchmark,
  }));

  // 12-month at-a-glance stats (firm-level not product-level for rev/profit summary)
  const rev12total  = txs.filter(
    (t) => t.firmId === firm.id && t.product === productId && t.category === "revenue"
      && t.turn < currentTurn && t.turn > currentTurn - 12,
  ).reduce((s, t) => s + t.total, 0);
  const prof12total = txs.filter(
    (t) => t.firmId === firm.id && t.product === productId
      && (t.category === "revenue" || t.category === "input_cost")
      && t.turn < currentTurn && t.turn > currentTurn - 12,
  ).reduce((s, t) => s + t.total, 0);
  const units12 = txs.filter(
    (t) => t.firmId === firm.id && t.product === productId && t.category === "revenue"
      && t.turn < currentTurn && t.turn > currentTurn - 12,
  ).reduce((s, t) => s + (t.quantity ?? 0), 0);

  // Product quality reflects the supplying production line, not the store's training.
  // Harbor-sourced goods: placeholder quality of 0.2 until harbor quality modeling exists.
  // Own-supply: find the seller firm via internal contract and read its line quality.
  const quality = (() => {
    if (isHarborSource) return 0.2;
    const contract = Object.values(gameState.contracts).find(
      (c) => c.status === "active" && c.isInternal
        && c.buyerParty.firmId === firm.id && c.product === productId,
    );
    const sellerFirm = contract?.sellerParty.firmId
      ? gameState.firms[contract.sellerParty.firmId]
      : null;
    if (sellerFirm) {
      // Find the production line whose recipe outputs this product
      for (const line of sellerFirm.productionLines) {
        if (!line.recipe) continue;
        const recipeCfg = GameConfig.production[line.recipe];
        if (recipeCfg?.outputProduct === productId) return line.quality;
      }
    }
    // No contract / no matching line — show inventory unit cost as proxy, or 1.0
    return 1.0;
  })();

  const color    = PRODUCT_COLOR[productId] ?? "#555";
  const initials = PRODUCT_INITIALS[productId] ?? productId.slice(0, 2).toUpperCase();

  const monoStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
  };

  return (
    <div
      style={{
        background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 5,
        marginBottom: 6, cursor: "pointer",
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* ── Row 1: icon · name · source · stats ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 4px" }}>
        <div style={{
          width: 32, height: 32, borderRadius: 3, background: color, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: "#fff", ...monoStyle,
        }}>
          {initials}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-head)", flex: "0 0 auto" }}>
          {displayName(productId)}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-dim)", flex: "0 0 auto" }}>{sourceLabel}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-dim)", ...monoStyle }}>
          Rev&nbsp;<strong style={{ color: "var(--green)" }}>{euros(rev12total)}</strong>
          &nbsp;·&nbsp;
          P&nbsp;<strong style={{ color: prof12total >= 0 ? "var(--gold)" : "var(--danger)" }}>{euros(prof12total)}</strong>
          &nbsp;·&nbsp;
          <strong style={{ color: "var(--text)" }}>{qty(units12)}</strong>&nbsp;u
        </span>
      </div>

      {/* ── Row 2: price · costs · margin · market ── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px 6px",
          fontSize: 10, color: "var(--text-dim)", flexWrap: "wrap" }}
        onClick={(e) => e.stopPropagation()}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "default" }}>
          <span style={{ ...monoStyle }}>Sell</span>
          <input
            type="number"
            style={{ width: 60, fontSize: 10, padding: "1px 4px", ...monoStyle }}
            value={retailPrice.toFixed(2)}
            step={0.1}
            min={0.01}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v > 0) onPriceChange(productId, v);
            }}
          />
        </label>
        {harborBreakdown ? (
          <span style={{ ...monoStyle }}>
            Harbor:&nbsp;<strong style={{ color: "var(--text)" }}>{euros(harborBreakdown.harborPrice)}</strong>
            &nbsp;+&nbsp;Prem:&nbsp;<strong style={{ color: "var(--text)" }}>{euros(harborBreakdown.spotPremium)}</strong>
            {harborBreakdown.transportCost > 0 && (
              <>&nbsp;+&nbsp;Transport:&nbsp;<strong style={{ color: "var(--warn)" }}>{euros(harborBreakdown.transportCost)}</strong></>
            )}
            &nbsp;=&nbsp;<strong style={{ color: "var(--gold)" }}>{euros(harborBreakdown.totalPerUnit)}/u</strong>
          </span>
        ) : effectiveCost !== null ? (
          <span style={{ ...monoStyle }}>
            Cost:&nbsp;<strong style={{ color: "var(--text)" }}>{euros(effectiveCost)}/u</strong>
          </span>
        ) : null}
        {avg5yr > 0 && (
          <span style={{ ...monoStyle }}>
            Avg&nbsp;5yr:&nbsp;<strong style={{ color: "var(--text)" }}>{euros(avg5yr)}</strong>
          </span>
        )}
        <span style={{ ...monoStyle, color: liveMargin !== null ? (liveMargin >= 0 ? "var(--green)" : "var(--danger)") : "var(--text-dim)" }}>
          Margin:&nbsp;{liveMargin !== null ? euros(liveMargin) : "—"}
        </span>
        <span style={{ ...monoStyle }}>
          Mkt:&nbsp;<strong style={{ color: "var(--text)" }}>{qty(marketSize)}/t</strong>
        </span>
      </div>

      {/* ── Row 3: competitors (conditional) ── */}
      {competitors.length > 0 && (
        <div style={{ padding: "0 10px 6px", fontSize: 10, color: "var(--warn)", ...monoStyle }}>
          Competition:&nbsp;{competitors.map((c) => `${c.name} @ ${euros(c.price)}`).join(" · ")}
        </div>
      )}

      {/* ── Row 4: 2×2 bar grid ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px",
        padding: "0 10px 8px",
      }}>
        <MiniBar label="Quality" value={quality}               color="var(--gold)" />
        {/* Post-MVP: marketing spend raises brand per product per city. */}
        <MiniBar label="Brand"   value={0}                      color="var(--blue)" />
        <MiniBar label="Demand"  value={Math.min(1, marketSize / Math.max(marketSize + 1, 50))} color="var(--green)" />
        <MiniBar label="Supply"  value={isHarborSource ? 1.0 : 0.6} color="var(--accent)" />
      </div>

      {/* ── Row 5: Utilization ── */}
      <div style={{ padding: "0 10px 8px" }}>
        <UtilizationBar
          value={firm.utilizationPerSlot[productId] ?? 0}
          atCapacity={firm.capacityLimitedSlot[productId] ?? false}
        />
      </div>

      {/* ── Drilldown (expanded) ── */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border)", padding: "10px 10px 8px",
            background: "var(--bg)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 6, ...monoStyle }}>
            12-TURN HISTORY (excl. current)
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 2, ...monoStyle }}>Revenue</div>
              <Sparkline data={productRevByTurn(txs, firm.id, productId, 12, currentTurn)} color="var(--green)" />
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 2, ...monoStyle }}>Profit</div>
              <Sparkline data={productProfitByTurn(txs, firm.id, productId, 12, currentTurn)} color="var(--gold)" />
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 2, ...monoStyle }}>Units sold</div>
              <Sparkline data={productUnitsByTurn(txs, firm.id, productId, 12, currentTurn)} color="var(--blue)" />
            </div>
          </div>
          <button
            style={{ fontSize: 10, padding: "2px 10px", color: "var(--danger)" }}
            onClick={() => onStopSelling(productId)}
          >
            Stop selling
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Empty slot
// ============================================================

// A market offer for a product: harbor or a firm selling to competitors.
interface MarketOffer {
  productId: ProductId;
  sourceLabel: string;   // "Harbor" | firm name
  priceLabel: string;    // formatted cost string shown in picker
  addPrice: number;      // unit cost passed to onAdd (initial retail price suggestion)
  isHarbor: boolean;
}

function buildMarketOffers(
  gameState: GameState,
  thisFirm: Firm,
  candidates: ProductId[],
): MarketOffer[] {
  const offers: MarketOffer[] = [];
  const seen = new Set<ProductId>();

  for (const p of candidates) {
    // Harbor source
    if (isSoldByHarbor(p)) {
      const bd = getHarborCostBreakdown(gameState, thisFirm.cityNodeId, p);
      if (bd) {
        const parts = [
          `Harbor ${euros(bd.harborPrice)}`,
          `prem ${euros(bd.spotPremium)}`,
          ...(bd.transportCost > 0 ? [`transport ${euros(bd.transportCost)}`] : []),
          `= ${euros(bd.totalPerUnit)}/u`,
        ];
        offers.push({
          productId: p,
          sourceLabel: "Harbor",
          priceLabel: parts.join(" + ").replace(" + =", " ="),
          addPrice: bd.totalPerUnit,
          isHarbor: true,
        });
        seen.add(p);
      }
    }

    // Firm source — own firms or AI firms with sellToCompetitors enabled
    if (!seen.has(p)) {
      for (const f of Object.values(gameState.firms)) {
        if (f.id === thisFirm.id) continue;
        if (!f.sellToCompetitors) continue;
        // Firm must have this product in inventory or be producing it
        const inv = f.inventory.find((l) => l.product === p);
        if (!inv || inv.quantity <= 0) continue;
        const corp = gameState.corporations[f.corporationId];
        const price = inv.unitCost;
        offers.push({
          productId: p,
          sourceLabel: corp?.name ?? f.name,
          priceLabel: `${corp?.name ?? f.name} · ${euros(price)}/u`,
          addPrice: price,
          isHarbor: false,
        });
        seen.add(p);
        break; // one offer per product (cheapest would require sorting; first found is fine for MVP)
      }
    }
  }

  return offers;
}

function EmptySlot({ sectionType, firm, gameState, onAdd }: {
  sectionType: InvestmentType;
  firm: Firm;
  gameState: GameState;
  onAdd: (productId: ProductId, price: number) => void;
}) {
  const [picking, setPicking] = useState(false);
  const candidates = SECTION_PRODUCTS[sectionType] ?? [];
  const active     = getActiveProducts(firm, sectionType);
  const inactive   = candidates.filter((p) => !active.includes(p));
  const offers     = buildMarketOffers(gameState, firm, inactive);

  if (offers.length === 0) {
    return (
      <div style={{
        border: "1px dashed var(--border)", borderRadius: 5,
        padding: "6px 10px", fontSize: 10, color: "var(--text-dim)", marginBottom: 6,
      }}>
        {inactive.length === 0 ? "No more products available" : "No market sources available"}
      </div>
    );
  }

  if (!picking) {
    return (
      <div
        style={{
          border: "1px dashed var(--border)", borderRadius: 5, padding: "6px 10px",
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6,
        }}
        onClick={() => setPicking(true)}
      >
        <span style={{ fontSize: 14, color: "var(--text-dim)" }}>+</span>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
          Add product ({offers.length} available)
        </span>
      </div>
    );
  }

  return (
    <div style={{
      border: "1px solid var(--accent)", borderRadius: 5, padding: 10,
      background: "var(--bg-card)", marginBottom: 6,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {offers.map((offer) => (
          <div key={offer.productId} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "4px 6px", background: "var(--bg)", borderRadius: 3,
          }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-head)" }}>
                {displayName(offer.productId)}
                {" "}
                <span style={{ fontSize: 9, color: offer.isHarbor ? "var(--blue)" : "var(--green)", fontWeight: 400 }}>
                  {offer.sourceLabel}
                </span>
              </div>
              <div style={{ fontSize: 9, color: "var(--text-dim)", fontFamily: "IBM Plex Mono, monospace" }}>
                {offer.priceLabel}
              </div>
            </div>
            <button
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={() => { onAdd(offer.productId, offer.addPrice); setPicking(false); }}
            >
              Add
            </button>
          </div>
        ))}
      </div>
      <button
        style={{ fontSize: 9, marginTop: 6, color: "var(--text-dim)" }}
        onClick={() => setPicking(false)}
      >
        Cancel
      </button>
    </div>
  );
}

// ============================================================
// Section group (center column)
// ============================================================

function SectionGroup({
  sectionType, firm, gameState, onPriceChange, onStopSelling, onAddProduct, onBuildInvestment,
}: {
  sectionType: InvestmentType;
  firm: Firm;
  gameState: GameState;
  onPriceChange: (p: ProductId, price: number) => void;
  onStopSelling: (p: ProductId) => void;
  onAddProduct: (p: ProductId, price: number) => void;
  onBuildInvestment: (type: InvestmentType) => void;
}) {
  const label      = SECTION_LABEL[sectionType] ?? sectionType.replace(/_/g, " ");
  const totalSlots = getSectionSlotCount(firm, sectionType);
  const active     = getActiveProducts(firm, sectionType);
  const emptySlots = Math.max(0, totalSlots - active.length);
  const expType    = SECTION_EXPANSION[sectionType];
  const expCount   = expType
    ? firm.investments.filter((i) => i.type === expType && i.status === "complete").length : 0;
  const maxExp     = GameConfig.storeSlots.expansionMaxBySize[firm.size];
  const canExpand  = expType !== undefined && expCount < maxExp;

  // Section-wide utilization = sum of per-slot fair-share utilization / slot count.
  // Algebraically equals (total capacity units used this turn) / (section's total capacity units).
  const sectionUtilization = totalSlots > 0
    ? active.reduce((sum, p) => sum + (firm.utilizationPerSlot[p] ?? 0), 0) / totalSlots
    : 0;
  const sectionUtilPct = Math.round(Math.min(1, Math.max(0, sectionUtilization)) * 100);
  const sectionUtilColor = sectionUtilPct > 95 ? "var(--danger)" : sectionUtilPct >= 80 ? "var(--warn)" : "var(--text-dim)";

  const monoStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 8, borderBottom: "1px solid var(--border)", paddingBottom: 4,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          color: "var(--gold)", textTransform: "uppercase", ...monoStyle,
        }}>
          {label} · {totalSlots} slot{totalSlots !== 1 ? "s" : ""}
          {active.length > 0 && (
            <span style={{ color: sectionUtilColor, textTransform: "none", letterSpacing: "normal", marginLeft: 8 }}>
              {sectionUtilPct}% utilized
            </span>
          )}
        </span>
        {canExpand && expType && (
          <button
            style={{ fontSize: 9, padding: "1px 7px" }}
            onClick={(e) => { e.stopPropagation(); onBuildInvestment(expType); }}
          >
            + Expand ({euros(GameConfig.investments.cost[expType])})
          </button>
        )}
        {!canExpand && expType && (
          <span style={{ fontSize: 9, color: "var(--text-dim)", ...monoStyle }}>
            Max ({firm.size})
          </span>
        )}
      </div>

      {active.map((p) => (
        <ProductSlot
          key={p} productId={p} firm={firm} gameState={gameState}
          onPriceChange={onPriceChange} onStopSelling={onStopSelling}
        />
      ))}

      {Array.from({ length: emptySlots }).map((_, i) => (
        <EmptySlot
          key={`empty-${i}`} sectionType={sectionType} firm={firm}
          gameState={gameState} onAdd={onAddProduct}
        />
      ))}
    </div>
  );
}

// ============================================================
// Left column
// ============================================================

function LeftColumn({
  firm, city, corp, gameState, onBack, onRename, onTrainingChange, onResetTraining,
}: {
  firm: Firm;
  city: ReturnType<typeof Object.values<GameState["cityNodes"][string]>>[number] | undefined;
  corp: GameState["corporations"][string] | undefined;
  gameState: GameState;
  onBack: () => void;
  onRename: (name: string) => void;
  onTrainingChange: (v: number) => void;
  onResetTraining: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState(firm.name);

  const currentTurn   = gameState.turn;
  const txs           = gameState.transactions;

  // ---- Employee balls ----
  // Read directly from engine-maintained firm state — never recomputed live
  // from the slider. trainedFraction only moves via updateTrainedFraction()
  // in the tick, so the balls only change between turns, not while dragging.
  const employeeCount = firm.employeeCount;
  const { ballCount, blueBalls } = computeBallDisplay(employeeCount, firm.trainedFraction);

  // ---- Training ----
  // Must match the engine's tipping point (storeTraining.tippingPoint, a 0.0–1.0
  // fraction) rather than the unrelated production-line quality threshold.
  const threshold  = GameConfig.storeTraining.tippingPoint * 100;
  const improving  = firm.trainingIntensity >= threshold;
  const baseCost   = GameConfig.training.baseTrainingCostPerTurn[firm.type] ?? 0;
  const costPerTurn = baseCost * (firm.trainingIntensity / 100);

  // ---- Location ----
  const demandMult = (GameConfig.storeSlots.locationMultiplier[firm.locationClass] *
                      GameConfig.storeSlots.sizeMultiplier[firm.size]).toFixed(2);

  // ---- Charts ----
  const rev12  = firmRevByTurn(txs, firm.id, 12, currentTurn);
  const prof12 = firmProfitByTurn(txs, firm.id, 12, currentTurn);
  const rev12total  = rev12.reduce((s, v) => s + v, 0);
  const prof12total = prof12.reduce((s, v) => s + v, 0);

  const monoStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
  };
  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: 6, padding: "12px 14px", marginBottom: 8,
  };

  function commitRename() {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== firm.name) onRename(trimmed);
    else setNameInput(firm.name);
    setEditingName(false);
  }

  return (
    <div style={{
      width: 280, flexShrink: 0, borderRight: "1px solid var(--border)",
      overflowY: "auto", display: "flex", flexDirection: "column",
      background: "var(--bg-panel)",
    }}>
      <div style={{ padding: "10px 14px 0" }}>
        <button style={{ fontSize: 11, padding: "3px 10px", marginBottom: 10 }} onClick={onBack}>
          ← Map
        </button>
      </div>

      {/* ── Metadata card ── */}
      <div style={{ ...cardStyle, margin: "0 10px 8px" }}>
        {/* Editable firm name */}
        {editingName ? (
          <input
            autoFocus
            style={{ fontSize: 14, fontWeight: 700, width: "100%", marginBottom: 6, ...monoStyle }}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setNameInput(firm.name); setEditingName(false); } }}
          />
        ) : (
          <div
            style={{ fontSize: 14, fontWeight: 700, color: "var(--text-head)", marginBottom: 6, cursor: "text" }}
            onClick={() => { setNameInput(firm.name); setEditingName(true); }}
            title="Click to rename"
          >
            {firm.name}
          </div>
        )}

        {/* City · badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{city?.name ?? "—"}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
            background: "var(--gold-dim)", color: "var(--gold)", ...monoStyle,
          }}>
            {firm.locationClass}
          </span>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 3,
            background: "var(--bg)", color: "var(--text-dim)", ...monoStyle,
          }}>
            {firm.size}
          </span>
        </div>

        {/* Demand multiplier */}
        <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 10, ...monoStyle }}>
          Demand ×: <strong style={{ color: "var(--text)" }}>{demandMult}</strong>
        </div>

        {/* Staff balls */}
        <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 4, ...monoStyle, letterSpacing: "0.06em" }}>
          STAFF — {employeeCount} employees
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
          {Array.from({ length: ballCount }).map((_, i) => (
            <div key={i} style={{
              width: 9, height: 9, borderRadius: "50%",
              background: i < blueBalls ? "var(--blue)" : "var(--danger)",
              flexShrink: 0,
            }} />
          ))}
          <span style={{ fontSize: 9, color: "var(--text-dim)", marginLeft: 4, ...monoStyle }}>
            {blueBalls}/{ballCount} trained
          </span>
        </div>
      </div>

      {/* ── Training card ── */}
      <div style={{ ...cardStyle, margin: "0 10px 8px" }}>
        <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 8, letterSpacing: "0.08em", ...monoStyle }}>
          TRAINING
        </div>
        <input
          type="range" min={0} max={100} step={1}
          value={firm.trainingIntensity}
          onChange={(e) => onTrainingChange(parseInt(e.target.value))}
          style={{ width: "100%", accentColor: "var(--gold)", marginBottom: 4 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-dim)", ...monoStyle }}>
          <span style={{ color: improving ? "var(--green)" : "var(--danger)" }}>
            {improving ? "▲ Improving" : "▼ Decaying"}
          </span>
          <span>{firm.trainingIntensity}% · {euros(costPerTurn)}/t</span>
        </div>
        {firm.trainingIntensityOverridden && (
          <button
            style={{ fontSize: 9, marginTop: 6, padding: "1px 6px", color: "var(--text-dim)" }}
            onClick={onResetTraining}
          >
            Reset to corporate ({corp?.corporateTrainingIntensity ?? "?"}%)
          </button>
        )}
      </div>

      {/* ── Charts card ── */}
      <div style={{ ...cardStyle, margin: "0 10px 8px" }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 3, ...monoStyle }}>
            REVENUE 12t · <span style={{ color: "var(--green)" }}>{euros(rev12total)}</span>
          </div>
          <Sparkline data={rev12} color="var(--green)" width={220} height={32} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 3, ...monoStyle }}>
            PROFIT 12t · <span style={{ color: prof12total >= 0 ? "var(--gold)" : "var(--danger)" }}>{euros(prof12total)}</span>
          </div>
          <Sparkline data={prof12} color="var(--gold)" width={220} height={32} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Right sidebar — Built / Building / Build
// ============================================================

function RightSidebar({
  firm, onBuildInvestment, onCancelInvestment, invErrors,
}: {
  firm: Firm;
  onBuildInvestment: (type: InvestmentType) => void;
  onCancelInvestment: (investmentId: string) => void;
  invErrors: Record<string, string | null>;
}) {
  const monoStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
  };
  const dividerStyle: React.CSSProperties = {
    borderTop: "1px solid var(--border)", margin: "0 0 8px",
  };
  const sectionHead: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
    color: "var(--text-dim)", textTransform: "uppercase",
    ...monoStyle, marginBottom: 8,
  };

  const completed = firm.investments.filter((i) => i.status === "complete");
  const active    = firm.investments.filter((i) => i.status === "in_progress" || i.status === "queued");
  const validTypes = GameConfig.validInvestments.store as InvestmentType[];

  // Count existing completed per type
  const completedCount: Record<string, number> = {};
  for (const inv of firm.investments) {
    if (inv.status === "complete") completedCount[inv.type] = (completedCount[inv.type] ?? 0) + 1;
  }
  const activeCount: Record<string, number> = {};
  for (const inv of firm.investments) {
    if (inv.status !== "complete") activeCount[inv.type] = (activeCount[inv.type] ?? 0) + 1;
  }

  return (
    <div style={{
      width: 240, flexShrink: 0, borderLeft: "1px solid var(--border)",
      overflowY: "auto", background: "var(--bg-panel)",
    }}>
      <div style={{ padding: "12px 12px 20px" }}>

        {/* ── Built ── */}
        <div style={sectionHead}>Built</div>
        {completed.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 12, ...monoStyle }}>None yet</div>
        )}
        {completed.map((inv) => (
          <div key={inv.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            fontSize: 10, marginBottom: 4,
          }}>
            <span style={{ color: "var(--text-dim)", ...monoStyle }}>
              {inv.type.replace(/_/g, " ")}
            </span>
            <span style={{ color: "var(--green)", ...monoStyle }}>✓</span>
          </div>
        ))}

        <div style={dividerStyle} />

        {/* ── Building ── */}
        <div style={sectionHead}>Building</div>
        {active.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 12, ...monoStyle }}>Nothing building</div>
        )}
        {active.map((inv) => {
          const totalTurns = GameConfig.investments.buildTurns[inv.type] ?? 1;
          const doneT      = totalTurns - (inv.turnsRemaining ?? 0);
          const pct        = Math.round((doneT / totalTurns) * 100);
          const opCost     = GameConfig.investments.operatingCostPerTurn[inv.type] ?? 0;
          const sunkCost   = inv.costPaid ?? 0;
          const cancelLabel = sunkCost > 0
            ? `Cancel (${euros(sunkCost)} sunk)`
            : "Cancel";
          return (
            <div key={inv.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 10, ...monoStyle, marginBottom: 3 }}>
                <span style={{ color: "var(--text-dim)", flex: 1 }}>{inv.type.replace(/_/g, " ")}</span>
                <span style={{ color: "var(--gold)", marginLeft: 6 }}>
                  {inv.status === "queued" ? "queued" : `${inv.turnsRemaining}t`}
                </span>
              </div>
              {inv.status === "in_progress" && (
                <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginBottom: 2 }}>
                  <div style={{ height: 3, width: `${pct}%`, background: "var(--gold)", borderRadius: 2 }} />
                </div>
              )}
              {opCost > 0 && (
                <div style={{ fontSize: 9, color: "var(--text-dim)", ...monoStyle, marginBottom: 2 }}>{euros(opCost)}/t when complete</div>
              )}
              <button
                style={{
                  fontSize: 9, padding: "1px 6px", color: "var(--danger)",
                  background: "transparent", border: "1px solid var(--danger)",
                  borderRadius: 3, cursor: "pointer", marginTop: 2,
                }}
                onClick={() => onCancelInvestment(inv.id)}
              >
                {cancelLabel}
              </button>
            </div>
          );
        })}

        <div style={dividerStyle} />

        {/* ── Build ── */}
        <div style={sectionHead}>Build</div>
        {INVESTMENT_GROUPS.map((group) => {
          const available = group.types.filter((t) => {
            if (!validTypes.includes(t)) return false;
            // Expansion types require their parent section to be complete first.
            const baseSectionType = (Object.entries(SECTION_EXPANSION) as [InvestmentType, InvestmentType][])
              .find(([, expType]) => expType === t)?.[0];
            if (baseSectionType) {
              return firm.investments.some((i) => i.type === baseSectionType && i.status === "complete");
            }
            return true;
          });
          if (available.length === 0) return null;
          return (
            <div key={group.label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 4, ...monoStyle, letterSpacing: "0.05em" }}>
                — {group.label} —
              </div>
              {available.map((t) => {
                const maxP     = GameConfig.investments.maxPerFirm[t] ?? 1;
                const built    = completedCount[t] ?? 0;
                const inActive = activeCount[t] ?? 0;
                const atMax    = built >= maxP;
                const cost     = GameConfig.investments.cost[t];
                const turns    = GameConfig.investments.buildTurns[t];
                const err      = invErrors[t];
                return (
                  <div key={t} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        background: atMax ? "transparent" : "var(--bg-card)",
                        border: `1px solid ${atMax ? "var(--border)" : "var(--border)"}`,
                        borderRadius: 4, padding: "6px 8px",
                        opacity: atMax ? 0.5 : 1,
                        cursor: atMax ? "default" : "pointer",
                      }}
                      onClick={() => !atMax && onBuildInvestment(t)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 10, color: atMax ? "var(--text-dim)" : "var(--text-head)", ...monoStyle }}>
                          {t.replace(/_/g, " ")}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--gold)", ...monoStyle }}>
                          {atMax ? "max" : euros(cost)}
                        </span>
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-dim)", ...monoStyle, marginTop: 1 }}>
                        {INVESTMENT_DESCRIPTIONS[t] ?? ""}
                        {!atMax && ` · ${turns}t`}
                        {inActive > 0 && !atMax && " · queued"}
                      </div>
                    </div>
                    {err && (
                      <div style={{ fontSize: 9, color: "var(--danger)", marginTop: 2, paddingLeft: 4, ...monoStyle }}>
                        {err}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

      </div>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export default function StoreFirmOverview({ firmId, onBack }: { firmId: string; onBack: () => void }) {
  const {
    gameState, setRetailPrice, stopSelling,
    toggleHarborAutoSource, buildInvestment, cancelInvestment,
    setFirmTrainingIntensity, resetFirmTrainingIntensity, renameFirm,
  } = useGameStore();

  const [invErrors, setInvErrors] = useState<Record<string, string | null>>({});

  if (!gameState) return null;
  const firm = gameState.firms[firmId] as Firm | undefined;
  if (!firm || firm.type !== "store") return null;

  const city = gameState.cityNodes[firm.cityNodeId];
  const corp = gameState.corporations[firm.corporationId];

  const sectionTypes  = Object.keys(SECTION_LABEL) as InvestmentType[];
  const builtSections = sectionTypes.filter((t) =>
    firm.investments.some((i) => i.type === t && i.status === "complete"),
  );

  function handlePriceChange(p: ProductId, price: number) {
    setRetailPrice(firmId, p, price);
  }

  function handleStopSelling(p: ProductId) {
    stopSelling(firmId, p);
  }

  function handleAddProduct(p: ProductId, price: number) {
    toggleHarborAutoSource(firmId, p, true);
    setRetailPrice(firmId, p, price);
  }

  function handleBuildInvestment(type: InvestmentType) {
    const err = buildInvestment(firmId, type);
    setInvErrors((prev) => ({ ...prev, [type]: err }));
  }

  function handleCancelInvestment(investmentId: string) {
    cancelInvestment(firmId, investmentId);
  }

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "var(--bg)" }}>

      {/* ── Left column ── */}
      <LeftColumn
        firm={firm} city={city} corp={corp} gameState={gameState}
        onBack={onBack}
        onRename={(name) => renameFirm(firmId, name)}
        onTrainingChange={(v) => setFirmTrainingIntensity(firmId, v)}
        onResetTraining={() => resetFirmTrainingIntensity(firmId)}
      />

      {/* ── Center — product slots ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 40px" }}>
        {builtSections.length === 0 && (
          <div style={{
            textAlign: "center", marginTop: 60, fontSize: 13, color: "var(--text-dim)",
            fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          }}>
            No sections built yet.<br />Use the Build panel → to add one.
          </div>
        )}

        {builtSections.map((sectionType) => (
          <SectionGroup
            key={sectionType}
            sectionType={sectionType}
            firm={firm}
            gameState={gameState}
            onPriceChange={handlePriceChange}
            onStopSelling={handleStopSelling}
            onAddProduct={handleAddProduct}
            onBuildInvestment={handleBuildInvestment}
          />
        ))}

        {/* Add new section */}
        {sectionTypes.some((t) => !builtSections.includes(t)) && (
          <div style={{
            borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4,
            fontSize: 10, color: "var(--text-dim)",
            fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          }}>
            Add a section using the Build panel →
          </div>
        )}
      </div>

      {/* ── Right sidebar ── */}
      <RightSidebar
        firm={firm}
        onBuildInvestment={handleBuildInvestment}
        onCancelInvestment={handleCancelInvestment}
        invErrors={invErrors}
      />
    </div>
  );
}
