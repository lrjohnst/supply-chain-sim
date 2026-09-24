// ============================================================
// World builder model — generation and stepping.
//
// Calls the game's own engine functions directly. Nothing is reimplemented
// here: if this file and the game disagree about what a world looks like, that
// is a bug in this file. That fidelity is the whole point of the tool — a world
// tuned here must be reproducible in the game from the same seed and params.
// ============================================================

import type { CityNode, MapLink, GameState, MapConfig } from "../types";
import type { WorldParams } from "../config/worldParams";
import { buildCityNodes, buildMapLinks, getConnectedNodes } from "../engine/map";
import { tickPopulation, tickWealth, computeNetworkFactor } from "../engine/city";

export interface World {
  seed: number;
  step: number;
  cityNodes: Record<string, CityNode>;
  mapLinks: Record<string, MapLink>;
  /** Forced-connectivity edges the BFS fallback had to add. A high number means tight thresholds. */
  forcedEdges: number;
}

/**
 * tickPopulation and tickWealth draw from Math.random, not from the map seed, so
 * stepping is non-deterministic in the game. For a tuning tool that is useless —
 * you could not tell a parameter's effect apart from noise. We therefore swap in
 * a seeded generator for the duration of each step and restore it afterwards.
 *
 * Deliberately a wrapper rather than an engine change: the engine keeps running
 * exactly the code the game runs, and the determinism stays a property of the
 * tool. Restore happens in a finally block so a throw cannot leak the stub.
 */
function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = original; }
}

/** Capture console.warn to count the BFS fallback edges buildMapLinks reports. */
function countingForcedEdges<T>(fn: () => T): { value: T; forced: number } {
  const original = console.warn;
  let forced = 0;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("Forced connectivity edge")) forced++;
    else original(...args);
  };
  try { return { value: fn(), forced }; } finally { console.warn = original; }
}

export function generateWorld(seed: number, map: MapConfig, wp: WorldParams): World {
  const cityNodes = buildCityNodes(seed, map, wp);
  const { value: mapLinks, forced } = countingForcedEdges(() => buildMapLinks(cityNodes, map, wp));
  return { seed, step: 0, cityNodes, mapLinks, forcedEdges: forced };
}

/** Minimal GameState shape — tickPopulation/tickWealth/computeNetworkFactor read only these two fields. */
function asState(world: World): GameState {
  return { cityNodes: world.cityNodes, mapLinks: world.mapLinks } as unknown as GameState;
}

/**
 * Advance the world by `steps` turns of city life. Mutates in place, as the
 * engine does — callers clone first if they need the old state.
 */
export function advanceWorld(world: World, steps: number): World {
  const state = asState(world);
  for (let i = 0; i < steps; i++) {
    // Seed per step so a given (seed, step) always produces the same world,
    // no matter whether you got there in one jump of 50 or fifty of 1.
    withSeededRandom(world.seed ^ ((world.step + i + 1) * 0x9E3779B9), () => {
      tickPopulation(state);
      tickWealth(state);
    });
  }
  return { ...world, step: world.step + steps };
}

export function cloneWorld(world: World): World {
  return structuredClone(world);
}

// ------------------------------------------------------------------
// Statistics — the numbers that say whether a world "feels" right
// ------------------------------------------------------------------

export interface WorldStats {
  nodes: number;
  ports: number;
  totalPopulation: number;
  medianPopulation: number;
  largestCity: number;
  meanWealth: number;
  links: number;
  highways: number;
  meanDegree: number;
  deadEnds: number;      // degree ≤ 1
  isolated: number;      // degree 0
  forcedEdges: number;
  minLinkKm: number;
  maxLinkKm: number;
  meanLinkKm: number;
  clampedLinks: number;  // links sitting exactly on the min or max clamp
  meanNetworkFactor: number;
  worldWidthKm: number;
  worldHeightKm: number;
  worldAreaKm2: number;
  zoneCounts: Record<string, number>;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

export function computeStats(world: World, map: MapConfig, wp: WorldParams): WorldStats {
  const nodes = Object.values(world.cityNodes);
  const links = Object.values(world.mapLinks);
  const state = asState(world);

  const degrees = nodes.map((n) => getConnectedNodes(state, n.id).length);
  const pops = nodes.map((n) => n.population);
  const kms = links.map((l) => l.distance);

  const scale = wp.worldDiagonalKm / Math.hypot(map.canvasWidth, map.canvasHeight);
  const zoneCounts: Record<string, number> = {};
  for (const n of nodes) zoneCounts[n.zone] = (zoneCounts[n.zone] ?? 0) + 1;

  return {
    nodes: nodes.length,
    ports: nodes.filter((n) => n.type === "port").length,
    totalPopulation: pops.reduce((a, b) => a + b, 0),
    medianPopulation: median(pops),
    largestCity: Math.max(0, ...pops),
    meanWealth: nodes.length ? nodes.reduce((a, n) => a + n.wealthIndex, 0) / nodes.length : 0,
    links: links.length,
    highways: links.filter((l) => l.linkType === "highway").length,
    meanDegree: degrees.length ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0,
    deadEnds: degrees.filter((d) => d <= 1).length,
    isolated: degrees.filter((d) => d === 0).length,
    forcedEdges: world.forcedEdges,
    minLinkKm: kms.length ? Math.min(...kms) : 0,
    maxLinkKm: kms.length ? Math.max(...kms) : 0,
    meanLinkKm: kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : 0,
    clampedLinks: kms.filter((d) => d === wp.linkDistanceMinKm || d === wp.linkDistanceMaxKm).length,
    meanNetworkFactor: nodes.length
      ? nodes.reduce((a, n) => a + computeNetworkFactor(state, n.id), 0) / nodes.length
      : 0,
    worldWidthKm:  map.canvasWidth  * scale,
    worldHeightKm: map.canvasHeight * scale,
    worldAreaKm2:  map.canvasWidth * scale * map.canvasHeight * scale,
    zoneCounts,
  };
}
