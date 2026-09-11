import { useRef, useCallback, useMemo } from "react";
import { Delaunay } from "d3-delaunay";
import { useGameStore } from "../../store/gameStore";
import type { Firm, ZoneChar } from "../../types";

const MAP_W = 1000;
const MAP_H = 700;
const FIRM_R = 8;
const FIRM_ORBIT = 46;

// ------------------------------------------------------------------
// Terrain layer
//
// A Voronoi diagram over the existing node positions, drawn underneath the
// links. This is purely cosmetic: it reads node.position and node.zone and
// changes nothing about generation or topology. Its job is to give the empty
// space a body, so the map reads as land-and-sea rather than as a graph on a
// void, and so link lengths have something to be measured against.
//
// Water is NOT produced by the Voronoi — a Voronoi has no concept of a coast
// and would happily hand a port a landlocked cell. It is an explicit rect
// behind the land, and the land is clipped to a smaller box so the difference
// between the two shows as sea on every side. Ports are pushed into the
// portEdgeMargin band of the canvas edge during generation, so they land in
// that coastal strip.
// ------------------------------------------------------------------

/** Breathing room between the outermost node and the coastline, in map units. */
const LAND_MARGIN = 55;
/** How far the sea extends beyond the coastline. */
const WATER_MARGIN = 340;

/**
 * Muted terrain tones, one per zone character. All are darker than ROAD_COLOR
 * below so roads stay legible on top, and darker than every node fill so the
 * cities keep their figure-ground separation.
 */
const ZONE_FILL: Record<ZoneChar, string> = {
  metropolitan: "#272c3b",  // slate violet — built-up
  industrial:   "#302a26",  // warm brown-grey — works and yards
  rural:        "#232c22",  // dark olive — farmland
  coastal:      "#1d2c30",  // dark teal — estuary and dune
};

const WATER_FILL     = "#0a1017";  // a shade below --bg, so the coastline reads
const COASTLINE      = "#33485e";

/**
 * Road stroke. The previous value was --border (#2a3347), chosen against a plain
 * black background; over terrain it disappeared completely. --text-dim is the
 * palette's existing "legible but recessive" tone and clears every ZONE_FILL.
 */
const ROAD_COLOR = "#6b7a94";

// Radius scales logarithmically with population: 7px at 15k → 32px at 950k
const LOG_POP_MIN = Math.log10(15_000);
const LOG_POP_MAX = Math.log10(950_000);
function nodeRadius(pop: number): number {
  const t = (Math.log10(Math.max(pop, 15_000)) - LOG_POP_MIN) / (LOG_POP_MAX - LOG_POP_MIN);
  return Math.round(7 + 25 * t);
}

export default function NodeMap() {
  const { gameState, selectedNodeId, selectedFirmId, selectNode, selectFirm, openStoreFirm, openCityScreen,
          mapTransform: view, setMapTransform: setView } = useGameStore();
  const svgRef = useRef<SVGSVGElement>(null);

  // Terrain geometry. Node positions never change after generation, so this is
  // computed once per game and memoised on the node record identity.
  const terrain = useMemo(() => {
    const nodes = Object.values(gameState?.cityNodes ?? {});
    if (nodes.length < 3) return null;   // Delaunay is degenerate below 3 points

    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const land = {
      x0: Math.min(...xs) - LAND_MARGIN,
      y0: Math.min(...ys) - LAND_MARGIN,
      x1: Math.max(...xs) + LAND_MARGIN,
      y1: Math.max(...ys) + LAND_MARGIN,
    };

    const delaunay = Delaunay.from(nodes, (n) => n.position.x, (n) => n.position.y);
    // Clipping the Voronoi to the land box is what stops the outermost cells —
    // the ports, by construction — from running off to infinity.
    const voronoi = delaunay.voronoi([land.x0, land.y0, land.x1, land.y1]);

    const cells = nodes.map((n, i) => ({
      id: n.id,
      zone: n.zone,
      d: voronoi.renderCell(i),
    })).filter((c) => c.d);

    return {
      cells,
      land,
      water: {
        x0: land.x0 - WATER_MARGIN,
        y0: land.y0 - WATER_MARGIN,
        w:  land.x1 - land.x0 + WATER_MARGIN * 2,
        h:  land.y1 - land.y0 + WATER_MARGIN * 2,
      },
    };
  }, [gameState?.cityNodes]);

  // Pan/zoom state lives in the store so it survives city screen open/close
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
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Cursor position in SVG viewBox space
    const cx = (e.clientX - rect.left) * (MAP_W / rect.width);
    const cy = (e.clientY - rect.top) * (MAP_H / rect.height);
    setView((v) => {
      const newScale = Math.max(0.4, Math.min(3, v.scale * factor));
      // Solve for new pan so the world point under the cursor stays fixed
      const worldX = (cx - v.x) / v.scale;
      const worldY = (cy - v.y) / v.scale;
      return { scale: newScale, x: cx - worldX * newScale, y: cy - worldY * newScale };
    });
  }, []);

  if (!gameState) return null;

  const { cityNodes, mapLinks, firms, corporations } = gameState;
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

        {/* Terrain — sea, then land cells, then coastline. Below everything else. */}
        {terrain && (
          <g className="terrain" pointerEvents="none">
            <rect
              x={terrain.water.x0} y={terrain.water.y0}
              width={terrain.water.w} height={terrain.water.h}
              fill={WATER_FILL}
            />
            {/* Each cell is stroked in its own fill so adjacent same-zone cells
                merge into one landmass instead of showing antialiasing seams. */}
            {terrain.cells.map((cell) => (
              <path
                key={cell.id}
                d={cell.d}
                fill={ZONE_FILL[cell.zone]}
                stroke={ZONE_FILL[cell.zone]}
                strokeWidth={1}
              />
            ))}
            <rect
              x={terrain.land.x0} y={terrain.land.y0}
              width={terrain.land.x1 - terrain.land.x0}
              height={terrain.land.y1 - terrain.land.y0}
              fill="none"
              stroke={COASTLINE}
              strokeWidth={1.5}
              opacity={0.7}
            />
          </g>
        )}

        {/* Links */}
        {Object.values(mapLinks).map((link) => {
          const from = cityNodes[link.fromNodeId];
          const to = cityNodes[link.toNodeId];
          if (!from || !to) return null;

          const isHighway = link.linkType === "highway";
          return (
            <line
              key={link.id}
              x1={from.position.x} y1={from.position.y}
              x2={to.position.x}   y2={to.position.y}
              stroke={isHighway ? "#c87a1a" : ROAD_COLOR}
              strokeWidth={isHighway ? 3 : 1 + link.investmentLevel}
              strokeLinecap="round"
              opacity={isHighway ? 0.85 : 0.75}
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
          // Port nodes (type === "port") are port cities: they get harbor styling + the ⚓ icon.
          // Standalone harbor nodes (type === "harbor") would also get harbor styling if ever added.
          const isHarborNode = node.type === "harbor" || node.type === "port";

          let nodeColor = "#2a3347";
          if (isHarborNode) nodeColor = "var(--blue-dim)";
          else if (playerFirms.length > 0 && aiFirms.length > 0) nodeColor = "#5a3d1a"; // contested
          else if (playerFirms.length > 0) nodeColor = "var(--gold-dim)";
          else if (aiFirms.length > 0) nodeColor = "#5a1a1a";

          let strokeColor = "#3a4a60";
          if (isSelected) strokeColor = "var(--accent)";
          else if (isHarborNode) strokeColor = "var(--blue)";
          else if (playerFirms.length > 0 && aiFirms.length === 0) strokeColor = "var(--gold)";
          else if (aiFirms.length > 0 && playerFirms.length === 0) strokeColor = "var(--red)";

          const r = nodeRadius(node.population);

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
                onClick={() => openCityScreen(node.id)}
              />

              {/* Harbor icon — shown on port and harbor nodes */}
              {isHarborNode && (
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
                fontSize={r < 12 ? 8 : r < 18 ? 9 : 10}
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
                        if (firm.type === "store" && isPlayerFirm) {
                          openStoreFirm(firm.id);
                        } else {
                          selectFirm(isFirmSelected ? null : firm.id);
                        }
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
              {isSelected && node.factorySlots > 0 && (
                Array.from({ length: node.factorySlots - firmsHere.length }).map((_, i) => {
                  const angle = ((firmsHere.length + i) / Math.max(node.factorySlots, 1)) * 2 * Math.PI - Math.PI / 2;
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
          { color: "#c87a1a", label: "Highway" },
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
