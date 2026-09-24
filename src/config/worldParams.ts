// ============================================================
// World generation parameters
//
// Every number that shapes the world but that the player never sees. These used
// to be literals scattered through map.ts. They are hoisted here so the world
// builder (world.supply-chain-sim.lucasjohnston.nl) can drive them, and so a
// tuned world can be exported as JSON and pasted back into defaultWorldParams.
//
// The defaults below ARE the former literals, value for value. Changing nothing
// must produce a byte-identical map for a given seed — that property is what
// makes the builder trustworthy, so do not "tidy" a default without measuring.
// ============================================================

import type { ZoneChar } from "../types";

export interface WorldParams {
  // --- Region centres ---
  /** Nodes per region centre; regionCount = clamp(round(nodeCount / this), min, max). */
  nodesPerRegion: number;
  regionCountMin: number;
  regionCountMax: number;
  /** Minimum gap between region centres, as a fraction of canvasWidth. */
  centreGapFactor: number;
  /** Canvas margin region centres stay inside, in px. */
  centreMargin: number;
  /** Rejection sampling: attempts before giving up, and how much the gap relaxes. */
  centreMaxAttempts: number;
  centreGapRelaxEvery: number;
  centreGapRelaxFactor: number;

  // --- Population distribution ---
  /** Lognormal μ and σ. μ=11.2, σ=0.85 → median ≈73k. */
  popMu: number;
  popSigma: number;
  popMin: number;
  popMax: number;

  // --- Node placement ---
  /** Gaussian scatter σ = canvasWidth / (regionCount × this). */
  scatterSigmaFactor: number;
  /** Canvas padding nodes stay inside, in px. */
  nodePadding: number;
  /** Minimum separation between any two nodes, in px. Must stay below every zone threshold. */
  minNodeSeparation: number;
  placementMaxAttempts: number;
  /** How far a node is pushed from its nearest neighbour when placement gives up. */
  placementPushDistance: number;

  // --- Zone character weights, per map type ---
  zoneWeights: Record<"trading" | "industrial" | "frontier", Record<ZoneChar, number>>;
  /** Points shifted between metropolitan and rural by difficulty. */
  difficultyZoneShift: number;

  // --- Starting wealth index, per zone ---
  wealthByZone: Record<ZoneChar, { mean: number; std: number; min: number; max: number }>;

  // --- Derived economics ---
  /** geoCeiling = pop × clamp(base - log10(pop) × slope, min, max) × lognormal(μ, σ). */
  geoCeilingBase: number;
  geoCeilingSlope: number;
  geoCeilingFactorMin: number;
  geoCeilingFactorMax: number;
  territoryMu: number;
  territorySigma: number;

  // --- Link thresholds ---
  /** Road forms when distance < average of both endpoints' thresholds × connectivity factor. */
  zoneThresholds: Record<ZoneChar, number>;
  connectivityFactors: Record<
    "isolated" | "sparse" | "normal" | "dense",
    { intraZone: number; crossZone: number }
  >;

  // --- Highways ---
  /** Fraction of nodes eligible under "basic", and the floor on that count. */
  highwayBasicFraction: number;
  highwayBasicMinimum: number;
  /** Population floor for highway eligibility under "developed" / "advanced". */
  highwayDevelopedMinPop: number;
  highwayAdvancedMinPop: number;
  /** MST reach multiplier under "advanced". */
  highwayAdvancedReachMultiplier: number;

  // --- Scale ---
  /**
   * The world's diagonal in km. SCALE_FACTOR = worldDiagonalKm / hypot(canvasW, canvasH),
   * so this — NOT the canvas size — is what sets how big the world actually is.
   * At 800 with the default 2000×1400 canvas the world is 655 × 459 km ≈ 301,000 km².
   */
  worldDiagonalKm: number;
  /** Hard clamp on every link's length in km, regardless of on-screen geometry. */
  linkDistanceMinKm: number;
  linkDistanceMaxKm: number;
}

export const defaultWorldParams: WorldParams = {
  nodesPerRegion: 10,
  regionCountMin: 4,
  regionCountMax: 6,
  centreGapFactor: 0.25,
  centreMargin: 80,
  centreMaxAttempts: 200,
  centreGapRelaxEvery: 50,
  centreGapRelaxFactor: 0.80,

  popMu: 11.2,
  popSigma: 0.85,
  popMin: 15_000,
  popMax: 950_000,

  scatterSigmaFactor: 2,
  nodePadding: 60,
  minNodeSeparation: 90,
  placementMaxAttempts: 50,
  placementPushDistance: 95,

  zoneWeights: {
    trading:    { metropolitan: 30, industrial: 20, rural: 25, coastal: 25 },
    industrial: { metropolitan: 20, industrial: 40, rural: 25, coastal: 15 },
    frontier:   { metropolitan: 10, industrial: 15, rural: 50, coastal: 25 },
  },
  difficultyZoneShift: 10,

  wealthByZone: {
    metropolitan: { mean: 0.55, std: 0.10, min: 0.35, max: 0.80 },
    coastal:      { mean: 0.50, std: 0.10, min: 0.30, max: 0.75 },
    industrial:   { mean: 0.40, std: 0.10, min: 0.20, max: 0.65 },
    rural:        { mean: 0.30, std: 0.10, min: 0.10, max: 0.55 },
  },

  geoCeilingBase: 8.0,
  geoCeilingSlope: 1.4,
  geoCeilingFactorMin: 1.05,
  geoCeilingFactorMax: 3.5,
  territoryMu: 0.75,
  territorySigma: 0.25,

  zoneThresholds: {
    metropolitan: 200,
    industrial:   160,
    coastal:      140,
    rural:        110,
  },
  connectivityFactors: {
    isolated: { intraZone: 0.50, crossZone: 0.30 },
    sparse:   { intraZone: 0.75, crossZone: 0.60 },
    normal:   { intraZone: 1.00, crossZone: 1.00 },
    dense:    { intraZone: 1.35, crossZone: 1.30 },
  },

  highwayBasicFraction: 0.08,
  highwayBasicMinimum: 3,
  highwayDevelopedMinPop: 80_000,
  highwayAdvancedMinPop: 40_000,
  highwayAdvancedReachMultiplier: 1.3,

  worldDiagonalKm: 800,
  linkDistanceMinKm: 20,
  linkDistanceMaxKm: 100,
};
