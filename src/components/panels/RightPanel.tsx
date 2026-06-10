import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { euros, pct, qty } from "../shared/fmt";
import { GameConfig } from "../../config/gameConfig";
import type { Firm, InvestmentType, ProductId } from "../../types";

export default function RightPanel() {
  const {
    gameState, selectedNodeId, selectedFirmId,
    selectFirm, buildFirm, buildInvestment,
  } = useGameStore();

  const [buildType, setBuildType] = useState<"farm" | "factory" | "store">("store");
  const [buildName, setBuildName] = useState("");
  const [buildError, setBuildError] = useState<string | null>(null);

  if (!gameState) return null;

  const node = selectedNodeId ? gameState.cityNodes[selectedNodeId] : null;
  const firm = selectedFirmId ? gameState.firms[selectedFirmId] : null;
  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);

  if (firm && playerCorp && firm.corporationId === playerCorp.id) {
    return <FirmPanel firm={firm} />;
  }

  if (!node) {
    return (
      <div style={panelStyle}>
        <div style={{ color: "var(--text-dim)", fontSize: 12, padding: 16 }}>
          Click a node or firm to inspect it.
        </div>
      </div>
    );
  }

  const firmsHere = Object.values(gameState.firms).filter(
    (f) => f.cityNodeId === node.id
  );
  const playerFirmsHere = firmsHere.filter(
    (f) => f.corporationId === playerCorp?.id
  );
  const slotsRemaining = node.firmSlots - firmsHere.length;

  function handleBuild() {
    if (!node) return;
    const name = buildName.trim() || `${buildType.charAt(0).toUpperCase() + buildType.slice(1)}`;
    const err = buildFirm(node.id, buildType, name);
    if (err) { setBuildError(err); }
    else { setBuildError(null); setBuildName(""); }
  }

  return (
    <div style={panelStyle}>
      <div style={sectionStyle}>
        <h2>{node.name}</h2>
        <span className={`tag tag-${node.type === "harbor" ? "blue" : "dim"}`}>
          {node.type}
        </span>
      </div>
      <hr />
      <div style={sectionStyle}>
        <Row label="Population" value={qty(node.population)} />
        <Row label="Energy cost" value={`${(node.energyCostMultiplier * 100).toFixed(0)}% of base`} />
        <Row label="Harbor access" value={node.hasHarborAccess ? "Yes" : "No"} />
        <Row label="Firm slots" value={`${firmsHere.length} / ${node.firmSlots}`} />
      </div>

      {firmsHere.length > 0 && (
        <>
          <hr />
          <h3 style={{ padding: "0 16px" }}>Firms</h3>
          <div style={{ padding: "4px 16px 8px" }}>
            {firmsHere.map((f) => {
              const isPlayer = f.corporationId === playerCorp?.id;
              return (
                <div
                  key={f.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 0", cursor: "pointer",
                  }}
                  onClick={() => selectFirm(selectedFirmId === f.id ? null : f.id)}
                >
                  <span style={{ fontSize: 14 }}>
                    {f.type === "farm" ? "🌾" : f.type === "factory" ? "🏭" : "🏪"}
                  </span>
                  <span style={{ flex: 1, color: "var(--text-head)" }}>{f.name}</span>
                  <span className={`tag tag-${isPlayer ? "gold" : "red"}`}>
                    {isPlayer ? "Yours" : "Rival"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {node.firmSlots > 0 && slotsRemaining > 0 && playerCorp && (
        <>
          <hr />
          <div style={sectionStyle}>
            <h3>Build a firm</h3>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {(["farm", "factory", "store"] as const).map((t) => (
                <button
                  key={t}
                  style={buildType === t ? { borderColor: "var(--accent)" } : {}}
                  onClick={() => setBuildType(t)}
                >
                  {t === "farm" ? "🌾" : t === "factory" ? "🏭" : "🏪"} {t}
                </button>
              ))}
            </div>
            <input
              style={{ width: "100%", marginTop: 6 }}
              placeholder="Firm name (optional)"
              value={buildName}
              onChange={(e) => setBuildName(e.target.value)}
            />
            <div style={{ marginTop: 4, color: "var(--text-dim)", fontSize: 11 }}>
              Cost: {euros({ farm: 15000, factory: 25000, store: 10000 }[buildType])}
              {" · "}Cash: {euros(playerCorp.cash)}
            </div>
            {buildError && (
              <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>{buildError}</div>
            )}
            <button className="primary" style={{ marginTop: 8, width: "100%" }} onClick={handleBuild}>
              Build {buildType}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Firm detail panel
// ------------------------------------------------------------------

function FirmPanel({ firm }: { firm: Firm }) {
  const { gameState, buildInvestment, addContract } = useGameStore();
  const [invError, setInvError] = useState<string | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);

  if (!gameState) return null;

  const investmentsByType = firm.investments.reduce<Record<string, number>>(
    (acc, inv) => {
      if (inv.status !== "not_built") acc[inv.type] = (acc[inv.type] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const availableInvestments = getAvailableInvestments(firm.type, gameState.barcodeAvailable);
  const activeSlots = firm.investments.filter((i) => i.status !== "not_built").length;
  const slotsLeft = GameConfig.firmInvestmentSlotLimit - activeSlots;

  function handleInvest(type: InvestmentType) {
    const err = buildInvestment(firm.id, type);
    if (err) setInvError(err);
    else setInvError(null);
  }

  return (
    <div style={panelStyle}>
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>
            {firm.type === "farm" ? "🌾" : firm.type === "factory" ? "🏭" : "🏪"}
          </span>
          <h2>{firm.name}</h2>
        </div>
        <span className="tag tag-gold">Yours</span>
      </div>
      <hr />
      <div style={sectionStyle}>
        <Row label="Quality" value={pct(firm.quality)} />
        <Row label="Investment slots" value={`${activeSlots} / ${GameConfig.firmInvestmentSlotLimit} used`} />
      </div>

      {firm.investments.filter((i) => i.status !== "not_built").length > 0 && (
        <>
          <hr />
          <h3 style={{ padding: "0 16px" }}>Investments</h3>
          <div style={{ padding: "4px 16px 8px" }}>
            {firm.investments
              .filter((i) => i.status !== "not_built")
              .map((inv) => (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "var(--text)" }}>{inv.type.replace(/_/g, " ")}</span>
                  <span className={`tag tag-${inv.status === "complete" ? "green" : "dim"}`}>
                    {inv.status === "in_progress" ? `${inv.turnsRemaining}t` : "✓"}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}

      {firm.inventory.filter((l) => l.quantity > 0).length > 0 && (
        <>
          <hr />
          <h3 style={{ padding: "0 16px" }}>Inventory</h3>
          <div style={{ padding: "4px 16px 8px" }}>
            {firm.inventory
              .filter((l) => l.quantity > 0)
              .map((line) => (
                <div key={line.product} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span>{line.product.replace(/_/g, " ")}</span>
                  <span style={{ color: "var(--text-dim)" }}>
                    {qty(line.quantity)} @ {euros(line.unitCost)}/u
                  </span>
                </div>
              ))}
          </div>
        </>
      )}

      <HarborSourcingSection
        firm={firm}
        contractError={contractError}
        setContractError={setContractError}
        addContract={addContract}
      />

      {slotsLeft > 0 && (
        <>
          <hr />
          <div style={sectionStyle}>
            <h3>Add investment ({slotsLeft} slots left)</h3>
            {invError && (
              <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>{invError}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {availableInvestments.map(({ type, label }) => {
                const cost = GameConfig.investments.cost[type];
                const count = investmentsByType[type] ?? 0;
                const max = GameConfig.investments.maxPerFirm[type];
                const atMax = count >= max;
                return (
                  <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: atMax ? "var(--text-dim)" : "var(--text)" }}>
                      {label} {count > 0 ? `(${count}/${max})` : ""}
                    </span>
                    <button
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      disabled={atMax}
                      onClick={() => handleInvest(type)}
                    >
                      {euros(cost)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Harbor sourcing
// ------------------------------------------------------------------

const HARBOR_SOURCEABLE: Record<"farm" | "factory" | "store", { product: ProductId; label: string }[]> = {
  farm: [],
  factory: [
    { product: "bauxite", label: "Bauxite" },
    { product: "laptop_whitelabel", label: "White-label laptops" },
  ],
  store: [
    { product: "ice_cream_strawberry", label: "Strawberry ice cream" },
    { product: "printer_branded", label: "Branded printers" },
    { product: "chicken", label: "Chicken (processed)" },
    { product: "chicken_soup", label: "Chicken soup" },
    { product: "laptop_branded", label: "Branded laptops" },
  ],
};

function HarborSourcingSection({
  firm,
  contractError,
  setContractError,
  addContract,
}: {
  firm: Firm;
  contractError: string | null;
  setContractError: (e: string | null) => void;
  addContract: ReturnType<typeof useGameStore>["addContract"];
}) {
  const { gameState } = useGameStore();
  const [selectedProduct, setSelectedProduct] = useState<ProductId | "">("");
  const [volumePerTurn, setVolumePerTurn] = useState("50");
  const [duration, setDuration] = useState("4");

  if (!gameState) return null;

  const sourceable = HARBOR_SOURCEABLE[firm.type];
  if (sourceable.length === 0) return null;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  // Show existing active harbor contracts for this firm
  const activeHarborContracts = firm.activeContractIds
    .map((id) => gameState.contracts[id])
    .filter((c) => c && c.status === "active" && c.sellerParty.type === "harbor");

  const harborPrice = selectedProduct
    ? (gameState.harborNode.prices[selectedProduct as ProductId] ?? 0)
    : 0;
  const vol = parseInt(volumePerTurn) || 0;
  const dur = parseInt(duration) || 0;
  const totalCostPerTurn = harborPrice * vol;

  function handleCreate() {
    if (!selectedProduct) { setContractError("Select a product."); return; }
    if (vol <= 0) { setContractError("Enter a valid volume."); return; }
    if (dur <= 0) { setContractError("Enter a valid duration."); return; }

    const err = addContract({
      status: "active",
      buyerParty: { type: "corporation", corporationId: playerCorp!.id, firmId: firm.id },
      sellerParty: { type: "harbor", corporationId: null, firmId: null },
      product: selectedProduct as ProductId,
      volumePerTurn: vol,
      unitPrice: harborPrice,
      qualityThreshold: 0,
      deliveryTurns: 1,
      startTurn: gameState.turn,
      durationTurns: dur,
      isInternal: false,
    });

    if (err) {
      setContractError(err);
    } else {
      setContractError(null);
      setSelectedProduct("");
      setVolumePerTurn("50");
    }
  }

  return (
    <>
      <hr />
      <div style={sectionStyle}>
        <h3>Source from harbor</h3>

        {activeHarborContracts.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {activeHarborContracts.map((c) => (
              <div key={c.id} style={{
                display: "flex", justifyContent: "space-between",
                padding: "4px 0", fontSize: 11, color: "var(--text-dim)",
              }}>
                <span style={{ color: "var(--text)" }}>{c.product.replace(/_/g, " ")}</span>
                <span>{qty(c.volumePerTurn)}u/turn @ {euros(c.unitPrice)}/u</span>
                <span className="tag tag-green">{c.durationTurns - c.turnsExecuted}t left</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          <div>
            <label style={labelStyle}>Product</label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value as ProductId)}
              style={{ width: "100%" }}
            >
              <option value="">— select —</option>
              {sourceable.map(({ product, label }) => (
                <option key={product} value={product}>{label}</option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <div style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--bg)", padding: "6px 8px", borderRadius: 4 }}>
              Harbor price: <strong style={{ color: "var(--text-head)" }}>{euros(harborPrice)}/u</strong>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Units/turn</label>
              <input type="number" value={volumePerTurn}
                onChange={(e) => setVolumePerTurn(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Turns</label>
              <input type="number" value={duration}
                onChange={(e) => setDuration(e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>

          {vol > 0 && harborPrice > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Cost: {euros(totalCostPerTurn)}/turn · {euros(totalCostPerTurn * dur)} total
            </div>
          )}

          {contractError && (
            <div style={{ color: "var(--danger)", fontSize: 11 }}>{contractError}</div>
          )}

          <button className="primary" onClick={handleCreate}>
            Create supply contract
          </button>
        </div>
      </div>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "var(--text-dim)", marginBottom: 3,
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ color: "var(--text-head)" }}>{value}</span>
    </div>
  );
}

function getAvailableInvestments(
  firmType: "farm" | "factory" | "store",
  barcodeAvailable: boolean
): { type: InvestmentType; label: string }[] {
  if (firmType === "farm") return [
    { type: "crop_fields", label: "Crop fields" },
    { type: "livestock_facilities", label: "Livestock facilities" },
    { type: "irrigation_systems", label: "Irrigation systems" },
    { type: "cold_storage", label: "Cold storage" },
    { type: "processing_yard_farm", label: "Processing yard" },
    { type: "seasonal_planning_unit", label: "Seasonal planning unit" },
    { type: "training_farm", label: "Training program" },
  ];
  if (firmType === "factory") return [
    { type: "production_line", label: "Production line" },
    { type: "storage_facilities", label: "Storage facilities" },
    { type: "packaging_lines", label: "Packaging lines" },
    { type: "quality_lab", label: "Quality lab" },
    { type: "logistics_hub", label: "Logistics hub" },
    { type: "processing_unit", label: "Processing unit" },
    { type: "branding_facility", label: "Branding facility" },
    { type: "training_factory", label: "Training program" },
    ...(barcodeAvailable ? [{ type: "barcode_scanning" as InvestmentType, label: "Barcode scanning" }] : []),
  ];
  return [
    { type: "grocery_section", label: "Grocery section" },
    { type: "electronics_section", label: "Electronics section" },
    { type: "cosmetics_section", label: "Cosmetics section" },
    { type: "hardware_section", label: "Hardware section" },
    { type: "clothing_section", label: "Clothing section" },
    { type: "pharmacy_section", label: "Pharmacy section" },
    { type: "warehouse_capacity", label: "Warehouse capacity" },
    { type: "training_store", label: "Training program" },
    ...(barcodeAvailable ? [{ type: "barcode_scanning" as InvestmentType, label: "Barcode scanning" }] : []),
  ];
}

const panelStyle: React.CSSProperties = {
  height: "100%",
  overflowY: "auto",
  background: "var(--bg-panel)",
};

const sectionStyle: React.CSSProperties = {
  padding: "12px 16px",
};
