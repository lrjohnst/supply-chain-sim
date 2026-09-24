// ============================================================
// Terrain layer geometry and palette.
//
// Shared by the game map (NodeMap) and the world builder, so the two never
// drift apart visually. Pure: takes node positions and zones, returns geometry.
// See docs/rendering.md for why water is explicit rather than emergent.
// ============================================================

import { Delaunay } from "d3-delaunay";
import type { CityNode, ZoneChar } from "../../types";

/** Breathing room between the outermost node and the coastline, in map units. */
export const LAND_MARGIN = 55;
/** How far the sea extends beyond the coastline. */
export const WATER_MARGIN = 340;

/**
 * Muted terrain tones, one per zone character. All are darker than ROAD_COLOR
 * so roads stay legible on top, and darker than every node fill so the cities
 * keep their figure-ground separation.
 */
export const ZONE_FILL: Record<ZoneChar, string> = {
  metropolitan: "#272c3b",  // slate violet — built-up
  industrial:   "#302a26",  // warm brown-grey — works and yards
  rural:        "#232c22",  // dark olive — farmland
  coastal:      "#1d2c30",  // dark teal — estuary and dune
};

export const WATER_FILL = "#0a1017";  // a shade below --bg, so the coastline reads
export const COASTLINE  = "#33485e";

/**
 * Road stroke. The original value was --border (#2a3347), chosen against a plain
 * black background; over terrain it disappeared completely. --text-dim is the
 * palette's existing "legible but recessive" tone and clears every ZONE_FILL.
 */
export const ROAD_COLOR    = "#6b7a94";
export const HIGHWAY_COLOR = "#c87a1a";

export interface Terrain {
  cells: { id: string; zone: ZoneChar; d: string }[];
  land:  { x0: number; y0: number; x1: number; y1: number };
  water: { x0: number; y0: number; w: number; h: number };
}

/**
 * Voronoi cells over the given nodes, clipped to their bounding box plus
 * LAND_MARGIN, with a sea rect behind extending a further WATER_MARGIN.
 * Returns null below three nodes, where the Delaunay triangulation degenerates.
 */
export function computeTerrain(nodes: CityNode[]): Terrain | null {
  if (nodes.length < 3) return null;

  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const land = {
    x0: Math.min(...xs) - LAND_MARGIN,
    y0: Math.min(...ys) - LAND_MARGIN,
    x1: Math.max(...xs) + LAND_MARGIN,
    y1: Math.max(...ys) + LAND_MARGIN,
  };

  const delaunay = Delaunay.from(nodes, (n) => n.position.x, (n) => n.position.y);
  // Clipping to the land box is what stops the outermost cells — the ports, by
  // construction — from running off to infinity.
  const voronoi = delaunay.voronoi([land.x0, land.y0, land.x1, land.y1]);

  const cells = nodes
    .map((n, i) => ({ id: n.id, zone: n.zone, d: voronoi.renderCell(i) }))
    .filter((c) => c.d);

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
}

/** Node radius scales logarithmically with population: 7px at 15k → 32px at 950k. */
const LOG_POP_MIN = Math.log10(15_000);
const LOG_POP_MAX = Math.log10(950_000);
export function nodeRadius(pop: number): number {
  const t = (Math.log10(Math.max(pop, 15_000)) - LOG_POP_MIN) / (LOG_POP_MAX - LOG_POP_MIN);
  return Math.round(7 + 25 * t);
}
