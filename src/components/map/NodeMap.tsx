import { useRef, useState, useCallback } from "react";
import { useGameStore } from "../../store/gameStore";
import type { CityNode, Firm } from "../../types";

const MAP_W = 1000;
const MAP_H = 700;
const NODE_R = 22;
const FIRM_R = 8;
const FIRM_ORBIT = 38;

export default function NodeMap() {
  const { gameState, selectedNodeId, selectedFirmId, selectNode, selectFirm } = useGameStore();
  const svgRef = useRef<SVGSVGElement>(null);

  // Pan/zoom state
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest("[data-interactive]")) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setView((v) => ({
      ...v,
      scale: Math.max(0.4, Math.min(3, v.scale * factor)),
    }));
  }, []);

  if (!gameState) return null;

  const { cityNodes, mapLinks, firms, corporations, harborNode } = gameState;
  const playerCorp = Object.values(corporations).find((c) => c.isPlayer);
  const aiCorp = Object.values(corporations).find((c) => !c.isPlayer);

  // Group firms by city
  const firmsByCity: Record<string, Firm[]> = {};
  for (const firm of Object.values(firms)) {
    if (!firmsByCity[firm.cityNodeId]) firmsByCity[firm.cityNodeId] = [];
    firmsByCity[firm.cityNodeId].push(firm);
  }

  // Internal contracts for lock icons
  const internalContracts = Object.values(gameState.contracts).filter(
    (c) => c.isInternal && c.status === "active"
  );

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      style={{ cursor: dragging.current ? "grabbing" : "grab", background: "var(--bg)" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>

        {/* Links */}
        {Object.values(mapLinks).map((link) => {
          const from = cityNodes[link.fromNodeId];
          const to = cityNodes[link.toNodeId];
          if (!from || !to) return null;

          // Volume = sum of active contracts on this link (approximated by shared firms)
          const weight = 1 + link.investmentLevel;

          return (
            <line
              key={link.id}
              x1={from.position.x} y1={from.position.y}
              x2={to.position.x} y2={to.position.y}
              stroke="#2a3347"
              strokeWidth={weight}
              strokeLinecap="round"
            />
          );
        })}

        {/* Internal contract lines */}
        {internalContracts.map((contract) => {
          const sellerFirm = firms[contract.sellerParty.firmId ?? ""];
          const buyerFirm = firms[contract.buyerParty.firmId ?? ""];
          if (!sellerFirm || !buyerFirm) return null;
          if (sellerFirm.cityNodeId === buyerFirm.cityNodeId) return null;

          const fromNode = cityNodes[sellerFirm.cityNodeId];
          const toNode = cityNodes[buyerFirm.cityNodeId];
          if (!fromNode || !toNode) return null;

          const mx = (fromNode.position.x + toNode.position.x) / 2;
          const my = (fromNode.position.y + toNode.position.y) / 2;

          return (
            <g key={contract.id}>
              <line
                x1={fromNode.position.x} y1={fromNode.position.y}
                x2={toNode.position.x} y2={toNode.position.y}
                stroke="var(--green)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                opacity={0.7}
              />
              {/* Lock icon at midpoint */}
              <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                fontSize={12} fill="var(--green)" style={{ userSelect: "none" }}>
                🔒
              </text>
            </g>
          );
        })}

        {/* City nodes */}
        {Object.values(cityNodes).map((node) => {
          const firmsHere = firmsByCity[node.id] ?? [];
          const playerFirms = firmsHere.filter((f) => f.corporationId === playerCorp?.id);
          const aiFirms = firmsHere.filter((f) => f.corporationId === aiCorp?.id);
          const isSelected = selectedNodeId === node.id;
          const isHarbor = node.type === "harbor";

          let nodeColor = "#2a3347";
          if (isHarbor) nodeColor = "var(--blue-dim)";
          else if (playerFirms.length > 0 && aiFirms.length > 0) nodeColor = "#5a3d1a"; // contested
          else if (playerFirms.length > 0) nodeColor = "var(--gold-dim)";
          else if (aiFirms.length > 0) nodeColor = "#5a1a1a";

          let strokeColor = "#3a4a60";
          if (isSelected) strokeColor = "var(--accent)";
          else if (isHarbor) strokeColor = "var(--blue)";
          else if (playerFirms.length > 0 && aiFirms.length === 0) strokeColor = "var(--gold)";
          else if (aiFirms.length > 0 && playerFirms.length === 0) strokeColor = "var(--red)";

          const r = node.type === "city" ? NODE_R : node.type === "harbor" ? NODE_R + 4 : NODE_R - 6;

          return (
            <g key={node.id} data-interactive="true">
              {/* Node circle */}
              <circle
                cx={node.position.x}
                cy={node.position.y}
                r={r}
                fill={nodeColor}
                stroke={strokeColor}
                strokeWidth={isSelected ? 2.5 : 1.5}
                filter={isSelected ? "url(#glow)" : undefined}
                style={{ cursor: "pointer" }}
                onClick={() => selectNode(isSelected ? null : node.id)}
              />

              {/* Harbor label */}
              {isHarbor && (
                <text
                  x={node.position.x} y={node.position.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={14} fill="var(--blue)" style={{ userSelect: "none" }}>
                  ⚓
                </text>
              )}

              {/* City label */}
              <text
                x={node.position.x}
                y={node.position.y + r + 12}
                textAnchor="middle"
                fontSize={node.type === "town" ? 9 : 10}
                fill={isSelected ? "var(--text-head)" : "var(--text-dim)"}
                fontWeight={isSelected ? 600 : 400}
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {node.name}
              </text>

              {/* Firm sub-nodes orbiting the city node */}
              {firmsHere.map((firm, i) => {
                const angle = (i / Math.max(firmsHere.length, 1)) * 2 * Math.PI - Math.PI / 2;
                const orbitR = r + FIRM_ORBIT - 10;
                const fx = node.position.x + Math.cos(angle) * orbitR;
                const fy = node.position.y + Math.sin(angle) * orbitR;
                const isPlayerFirm = firm.corporationId === playerCorp?.id;
                const isFirmSelected = selectedFirmId === firm.id;
                const firmColor = isPlayerFirm ? "var(--gold)" : "var(--red)";
                const firmIcon = firm.type === "farm" ? "🌾" : firm.type === "factory" ? "🏭" : "🏪";

                return (
                  <g key={firm.id} data-interactive="true">
                    <line
                      x1={node.position.x} y1={node.position.y}
                      x2={fx} y2={fy}
                      stroke={firmColor}
                      strokeWidth={0.8}
                      opacity={0.4}
                    />
                    <circle
                      cx={fx} cy={fy} r={FIRM_R}
                      fill={isFirmSelected ? firmColor : "var(--bg-card)"}
                      stroke={firmColor}
                      strokeWidth={isFirmSelected ? 2 : 1.5}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectNode(node.id);
                        selectFirm(isFirmSelected ? null : firm.id);
                      }}
                    />
                    <text
                      x={fx} y={fy}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={8} style={{ userSelect: "none", pointerEvents: "none" }}>
                      {firmIcon}
                    </text>
                  </g>
                );
              })}

              {/* Slot availability dots for selected node */}
              {isSelected && node.firmSlots > 0 && (
                Array.from({ length: node.firmSlots - firmsHere.length }).map((_, i) => {
                  const angle = ((firmsHere.length + i) / Math.max(node.firmSlots, 1)) * 2 * Math.PI - Math.PI / 2;
                  const orbitR = r + FIRM_ORBIT - 10;
                  const fx = node.position.x + Math.cos(angle) * orbitR;
                  const fy = node.position.y + Math.sin(angle) * orbitR;
                  return (
                    <circle key={`slot-${i}`} cx={fx} cy={fy} r={FIRM_R}
                      fill="transparent" stroke="var(--border)" strokeWidth={1}
                      strokeDasharray="3 2" />
                  );
                })
              )}
            </g>
          );
        })}

      </g>

      {/* Legend */}
      <g transform="translate(12, 12)">
        {[
          { color: "var(--gold)", label: "Your presence" },
          { color: "var(--red)", label: "Rival presence" },
          { color: "var(--blue)", label: "Harbor" },
          { color: "var(--green)", label: "Internal contract" },
        ].map(({ color, label }, i) => (
          <g key={label} transform={`translate(0, ${i * 18})`}>
            <circle cx={6} cy={6} r={5} fill={color} opacity={0.8} />
            <text x={16} y={10} fontSize={10} fill="var(--text-dim)">{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
