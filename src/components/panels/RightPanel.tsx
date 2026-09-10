import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { euros, pct, qty } from "../shared/fmt";
import { GameConfig } from "../../config/gameConfig";
import { estimatedDemand } from "../../engine/retail";
import { getHarborSoldProducts } from "../../engine/harbor";
import { transportCostToNode, linksToHarbor } from "../../engine/utils";
import { displayName, getProductsHandledBy } from "../../engine/products";
import type { Firm, FirmType, InvestmentType, ProductId, RecipeKey } from "../../types";

export default function RightPanel() {
  const {
    gameState, selectedNodeId, selectedFirmId,
    selectFirm, buildFirm, openStoreFirm,
  } = useGameStore();

  const [buildType, setBuildType] = useState<"farm" | "factory" | "store">("store");
  const [buildName, setBuildName] = useState("");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  if (!gameState) return null;

  const node = selectedNodeId ? gameState.cityNodes[selectedNodeId] : null;
  const firm = selectedFirmId ? gameState.firms[selectedFirmId] : null;
  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);

  // Store firms open the full-screen overview — handled in App.tsx via openStoreFirm
  if (firm && playerCorp && firm.corporationId === playerCorp.id && firm.type !== "store") {
    return <FirmPanel firm={firm} />;
  }

  if (!node) {
    return (
      <div style={panelStyle}>
        <div style={{ color: "var(--text-dim)", fontSize: 12, padding: 16 }}>
          Select a city to view and manage firms.
        </div>
      </div>
    );
  }

  const firmsHere = Object.values(gameState.firms).filter(
    (f) => f.cityNodeId === node.id
  );
  const nonStoreFirmsHere = firmsHere.filter((f) => f.type !== "store");
  const factorySlotsRemaining = node.factorySlots - nonStoreFirmsHere.length;

  // Derive free/total per class from atomic location list
  const freeByClass = { A: 0, B: 0, C: 0 };
  const totalByClass = { A: 0, B: 0, C: 0 };
  for (const loc of node.storeLocations) {
    totalByClass[loc.locationClass]++;
    if (loc.occupiedByFirmId === null) freeByClass[loc.locationClass]++;
  }
  const hasAnyStoreLocs = node.storeLocations.length > 0;

  const selectedLoc = selectedLocationId
    ? node.storeLocations.find((l) => l.id === selectedLocationId) ?? null
    : null;
  const canBuildStore = selectedLoc !== null && selectedLoc.occupiedByFirmId === null;
  const canBuildProduction = factorySlotsRemaining > 0;

  function handleBuild() {
    if (!node) return;
    const name = buildName.trim() || `${buildType.charAt(0).toUpperCase() + buildType.slice(1)}`;
    const err = buildType === "store"
      ? buildFirm(node.id, buildType, name, selectedLocationId ?? undefined)
      : buildFirm(node.id, buildType, name);
    if (err) { setBuildError(err); }
    else { setBuildError(null); setBuildName(""); setSelectedLocationId(null); }
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
        <Row label="Harbor access" value={node.type === "port" || node.type === "harbor" ? "Port city" : "No"} />
        <Row label="Factory slots" value={`${Object.values(gameState.firms).filter(f => f.cityNodeId === node.id && f.type !== "store").length} / ${node.factorySlots}`} />
        {(["A", "B", "C"] as const).map((cls) => totalByClass[cls] > 0 && (
          <Row key={cls} label={`Store locations ${cls}`} value={`${freeByClass[cls]} free / ${totalByClass[cls]}`} />
        ))}
      </div>

      {firmsHere.length > 0 && (
        <>
          <hr />
          <h3 style={{ padding: "0 16px" }}>Firms</h3>
          <div style={{ padding: "4px 16px 8px" }}>
            {firmsHere.map((f) => {
              const isPlayer = f.corporationId === playerCorp?.id;
              const isStore = f.type === "store";
              return (
                <div
                  key={f.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 0", cursor: "pointer",
                  }}
                  onClick={() => {
                    if (isStore && isPlayer) {
                      openStoreFirm(f.id);
                    } else {
                      selectFirm(selectedFirmId === f.id ? null : f.id);
                    }
                  }}
                >
                  <span style={{ fontSize: 14 }}>
                    {f.type === "farm" ? "🌾" : f.type === "factory" ? "🏭" : "🏪"}
                  </span>
                  <span style={{ flex: 1, color: "var(--text-head)" }}>{f.name}</span>
                  {isStore && isPlayer && (
                    <span style={{ fontSize: 10, color: "var(--accent)" }}>
                      {f.locationClass} · {f.size}
                    </span>
                  )}
                  <span className={`tag tag-${isPlayer ? "gold" : "red"}`}>
                    {isPlayer ? "Yours" : "Rival"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {(node.factorySlots > 0 || hasAnyStoreLocs) && playerCorp && (
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

            {buildType === "store" && (
              <>
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Select a location</label>
                  {(["A", "B", "C"] as const).map((cls) => {
                    const locsInClass = node.storeLocations.filter((l) => l.locationClass === cls);
                    if (locsInClass.length === 0) return null;
                    // Group free locations by size within this class
                    const bySize: Partial<Record<"small" | "medium" | "large", { free: number; first: string | null }>> = {};
                    for (const loc of locsInClass) {
                      if (!bySize[loc.size]) bySize[loc.size] = { free: 0, first: null };
                      if (loc.occupiedByFirmId === null) {
                        bySize[loc.size]!.free++;
                        if (!bySize[loc.size]!.first) bySize[loc.size]!.first = loc.id;
                      }
                    }
                    return (
                      <div key={cls} style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 2 }}>{cls}-class</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(["large", "medium", "small"] as const).map((sz) => {
                            const entry = bySize[sz];
                            if (!entry) return null;
                            const isSel = entry.first !== null && selectedLocationId === entry.first;
                            const cost = entry.first
                              ? GameConfig.storeSlots.locationClassCost[cls] + GameConfig.storeSlots.buildCostBySize[sz]
                              : 0;
                            return (
                              <button
                                key={sz}
                                style={{
                                  fontSize: 10, padding: "3px 8px",
                                  borderColor: isSel ? "var(--accent)" : undefined,
                                  opacity: entry.free === 0 ? 0.4 : 1,
                                }}
                                disabled={entry.free === 0}
                                onClick={() => entry.first && setSelectedLocationId(entry.first)}
                              >
                                {sz}
                                <div style={{ fontSize: 9, color: "var(--text-dim)" }}>
                                  {entry.free} free · €{cost.toLocaleString()}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {!selectedLoc && (
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                      Pick a location above
                    </div>
                  )}
                </div>
              </>
            )}

            {buildType !== "store" && canBuildProduction === false && (
              <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 6 }}>
                No production slots remaining.
              </div>
            )}

            <input
              style={{ width: "100%", marginTop: 6 }}
              placeholder="Firm name (optional)"
              value={buildName}
              onChange={(e) => setBuildName(e.target.value)}
            />
            <div style={{ marginTop: 4, color: "var(--text-dim)", fontSize: 11 }}>
              {buildType === "store" && selectedLoc ? (
                <>
                  Location ({selectedLoc.locationClass}): {euros(GameConfig.storeSlots.locationClassCost[selectedLoc.locationClass])}
                  {" + "}Size ({selectedLoc.size}): {euros(GameConfig.storeSlots.buildCostBySize[selectedLoc.size])}
                  {" = "}
                  <strong style={{ color: "var(--text)" }}>
                    {euros(GameConfig.storeSlots.locationClassCost[selectedLoc.locationClass] + GameConfig.storeSlots.buildCostBySize[selectedLoc.size])}
                  </strong> total
                </>
              ) : buildType !== "store" ? (
                <>Cost: {euros({ farm: 15000, factory: 25000 }[buildType])}</>
              ) : null}
              {" · "}Cash: {euros(playerCorp.cash)}
            </div>
            {buildError && (
              <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>{buildError}</div>
            )}
            <button
              className="primary"
              style={{ marginTop: 8, width: "100%" }}
              disabled={buildType === "store" ? !canBuildStore : !canBuildProduction}
              onClick={handleBuild}
            >
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
  const {
    gameState, buildInvestment, cancelInvestment,
    configureProductionLine, cancelPendingRecipeChange, markLineIntentionallyIdle,
    addContract, setSellToCompetitors,
    setFirmTrainingIntensity, resetFirmTrainingIntensity,
  } = useGameStore();
  const [invError, setInvError] = useState<string | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);

  if (!gameState) return null;

  const investmentsByType = firm.investments.reduce<Record<string, number>>(
    (acc, inv) => {
      acc[inv.type] = (acc[inv.type] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const availableInvestments = getAvailableInvestments(firm.type, gameState.barcodeAvailable);
  const slotLimit = firm.type === "store"
    ? GameConfig.storeSlots.investmentSlotsBySize[firm.size]
    : GameConfig.firmInvestmentSlotLimit;
  const slotsLeft = slotLimit - firm.investments.length;

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
          <h2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{firm.name}</h2>
        </div>
        <span className="tag tag-gold">Yours</span>
      </div>
      <hr />
      <div style={sectionStyle}>
        <Row label="Investment slots" value={`${firm.investments.length} / ${slotLimit} used`} />
      </div>

      {firm.investments.length > 0 && (
        <>
          <hr />
          <h3 style={{ padding: "0 16px" }}>Investments</h3>
          <div style={{ padding: "4px 16px 8px" }}>
            {firm.investments.map((inv) => {
              const lineSetup = inv.type === "production_line"
                ? firm.productionLines.find((l) => l.investmentId === inv.id)
                : undefined;
              return (
                <div key={inv.id} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--text)", flex: 1, fontSize: 11 }}>{inv.type.replace(/_/g, " ")}</span>
                    <span className={`tag tag-${
                      inv.status !== "complete" ? "dim"
                      : !lineSetup ? "green"
                      : lineSetup.lineStatus === "active" ? "green"
                      : lineSetup.lineStatus === "starting_up" ? "gold"
                      : "dim"
                    }`} style={{ flexShrink: 0 }}>
                      {inv.status === "queued"      ? "queued" :
                       inv.status === "in_progress" ? `building ${inv.turnsRemaining}t` :
                       !lineSetup                   ? "✓" :
                       lineSetup.lineStatus === "active"      ? (lineSetup.recipe?.replace(/_/g, " ") ?? "✓") :
                       lineSetup.lineStatus === "starting_up" ? `startup ${lineSetup.startupTurnsRemaining}t` :
                       "idle"}
                    </span>
                    {(inv.status === "queued" || inv.status === "in_progress") && (
                      <button
                        style={{ fontSize: 10, padding: "1px 6px", color: "var(--danger)", flexShrink: 0 }}
                        onClick={() => cancelInvestment(firm.id, inv.id)}
                      >✕</button>
                    )}
                  </div>
                  {/* Per-line quality */}
                  {lineSetup && lineSetup.lineStatus !== "unconfigured" && (
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2, paddingLeft: 2 }}>
                      Quality: {pct(lineSetup.quality)}
                    </div>
                  )}
                  {/* Production line recipe configuration */}
                  {lineSetup && inv.status === "complete" && (
                    <ProductionLineConfig
                      lineSetup={lineSetup}
                      onConfigure={(recipe) => configureProductionLine(firm.id, inv.id, recipe)}
                      onCancelPending={() => cancelPendingRecipeChange(firm.id, inv.id)}
                      onMarkIdle={() => markLineIntentionallyIdle(firm.id, inv.id)}
                    />
                  )}
                </div>
              );
            })}
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
                  <span>{displayName(line.product as ProductId)}</span>
                  <span style={{ color: "var(--text-dim)" }}>
                    {qty(line.quantity)} @ {euros(line.unitCost)}/u
                  </span>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Training intensity */}
      {(() => {
        const playerCorp = Object.values(gameState!.corporations).find((c) => c.isPlayer);
        if (!playerCorp) return null;
        const corp = gameState!.corporations[firm.corporationId];
        if (!corp) return null;
        const threshold = GameConfig.training.qualityThreshold;
        const improving = firm.trainingIntensity >= threshold;
        const baseCost = GameConfig.training.baseTrainingCostPerTurn[firm.type] ?? 0;
        const costPerTurn = baseCost * (firm.trainingIntensity / 100);
        return (
          <>
            <hr />
            <div style={sectionStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <h3>Training</h3>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: improving ? "var(--green)" : "var(--danger)",
                }}>
                  {improving ? "▲ Quality improving" : "▼ Quality decaying"}
                </span>
              </div>
              {firm.trainingIntensityOverridden && (
                <div style={{ fontSize: 10, color: "var(--gold)", marginBottom: 4 }}>
                  Override active — corporate default: {corp.corporateTrainingIntensity}%
                </div>
              )}
              <input
                type="range" min={0} max={100} step={1}
                value={firm.trainingIntensity}
                onChange={(e) => setFirmTrainingIntensity(firm.id, parseInt(e.target.value))}
                style={{ width: "100%", accentColor: "var(--gold)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                <span>0%</span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{firm.trainingIntensity}%</span>
                <span>100%</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                Cost: {euros(costPerTurn)}/turn
                {" · "}Threshold: {threshold}%
              </div>
              {firm.trainingIntensityOverridden && (
                <button
                  style={{ marginTop: 6, fontSize: 10, padding: "2px 8px" }}
                  onClick={() => resetFirmTrainingIntensity(firm.id)}
                >
                  Reset to corporate default ({corp.corporateTrainingIntensity}%)
                </button>
              )}
            </div>
          </>
        );
      })()}

      {/* Sell to competitors toggle (farms + factories) */}
      {(firm.type === "farm" || firm.type === "factory") && (
        <>
          <hr />
          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3>Sell to competitors</h3>
                <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 2 }}>
                  Allow rivals to source from this firm at spot price
                </div>
              </div>
              <button
                style={{ borderColor: firm.sellToCompetitors ? "var(--green)" : undefined }}
                onClick={() => setSellToCompetitors(firm.id, !firm.sellToCompetitors)}
              >
                {firm.sellToCompetitors ? "✓ Enabled" : "Disabled"}
              </button>
            </div>
          </div>
        </>
      )}

      {firm.type !== "store" && (
        <HarborSourcingSection
          firm={firm}
          contractError={contractError}
          setContractError={setContractError}
          addContract={addContract}
        />
      )}

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

/**
 * Products the harbor sells that the given firm type can handle.
 * Derived entirely from the registry — no hardcoded lists.
 */
function harborSourceable(firmType: FirmType): { product: ProductId; label: string }[] {
  const handledByFirm = new Set(getProductsHandledBy(firmType));
  return getHarborSoldProducts()
    .filter((p) => handledByFirm.has(p))
    .map((p) => ({ product: p, label: displayName(p) }));
}

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

  const sourceable = harborSourceable(firm.type);
  if (sourceable.length === 0) return null;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  const city = gameState.cityNodes[firm.cityNodeId];
  const transportCostPerUnit = transportCostToNode(gameState, firm.cityNodeId);

  // Show existing active harbor contracts for this firm
  const activeHarborContracts = Object.values(gameState.contracts)
    .filter((c) => c.status === "active" && c.sellerParty.type === "harbor" && c.buyerParty.firmId === firm.id);

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
                <span style={{ color: "var(--text)" }}>{displayName(c.product)}</span>
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
            <div style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--bg)", padding: "6px 8px", borderRadius: 4, display: "flex", flexDirection: "column", gap: 2 }}>
              <span>Harbor price: <strong style={{ color: "var(--text-head)" }}>{euros(harborPrice)}/u</strong></span>
              {transportCostPerUnit > 0 && (
                <span style={{ color: "var(--warn)" }}>
                  + transport: {euros(transportCostPerUnit)}/u ({linksToHarbor(gameState, firm.cityNodeId)} links)
                </span>
              )}
              <span>Landed cost: <strong style={{ color: "var(--text-head)" }}>{euros(harborPrice + transportCostPerUnit)}/u</strong></span>
              {city && selectedProduct && (
                <span style={{ color: "var(--green)" }}>
                  Est. demand: {qty(estimatedDemand(city.population, selectedProduct as ProductId))} units/turn
                </span>
              )}
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

const INVESTMENT_LABELS: Record<InvestmentType, string> = {
  crop_fields:           "Crop fields",
  livestock_facilities:  "Livestock facilities",
  irrigation_systems:    "Irrigation systems",
  cold_storage:          "Cold storage",
  processing_yard_farm:  "Processing yard",
  seasonal_planning_unit:"Seasonal planning unit",
  training_farm:         "Training program",
  production_line:       "Production line",
  storage_facilities:    "Storage facilities",
  packaging_lines:       "Packaging lines",
  quality_lab:           "Quality lab",
  logistics_hub:         "Logistics hub",
  processing_unit:       "Processing unit",
  branding_facility:     "Branding facility",
  training_factory:      "Training program",
  barcode_scanning:      "Barcode scanning",
  grocery_section:       "Grocery section",
  cosmetics_section:     "Cosmetics section",
  hardware_section:      "Hardware section",
  electronics_section:   "Electronics section",
  clothing_section:      "Clothing section",
  pharmacy_section:      "Pharmacy section",
  warehouse_capacity:    "Warehouse capacity",
  training_store:        "Training program",
  grocery_section_expansion:     "Grocery expansion",
  electronics_section_expansion: "Electronics expansion",
};

function getAvailableInvestments(
  firmType: FirmType,
  barcodeAvailable: boolean
): { type: InvestmentType; label: string }[] {
  const valid = (GameConfig.validInvestments[firmType] as InvestmentType[]);
  return valid
    .filter((type) => type !== "barcode_scanning" || barcodeAvailable)
    .map((type) => ({ type, label: INVESTMENT_LABELS[type] ?? type.replace(/_/g, " ") }));
}

// ------------------------------------------------------------------
// Production line recipe configuration widget
// ------------------------------------------------------------------

const RECIPE_OPTIONS: { key: RecipeKey; label: string }[] = [
  { key: "chicken",           label: "Chicken processing" },
  { key: "chicken_soup",      label: "Chicken soup" },
  { key: "alumina_refining",  label: "Alumina refining" },
  { key: "aluminium_smelting",label: "Aluminium smelting" },
  { key: "laptop_branding",   label: "Laptop branding" },
];

function ProductionLineConfig({
  lineSetup, onConfigure, onCancelPending, onMarkIdle,
}: {
  lineSetup: import("../../types").ProductionLineSetup;
  onConfigure: (recipe: RecipeKey) => void;
  onCancelPending: () => void;
  onMarkIdle: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [selected, setSelected]     = useState<RecipeKey | "">(lineSetup.recipe ?? "");

  if (lineSetup.lineStatus === "starting_up") {
    return (
      <div style={{ fontSize: 10, color: "var(--warn)", paddingLeft: 4, marginTop: 2 }}>
        Commissioning: {lineSetup.startupTurnsRemaining} turn{lineSetup.startupTurnsRemaining !== 1 ? "s" : ""} remaining
      </div>
    );
  }

  if (lineSetup.lineStatus === "active" && !showPicker) {
    return (
      <div style={{ fontSize: 10, color: "var(--text-dim)", paddingLeft: 4, marginTop: 2 }}>
        {lineSetup.pendingRecipe ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span>
              Currently: <strong>{lineSetup.recipe?.replace(/_/g, " ")}</strong>
              {" → "}Changing to: <strong style={{ color: "var(--warn)" }}>{lineSetup.pendingRecipe.replace(/_/g, " ")}</strong> next turn
            </span>
            <button style={{ fontSize: 10, padding: "1px 6px", color: "var(--danger)", alignSelf: "flex-start" }} onClick={onCancelPending}>
              Cancel change
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Recipe: {lineSetup.recipe?.replace(/_/g, " ")}</span>
            <button style={{ fontSize: 10, padding: "1px 6px" }} onClick={() => { setSelected(lineSetup.recipe ?? ""); setShowPicker(true); }}>
              Change
            </button>
          </div>
        )}
      </div>
    );
  }

  // unconfigured, starting_up (after reconfigure), or recipe picker open for active line
  return (
    <div style={{ marginTop: 4, paddingLeft: 4, display: "flex", flexDirection: "column", gap: 4 }}>
      {lineSetup.lineStatus === "unconfigured" && (
        <div style={{ fontSize: 10, color: lineSetup.intentionallyIdle ? "var(--text-dim)" : "var(--warn)" }}>
          {lineSetup.intentionallyIdle ? "Intentionally idle" : "⚠ Unconfigured — select a recipe"}
        </div>
      )}
      {showPicker && (
        <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
          Queued change (takes effect next turn):
        </div>
      )}
      <div style={{ display: "flex", gap: 4 }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as RecipeKey)}
          style={{ flex: 1, fontSize: 10 }}
        >
          <option value="">— select recipe —</option>
          {RECIPE_OPTIONS.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <button
          style={{ fontSize: 10, padding: "2px 8px" }}
          disabled={!selected}
          onClick={() => { if (selected) { onConfigure(selected as RecipeKey); setShowPicker(false); } }}
        >
          {lineSetup.lineStatus === "active" ? "Queue" : "Start"}
        </button>
        {showPicker && (
          <button style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => setShowPicker(false)}>✕</button>
        )}
      </div>
      {lineSetup.lineStatus === "unconfigured" && !lineSetup.intentionallyIdle && (
        <button style={{ fontSize: 10, padding: "1px 6px", color: "var(--text-dim)" }} onClick={onMarkIdle}>
          Mark as intentionally idle
        </button>
      )}
    </div>
  );
}


const panelStyle: React.CSSProperties = {
  height: "100%",
  overflowY: "auto",
  background: "var(--bg-panel)",
};

const sectionStyle: React.CSSProperties = {
  padding: "12px 16px",
};
