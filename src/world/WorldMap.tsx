// World builder map renderer. Presentational and store-free: everything comes in
// as props. Uses the same terrain module as the game so the two look identical.

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { CityNode, MapLink } from "../types";
import {
  computeTerrain, ZONE_FILL, WATER_FILL, COASTLINE,
  ROAD_COLOR, HIGHWAY_COLOR, nodeRadius,
} from "../components/map/terrain";

const VIEW_W = 1200;
const VIEW_H = 820;

interface Props {
  cityNodes: Record<string, CityNode>;
  mapLinks: Record<string, MapLink>;
  showLabels: boolean;
  showTerrain: boolean;
  /** Bumped by the parent whenever a new world is generated, to retrigger fit-to-view. */
  fitKey: number;
}

export default function WorldMap({ cityNodes, mapLinks, showLabels, showTerrain, fitKey }: Props) {
  const nodes = useMemo(() => Object.values(cityNodes), [cityNodes]);
  const links = useMemo(() => Object.values(mapLinks), [mapLinks]);
  const terrain = useMemo(() => computeTerrain(nodes), [nodes]);

  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [hover, setHover] = useState<CityNode | null>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Fit the whole world in view whenever a new one is generated. Unlike the game
  // map this tool always opens on the complete world — you cannot tune what you
  // cannot see.
  useEffect(() => {
    if (!nodes.length) return;
    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const pad = 90;
    const w = Math.max(1, Math.max(...xs) - Math.min(...xs) + pad * 2);
    const h = Math.max(1, Math.max(...ys) - Math.min(...ys) + pad * 2);
    const scale = Math.min(VIEW_W / w, VIEW_H / h);
    setView({
      scale,
      x: VIEW_W / 2 - ((Math.min(...xs) + Math.max(...xs)) / 2) * scale,
      y: VIEW_H / 2 - ((Math.min(...ys) + Math.max(...ys)) / 2) * scale,
    });
  }, [fitKey, nodes]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const cx = (e.clientX - rect.left) * (VIEW_W / rect.width);
    const cy = (e.clientY - rect.top) * (VIEW_H / rect.height);
    setView((v) => {
      const scale = Math.min(6, Math.max(0.08, v.scale * factor));
      return { scale, x: cx - (cx - v.x) * (scale / v.scale), y: cy - (cy - v.y) * (scale / v.scale) };
    });
  }, []);

  const onDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const k = rect ? VIEW_W / rect.width : 1;
    const dx = (e.clientX - lastPos.current.x) * k;
    const dy = (e.clientY - lastPos.current.y) * k;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }, []);
  const onUp = useCallback(() => { dragging.current = false; }, []);

  const degree = useMemo(() => {
    const d: Record<string, number> = {};
    for (const l of links) {
      d[l.fromNodeId] = (d[l.fromNodeId] ?? 0) + 1;
      d[l.toNodeId] = (d[l.toNodeId] ?? 0) + 1;
    }
    return d;
  }, [links]);

  return (
    <div className="wb-mapwrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="wb-map"
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>

          {showTerrain && terrain && (
            <g pointerEvents="none">
              <rect
                x={terrain.water.x0} y={terrain.water.y0}
                width={terrain.water.w} height={terrain.water.h}
                fill={WATER_FILL}
              />
              {terrain.cells.map((c) => (
                <path key={c.id} d={c.d} fill={ZONE_FILL[c.zone]} stroke={ZONE_FILL[c.zone]} strokeWidth={1} />
              ))}
              <rect
                x={terrain.land.x0} y={terrain.land.y0}
                width={terrain.land.x1 - terrain.land.x0}
                height={terrain.land.y1 - terrain.land.y0}
                fill="none" stroke={COASTLINE} strokeWidth={1.5} opacity={0.7}
              />
            </g>
          )}

          <g pointerEvents="none">
            {links.map((l) => {
              const a = cityNodes[l.fromNodeId];
              const b = cityNodes[l.toNodeId];
              if (!a || !b) return null;
              const hw = l.linkType === "highway";
              return (
                <line
                  key={l.id}
                  x1={a.position.x} y1={a.position.y}
                  x2={b.position.x} y2={b.position.y}
                  stroke={hw ? HIGHWAY_COLOR : ROAD_COLOR}
                  strokeWidth={hw ? 3 : 1}
                  strokeLinecap="round"
                  opacity={hw ? 0.85 : 0.75}
                />
              );
            })}
          </g>

          {nodes.map((n) => {
            const r = nodeRadius(n.population);
            const isPort = n.type === "port";
            const d = degree[n.id] ?? 0;
            return (
              <g key={n.id}
                 onMouseEnter={() => setHover(n)}
                 onMouseLeave={() => setHover((h) => (h?.id === n.id ? null : h))}>
                <circle
                  cx={n.position.x} cy={n.position.y} r={r}
                  fill={isPort ? "#1f6390" : "#3d4a63"}
                  stroke={d === 0 ? "#e74c3c" : d === 1 ? "#f39c12" : "#8ea2c0"}
                  strokeWidth={d <= 1 ? 2.5 : 1.5}
                />
                {isPort && (
                  <text x={n.position.x} y={n.position.y} textAnchor="middle"
                        dominantBaseline="middle" fontSize={13} fill="#9ecbf0"
                        style={{ userSelect: "none" }} pointerEvents="none">⚓</text>
                )}
                {showLabels && (
                  <text x={n.position.x} y={n.position.y - r - 5} textAnchor="middle"
                        fontSize={12} fill="#9fb0c9" style={{ userSelect: "none" }}
                        pointerEvents="none">{n.name}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hover && (
        <div className="wb-tooltip">
          <strong>{hover.name}</strong>
          <span className={`wb-zone wb-zone-${hover.zone}`}>{hover.zone}</span>
          <dl>
            <dt>Population</dt><dd>{hover.population.toLocaleString("nl-NL")}</dd>
            <dt>Ceiling</dt><dd>{hover.geoCeiling.toLocaleString("nl-NL")}</dd>
            <dt>Wealth</dt><dd>{hover.wealthIndex.toFixed(3)}</dd>
            <dt>Growth</dt><dd>{(hover.baseGrowthRate * 100).toFixed(2)}%</dd>
            <dt>Roads</dt><dd>{degree[hover.id] ?? 0}</dd>
            <dt>Factory slots</dt><dd>{hover.factorySlots}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
