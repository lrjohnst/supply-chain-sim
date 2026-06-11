import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { euros, qty } from "../shared/fmt";
import { displayName } from "../../engine/products";
import type { ProductId } from "../../types";

export default function TenderBoard() {
  const { gameState, bidOnTender } = useGameStore();
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);
  const [bidVolume, setBidVolume] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [bidFirmId, setBidFirmId] = useState("");
  const [bidError, setBidError] = useState<string | null>(null);

  if (!gameState) return null;

  const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return null;

  const openTenders = Object.values(gameState.tenders).filter((t) => t.status === "open");
  const closedTenders = Object.values(gameState.tenders).filter((t) => t.status !== "open");
  const playerFirms = playerCorp.firmIds.map((id) => gameState.firms[id]).filter(Boolean);

  const selectedTender = selectedTenderId ? gameState.tenders[selectedTenderId] : null;
  const existingBid = selectedTender?.bids.find((b) => b.corporationId === playerCorp.id);

  function handleBid() {
    if (!selectedTenderId) return;
    const firm = bidFirmId || playerFirms[0]?.id;
    if (!firm) { setBidError("Select a firm to bid from."); return; }
    const vol = parseFloat(bidVolume);
    const price = parseFloat(bidPrice);
    if (isNaN(vol) || vol <= 0) { setBidError("Enter a valid volume."); return; }
    if (isNaN(price) || price <= 0) { setBidError("Enter a valid price."); return; }
    const err = bidOnTender(selectedTenderId, firm, vol, price);
    if (err) setBidError(err);
    else { setBidError(null); setBidVolume(""); setBidPrice(""); }
  }

  const turnLabel = (turn: number) => {
    const year = 1980 + Math.floor(turn / 4);
    const q = (turn % 4) + 1;
    return `${year} Q${q}`;
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* Tender list */}
      <div style={{
        width: 340,
        borderRight: "1px solid var(--border)",
        overflowY: "auto",
        flexShrink: 0,
      }}>
        <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid var(--border)" }}>
          <h2>Tender Board</h2>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 2 }}>
            {openTenders.length} open tender{openTenders.length !== 1 ? "s" : ""}
          </div>
        </div>

        {openTenders.length === 0 && (
          <div style={{ padding: 16, color: "var(--text-dim)", fontSize: 12 }}>
            No open tenders. Check back after a macro event.
          </div>
        )}

        {openTenders.map((tender) => {
          const myBid = tender.bids.find((b) => b.corporationId === playerCorp.id);
          return (
            <div
              key={tender.id}
              onClick={() => setSelectedTenderId(tender.id === selectedTenderId ? null : tender.id)}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background: tender.id === selectedTenderId ? "var(--bg-hover)" : "transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-head)", fontWeight: 600 }}>
                  {displayName(tender.product as ProductId)}
                </span>
                <span className={`tag tag-${tender.direction === "market" ? "blue" : "gold"}`}>
                  {tender.direction === "market" ? "Market" : "Sourcing"}
                </span>
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 4 }}>
                {qty(tender.volumeRequired)}u · target {euros(tender.targetUnitPrice)}/u
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
                Closes: {turnLabel(tender.closeTurn)} · {tender.bids.length} bid{tender.bids.length !== 1 ? "s" : ""}
              </div>
              {myBid && (
                <div style={{ color: "var(--green)", fontSize: 11, marginTop: 2 }}>
                  ✓ Your bid: {qty(myBid.volumeOffered)}u @ {euros(myBid.unitPrice)}/u
                </div>
              )}
            </div>
          );
        })}

        {closedTenders.length > 0 && (
          <>
            <div style={{ padding: "10px 16px 4px", color: "var(--text-dim)", fontSize: 11, borderTop: "1px solid var(--border)" }}>
              CLOSED / AWARDED
            </div>
            {closedTenders.slice(-10).reverse().map((tender) => (
              <div key={tender.id} style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", opacity: 0.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12 }}>{displayName(tender.product as ProductId)}</span>
                  <span className="tag tag-dim">{tender.status}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Detail + bid panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {!selectedTender && (
          <div style={{ color: "var(--text-dim)" }}>Select a tender to view details and bid.</div>
        )}

        {selectedTender && (
          <>
            <h2 style={{ marginBottom: 4 }}>
              {displayName(selectedTender.product as ProductId)}
            </h2>
            <span className={`tag tag-${selectedTender.direction === "market" ? "blue" : "gold"}`} style={{ marginBottom: 16, display: "inline-block" }}>
              {selectedTender.direction === "market" ? "Market tender" : "Sourcing tender"}
            </span>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", marginTop: 12 }}>
              <TRow label="Volume required" value={`${qty(selectedTender.volumeRequired)}u`} />
              <TRow label="Target price" value={`${euros(selectedTender.targetUnitPrice)}/u`} />
              <TRow label="Min quality" value={`${(selectedTender.minQuality * 100).toFixed(0)}%`} />
              <TRow label="Duration" value={`${selectedTender.durationTurns} turns`} />
              <TRow label="Opens" value={turnLabel(selectedTender.openTurn)} />
              <TRow label="Closes" value={turnLabel(selectedTender.closeTurn)} />
            </div>

            {selectedTender.bids.length > 0 && (
              <>
                <hr style={{ margin: "16px 0" }} />
                <h3 style={{ marginBottom: 8 }}>Current bids</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selectedTender.bids.map((bid, i) => {
                    const isMe = bid.corporationId === playerCorp.id;
                    const bidCorp = gameState.corporations[bid.corporationId];
                    return (
                      <div key={i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 10px",
                        background: "var(--bg-card)", borderRadius: 4,
                        border: isMe ? "1px solid var(--gold-dim)" : "1px solid transparent",
                      }}>
                        <span style={{ color: isMe ? "var(--gold)" : "var(--text-dim)", fontSize: 12 }}>
                          {isMe ? "You" : bidCorp?.name ?? "Rival"}
                        </span>
                        <span>{qty(bid.volumeOffered)}u @ {euros(bid.unitPrice)}/u</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {selectedTender.status === "open" && selectedTender.direction === "market" && (
              <>
                <hr style={{ margin: "16px 0" }} />
                <h3 style={{ marginBottom: 12 }}>Submit a bid</h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 300 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>
                      Selling firm
                    </label>
                    <select
                      value={bidFirmId || playerFirms[0]?.id || ""}
                      onChange={(e) => setBidFirmId(e.target.value)}
                      style={{ width: "100%" }}
                    >
                      {playerFirms.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>
                      Volume (units)
                    </label>
                    <input
                      type="number" value={bidVolume}
                      onChange={(e) => setBidVolume(e.target.value)}
                      placeholder={`Max: ${qty(selectedTender.volumeRequired)}`}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>
                      Your price (€/u)
                    </label>
                    <input
                      type="number" value={bidPrice}
                      onChange={(e) => setBidPrice(e.target.value)}
                      placeholder={`Target: ${selectedTender.targetUnitPrice.toFixed(2)}`}
                      style={{ width: "100%" }}
                    />
                  </div>

                  {bidError && <div style={{ color: "var(--danger)", fontSize: 11 }}>{bidError}</div>}

                  {existingBid && (
                    <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
                      Submitting will replace your existing bid.
                    </div>
                  )}

                  <button className="primary" onClick={handleBid}>
                    {existingBid ? "Update bid" : "Submit bid"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{label}</div>
      <div style={{ color: "var(--text-head)", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
