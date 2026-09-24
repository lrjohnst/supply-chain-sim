import type { GameState, CityNode, MapLink, StoreLocation, MapConfig, ZoneChar } from "../types";
import { GameConfig, defaultMapConfig } from "../config/gameConfig";
import { defaultWorldParams, type WorldParams } from "../config/worldParams";
import { generateId } from "./utils";
import { clamp } from "./utils";

// Post-MVP: link investment reduces transport cost and increases capacity.
// Post-MVP: airport node type support.

// ------------------------------------------------------------------
// Seeded RNG — mulberry32
// ------------------------------------------------------------------

function makeSeededRNG(seed: number) {
  let s = seed;
  function next(): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function normal(mean: number, std: number): number {
    const u1 = next() || 1e-10;
    const u2 = next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  }
  function lognormal(mu: number, sigma: number): number {
    return Math.exp(normal(mu, sigma));
  }
  function pick(): number { return next(); }
  return { next, normal, lognormal, pick };
}

// ------------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------------

function euclidean(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ------------------------------------------------------------------
// Store location generation
// ------------------------------------------------------------------

function makeStoreLocations(
  slots: { cls: "A" | "B" | "C"; size: "small" | "medium" | "large"; count: number }[]
): StoreLocation[] {
  const locs: StoreLocation[] = [];
  for (const { cls, size, count } of slots) {
    for (let i = 0; i < count; i++) {
      locs.push({ id: generateId(), locationClass: cls, size, occupiedByFirmId: null });
    }
  }
  return locs;
}

function pickSize(rng: ReturnType<typeof makeSeededRNG>): "small" | "medium" | "large" {
  const r = rng.pick();
  return r < 0.60 ? "small" : r < 0.90 ? "medium" : "large";
}

function makeStoreLocsForPop(
  pop: number,
  rng: ReturnType<typeof makeSeededRNG>
): StoreLocation[] {
  const aCount = clamp(Math.floor(pop / 200_000), 0, 2);
  const bCount = clamp(Math.floor(pop / 80_000),  0, 3);
  const cCount = clamp(Math.floor(pop / 30_000),  0, 4);
  const slots: { cls: "A" | "B" | "C"; size: "small" | "medium" | "large"; count: number }[] = [];
  for (let i = 0; i < aCount; i++) slots.push({ cls: "A", size: pickSize(rng), count: 1 });
  for (let i = 0; i < bCount; i++) slots.push({ cls: "B", size: pickSize(rng), count: 1 });
  for (let i = 0; i < cCount; i++) slots.push({ cls: "C", size: pickSize(rng), count: 1 });
  return makeStoreLocations(slots);
}

// ------------------------------------------------------------------
// Zone character types and weights
// ------------------------------------------------------------------

function drawZoneChar(
  rng: ReturnType<typeof makeSeededRNG>,
  mapType: MapConfig["mapType"],
  difficulty: MapConfig["difficulty"],
  wp: WorldParams
): ZoneChar {
  const w = { ...wp.zoneWeights[mapType] };
  const shift = wp.difficultyZoneShift;
  if (difficulty === "easy") { w.metropolitan += shift; w.rural -= shift; }
  if (difficulty === "hard") { w.metropolitan -= shift; w.rural += shift; }
  const total = w.metropolitan + w.industrial + w.rural + w.coastal;
  let r = rng.pick() * total;
  if ((r -= w.metropolitan) < 0) return "metropolitan";
  if ((r -= w.industrial) < 0) return "industrial";
  if ((r -= w.rural) < 0) return "rural";
  return "coastal";
}

// ------------------------------------------------------------------
// wealthIndex starting value per zone character
// ------------------------------------------------------------------

function drawWealthIndex(
  rng: ReturnType<typeof makeSeededRNG>,
  zone: ZoneChar,
  wp: WorldParams
): number {
  const w = wp.wealthByZone[zone];
  return clamp(rng.normal(w.mean, w.std), w.min, w.max);
}

// ------------------------------------------------------------------
// Name pool (80 names, drawn without replacement via seeded shuffle)
// ------------------------------------------------------------------

const NAME_POOL = [
  "Aldenmoor", "Ashby", "Barton", "Brentwick", "Brixton Hollow",
  "Calderton", "Coppergate", "Dalwick", "Drayton Cross", "Dunhaven",
  "Eatonbridge", "Elmsford", "Fenwick", "Foxdale", "Greystone",
  "Hartwell", "Irondale", "Jeyford", "Kelwick", "Lanford",
  "Marbury", "Norvik", "Overton", "Penfield", "Quedbury",
  "Ravenswood", "Saltwick", "Stonebridge", "Thornfield", "Ulverton",
  "Vane Cross", "Westmoor", "Yarwick", "Aldgate", "Blackfen",
  "Castleford", "Dornfield", "Elmwick", "Fairhollow", "Greenside",
  "Halebrook", "Ingleton", "Jarlbury", "Kettlewick", "Langholm",
  "Millford", "Northgate", "Oldwick", "Penswick", "Ravenbridge",
  "Saltmarsh", "Thornbury", "Underwick", "Vexley", "Watergate",
  "Yarmouth Cross", "Aldwick Bay", "Brookhollow", "Clearwater", "Dunmore",
  "Eastbridge", "Fieldwick", "Grantwick", "Hazelhurst", "Ironwick",
  "Jarvis Cross", "Keldgate", "Larkspur", "Millgate", "Northwick",
  "Oldstone", "Pineford", "Queensbury", "Ridgewood", "Stanwick",
  "Tideswell", "Underfall", "Vexford", "Westgate", "Yeldon",
];

function shuffleNames(rng: ReturnType<typeof makeSeededRNG>): string[] {
  const arr = [...NAME_POOL];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.pick() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ------------------------------------------------------------------
// Population distribution
// POP_MU=11.2, POP_SIGMA=0.85 → median ~73k, range roughly 15k–950k
// ------------------------------------------------------------------

function drawPopulations(
  rng: ReturnType<typeof makeSeededRNG>,
  count: number,
  wp: WorldParams
): number[] {
  const pops: number[] = [];
  for (let i = 0; i < count; i++) {
    const raw = Math.round(rng.lognormal(wp.popMu, wp.popSigma));
    pops.push(clamp(raw, wp.popMin, wp.popMax));
  }
  return pops;
}

// ------------------------------------------------------------------
// buildCityNodes — procedural generator
// ------------------------------------------------------------------

export function buildCityNodes(
  seed = 12345,
  config: MapConfig = defaultMapConfig,
  wp: WorldParams = defaultWorldParams
): Record<string, CityNode> {
  const rng = makeSeededRNG(seed);
  const cfg = GameConfig.cityLife;
  const { nodeCount, portCount, mapType, difficulty,
          canvasWidth, canvasHeight, portEdgeMargin } = config;

  // --- Step 1: Region centres ---
  const regionCount = clamp(
    Math.round(nodeCount / wp.nodesPerRegion), wp.regionCountMin, wp.regionCountMax
  );
  const minCentreGap = canvasWidth * wp.centreGapFactor;
  const margin = wp.centreMargin;

  const centres: { x: number; y: number; zone: ZoneChar }[] = [];
  for (let i = 0; i < regionCount; i++) {
    let pos = { x: 0, y: 0 };
    let attempts = 0;
    let gap = minCentreGap;
    while (attempts < wp.centreMaxAttempts) {
      pos = {
        x: margin + rng.pick() * (canvasWidth  - margin * 2),
        y: margin + rng.pick() * (canvasHeight - margin * 2),
      };
      const tooClose = centres.some((c) => euclidean(c, pos) < gap);
      if (!tooClose) break;
      attempts++;
      if (attempts % wp.centreGapRelaxEvery === 0) gap *= wp.centreGapRelaxFactor;
    }
    centres.push({ ...pos, zone: drawZoneChar(rng, mapType, difficulty, wp) });
  }

  // --- Step 2: Draw all populations, sort descending ---
  const allPops = drawPopulations(rng, nodeCount, wp).sort((a, b) => b - a);

  // Assign populations to zones: metropolitan gets highest, rural gets lowest.
  // Build ordered assignment: metro > coastal > industrial > rural
  const ZONE_ORDER: ZoneChar[] = ["metropolitan", "coastal", "industrial", "rural"];
  const centresByZone: Map<ZoneChar, number[]> = new Map();
  ZONE_ORDER.forEach((z) => centresByZone.set(z, []));
  centres.forEach((c, idx) => centresByZone.get(c.zone)!.push(idx));

  // Slots per centre (round-robin assignment of nodes to centres)
  const slotsPerCentre = Array(regionCount).fill(0) as number[];
  for (let i = 0; i < nodeCount; i++) slotsPerCentre[i % regionCount]++;

  // Build ordered centre sequence: higher-priority zones first
  const orderedCentreIndices: number[] = [];
  for (const z of ZONE_ORDER) {
    for (const idx of centresByZone.get(z) ?? []) orderedCentreIndices.push(idx);
  }

  // Assign pops to nodes: iterate centre order, fill slots with next pop from sorted list
  const nodeAssignments: { centreIdx: number; pop: number }[] = [];
  let popPtr = 0;
  for (const cIdx of orderedCentreIndices) {
    const slots = slotsPerCentre[cIdx];
    for (let s = 0; s < slots; s++) {
      nodeAssignments.push({ centreIdx: cIdx, pop: allPops[popPtr++] ?? wp.popMin });
    }
  }

  // --- Step 3: Shuffle names ---
  const names = shuffleNames(rng);
  let nameIdx = 0;

  // --- Step 4: Place nodes with Gaussian scatter ---
  const sigma = canvasWidth / (regionCount * wp.scatterSigmaFactor);
  const PADDING = wp.nodePadding;
  const placed: { x: number; y: number }[] = [];

  // --- Step 5: Collect port slots (coastal zones preferred) ---
  // We'll designate some nodes as ports after placement.
  // First, identify which centres are coastal.
  const coastalCentreIndices = new Set(
    centres.map((c, i) => (c.zone === "coastal" ? i : -1)).filter((i) => i >= 0)
  );

  const nodes: CityNode[] = [];

  for (const { centreIdx, pop } of nodeAssignments) {
    const centre = centres[centreIdx];
    let pos = { x: 0, y: 0 };
    let attempts = 0;
    while (attempts < wp.placementMaxAttempts) {
      pos = {
        x: clamp(centre.x + rng.normal(0, sigma), PADDING, canvasWidth  - PADDING),
        y: clamp(centre.y + rng.normal(0, sigma), PADDING, canvasHeight - PADDING),
      };
      const tooClose = placed.some((p) => euclidean(p, pos) < wp.minNodeSeparation);
      if (!tooClose) break;
      attempts++;
      if (attempts === wp.placementMaxAttempts) {
        // Shift outward from nearest neighbour
        const nearest = placed.reduce((best, p) =>
          euclidean(p, pos) < euclidean(best, pos) ? p : best, placed[0] ?? pos
        );
        const dx = pos.x - nearest.x || 1;
        const dy = pos.y - nearest.y || 1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        pos = {
          x: clamp(nearest.x + (dx / len) * wp.placementPushDistance, PADDING, canvasWidth  - PADDING),
          y: clamp(nearest.y + (dy / len) * wp.placementPushDistance, PADDING, canvasHeight - PADDING),
        };
      }
    }
    placed.push(pos);

    const zone = centres[centreIdx].zone;
    const type = "city" as const;
    const factorySlots = pop >= 300_000 ? 6
      : pop >= 150_000 ? 4
      : pop >= 60_000  ? 3
      : 2;

    const wealthIndex = drawWealthIndex(rng, zone, wp);
    const storeLocations = makeStoreLocsForPop(pop, rng);
    const name = names[nameIdx++] ?? `Node-${nodes.length}`;
    const nodeId = `node_${nodes.length}`;

    nodes.push({
      id: nodeId,
      name,
      type,
      zone,
      population: pop,
      factorySlots,
      energyCostMultiplier: 1.0,
      harborAccess: false,
      position: pos,
      wealthIndex,
      industrialIdentity: {},
      demandModifier: 1.0,
      storeLocations,
      geoCeiling: 0,
      baseGrowthRate: 0,
      baseWealthRate: 0,
      populationHistory: [],
      wealthHistory: [],
      // internal: track which centre this node belongs to for link generation
      _centreIdx: centreIdx,
    } as CityNode & { _centreIdx: number });
  }

  // --- Step 6: Designate port nodes ---
  // Prefer largest-population nodes in coastal zones; fall back to any non-metro zone.
  const coastalNodes = nodes
    .map((n, i) => ({ n, i, coastal: coastalCentreIndices.has((n as CityNode & { _centreIdx: number })._centreIdx) }))
    .filter((x) => x.coastal)
    .sort((a, b) => b.n.population - a.n.population);

  const nonMetroNodes = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => {
      const ci = (n as CityNode & { _centreIdx: number })._centreIdx;
      return centres[ci].zone !== "metropolitan";
    })
    .sort((a, b) => b.n.population - a.n.population);

  const portNodeIndices = new Set<number>();
  let portsFilled = 0;

  // First fill from coastal nodes
  for (const { i } of coastalNodes) {
    if (portsFilled >= portCount) break;
    portNodeIndices.add(i);
    portsFilled++;
  }
  // Remaining ports from non-metro nodes
  for (const { i } of nonMetroNodes) {
    if (portsFilled >= portCount) break;
    if (!portNodeIndices.has(i)) {
      portNodeIndices.add(i);
      portsFilled++;
    }
  }

  // Convert port nodes: move within portEdgeMargin of nearest canvas edge
  for (const idx of portNodeIndices) {
    const n = nodes[idx];
    const pos = n.position;
    // Find nearest edge and clamp to margin band
    const distL = pos.x;
    const distR = canvasWidth  - pos.x;
    const distT = pos.y;
    const distB = canvasHeight - pos.y;
    const minDist = Math.min(distL, distR, distT, distB);
    let newPos = { ...pos };
    if (minDist === distL) newPos.x = clamp(pos.x, PADDING, portEdgeMargin);
    else if (minDist === distR) newPos.x = clamp(pos.x, canvasWidth - portEdgeMargin, canvasWidth - PADDING);
    else if (minDist === distT) newPos.y = clamp(pos.y, PADDING, portEdgeMargin);
    else newPos.y = clamp(pos.y, canvasHeight - portEdgeMargin, canvasHeight - PADDING);

    n.position = newPos;
    (n as CityNode & { type: string }).type = "port";
    n.harborAccess = true;
    // Ports get a specific store layout: A=1, B=2, C=3
    n.storeLocations = makeStoreLocations([
      { cls: "A", size: pickSize(rng), count: 1 },
      { cls: "B", size: pickSize(rng), count: 1 },
      { cls: "B", size: pickSize(rng), count: 1 },
      { cls: "C", size: pickSize(rng), count: 1 },
      { cls: "C", size: pickSize(rng), count: 1 },
      { cls: "C", size: pickSize(rng), count: 1 },
    ]);
    // factorySlots already set from population formula; no override needed
    // Rename port nodes
    n.name = `Port ${n.name}`;
  }

  // --- Step 7: Compute geoCeiling / baseGrowthRate / baseWealthRate ---
  for (const node of nodes) {
    const sizeFactor = clamp(
      wp.geoCeilingBase - Math.log10(node.population) * wp.geoCeilingSlope,
      wp.geoCeilingFactorMin, wp.geoCeilingFactorMax
    );
    const territoryFactor = rng.lognormal(wp.territoryMu, wp.territorySigma);
    node.geoCeiling = Math.round(node.population * sizeFactor * territoryFactor);
    node.baseGrowthRate = clamp(
      rng.normal(cfg.baseGrowthRateMean, cfg.baseGrowthRateStd),
      cfg.baseGrowthRateMin, cfg.baseGrowthRateMax
    );
    node.baseWealthRate = clamp(
      rng.normal(cfg.baseWealthRateMean, cfg.baseWealthRateStd),
      cfg.baseWealthRateMin, cfg.baseWealthRateMax
    );
  }

  // Strip internal _centreIdx before returning
  const result: Record<string, CityNode> = {};
  for (const node of nodes) {
    const { _centreIdx, ...clean } = node as CityNode & { _centreIdx: number };
    void _centreIdx;
    result[clean.id] = clean;
  }
  return result;
}

// ------------------------------------------------------------------
// buildMapLinks — procedural link generator (RNG independent of nodes)
// ------------------------------------------------------------------

/**
 * Build the road and highway network over an already-generated set of city nodes.
 *
 * Deterministic and RNG-free: every decision is a function of node positions,
 * populations and `node.zone`. The former `seed` parameter was removed when the
 * buildCityNodes Step 1 replay was dropped — this function no longer draws.
 */
export function buildMapLinks(
  cityNodes: Record<string, CityNode>,
  config: MapConfig = defaultMapConfig,
  wp: WorldParams = defaultWorldParams
): Record<string, MapLink> {
  const { connectivity, minimumDegree, infrastructure, canvasWidth, canvasHeight, highwayMaxDistance } = config;

  // worldDiagonalKm — not the canvas size — is what sets the world's real extent.
  const SCALE_FACTOR = wp.worldDiagonalKm / Math.sqrt(canvasWidth ** 2 + canvasHeight ** 2);

  // intraZone: multiplier on same-zone link thresholds
  // crossZone: multiplier on cross-zone link thresholds (lower = zones stay more separate)
  const { intraZone: intraFactor, crossZone: crossFactor } = wp.connectivityFactors[connectivity];

  // "advanced" infrastructure gets a wider MST reach
  const effectiveHighwayMaxDistance = infrastructure === "advanced"
    ? highwayMaxDistance * wp.highwayAdvancedReachMultiplier
    : highwayMaxDistance;

  const nodes = Object.values(cityNodes);
  const nodeCount = nodes.length;

  // Build adjacency set to avoid duplicate edges
  const edgeSet = new Set<string>();
  function edgeKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  const pendingLinks: { from: string; to: string; isHighway: boolean }[] = [];

  function addLink(fromId: string, toId: string, isHighway: boolean) {
    const key = edgeKey(fromId, toId);
    if (edgeSet.has(key)) {
      if (isHighway) {
        const existing = pendingLinks.find((l) => edgeKey(l.from, l.to) === key);
        if (existing) existing.isHighway = true;
      }
      return;
    }
    edgeSet.add(key);
    pendingLinks.push({ from: fromId, to: toId, isHighway });
  }

  // --- Zone lookup ---
  // Zones are carried on the nodes themselves (set once in buildCityNodes), so
  // there is nothing to reconstruct here. This used to replay buildCityNodes
  // Step 1 against a fresh RNG to recover region centres; that coupling meant any
  // change to the number or order of RNG draws in Step 1 silently corrupted the
  // link thresholds. Reading node.zone removes the trap entirely.
  const nodeZone = new Map<string, ZoneChar>(nodes.map((n) => [n.id, n.zone]));

  // --- Step 1: Intra-zone connections with per-zone thresholds ---
  // Rural stays sparse; metro is denser. All thresholds must exceed the 90px
  // minimum node separation so organic connections can actually form.
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const zA = nodeZone.get(a.id)!;
      const zB = nodeZone.get(b.id)!;
      const baseThreshold = (wp.zoneThresholds[zA] + wp.zoneThresholds[zB]) / 2;
      // Same-zone pairs use intraFactor; cross-zone pairs use crossFactor.
      // "isolated" keeps zones largely separate; "dense" integrates them freely.
      const factor = zA === zB ? intraFactor : crossFactor;
      if (euclidean(a.position, b.position) < baseThreshold * factor) {
        addLink(a.id, b.id, false);
      }
    }
  }

  // --- Step 2: Highway network via MST over large nodes ---
  // Candidate set and MST reach depend on the infrastructure parameter.
  let highwayCandidates: CityNode[];
  switch (infrastructure) {
    case "undeveloped":
      highwayCandidates = [];
      break;
    case "basic":
      // Highways only between the top ~8% of cities by population (min 3).
      highwayCandidates = [...nodes]
        .sort((a, b) => b.population - a.population)
        .slice(0, Math.max(wp.highwayBasicMinimum, Math.round(nodes.length * wp.highwayBasicFraction)));
      break;
    case "developed":
      highwayCandidates = nodes.filter((n) => n.population >= wp.highwayDevelopedMinPop);
      break;
    case "advanced":
      // More cities qualify; effectiveHighwayMaxDistance is already widened above.
      highwayCandidates = nodes.filter((n) => n.population >= wp.highwayAdvancedMinPop);
      break;
  }

  if (highwayCandidates.length >= 2) {
    const inMST = new Set<string>();
    inMST.add(highwayCandidates[0].id);

    while (inMST.size < highwayCandidates.length) {
      let bestDist = Infinity;
      let bestFrom = "";
      let bestTo   = "";

      for (const fromId of inMST) {
        const fromNode = cityNodes[fromId];
        for (const candidate of highwayCandidates) {
          if (inMST.has(candidate.id)) continue;
          const d = euclidean(fromNode.position, candidate.position);
          if (d < bestDist && d <= effectiveHighwayMaxDistance) {
            bestDist = d;
            bestFrom = fromId;
            bestTo   = candidate.id;
          }
        }
      }

      if (!bestTo) {
        // No reachable candidate within range — start a new sub-tree.
        const nextStart = highwayCandidates.find((n) => !inMST.has(n.id));
        if (nextStart) inMST.add(nextStart.id);
        continue;
      }

      addLink(bestFrom, bestTo, true);
      inMST.add(bestTo);
    }
  }

  // --- Step 3: Port highway hookup ---
  // If a port is not already on a highway link, connect it to the nearest
  // highway node within effectiveHighwayMaxDistance.
  const highwayNodeIds = new Set(
    pendingLinks.filter((l) => l.isHighway).flatMap((l) => [l.from, l.to])
  );

  const portNodes = nodes.filter((n) => n.type === "port");
  for (const port of portNodes) {
    const alreadyOnHighway = pendingLinks.some(
      (l) => l.isHighway && (l.from === port.id || l.to === port.id)
    );
    if (alreadyOnHighway) continue;

    const nearestHw = [...highwayNodeIds]
      .map((id) => ({ id, d: euclidean(port.position, cityNodes[id]?.position ?? port.position) }))
      .filter((x) => x.d <= effectiveHighwayMaxDistance)
      .sort((a, b) => a.d - b.d)[0];

    if (nearestHw) {
      addLink(port.id, nearestHw.id, true);
      highwayNodeIds.add(port.id);
    } else {
      // Port too remote for highway; add a road to nearest non-port city
      const nearestCity = nodes
        .filter((n) => n.type !== "port")
        .sort((a, b) => euclidean(a.position, port.position) - euclidean(b.position, port.position))[0];
      if (nearestCity) addLink(port.id, nearestCity.id, false);
    }
  }

  // --- Step 3.5: Minimum degree enforcement ---
  // Ensure every node has at least minimumDegree road connections.
  // Runs before BFS so the fallback rarely fires.
  if (minimumDegree > 0) {
    for (const node of nodes) {
      const degree = pendingLinks.filter((l) => l.from === node.id || l.to === node.id).length;
      let needed = minimumDegree - degree;
      if (needed <= 0) continue;

      const candidates = nodes
        .filter((n) => n.id !== node.id && !edgeSet.has(edgeKey(node.id, n.id)))
        .sort((a, b) =>
          euclidean(a.position, node.position) - euclidean(b.position, node.position)
        );

      for (const target of candidates) {
        if (needed <= 0) break;
        addLink(node.id, target.id, false);
        needed--;
      }
    }
  }

  // --- Step 4: Connectivity guarantee (BFS) ---
  const reachable = new Set<string>();
  const startId = nodes[0]?.id;
  if (startId) {
    const adj = new Map<string, string[]>();
    for (const { from, to } of pendingLinks) {
      if (!adj.has(from)) adj.set(from, []);
      if (!adj.has(to)) adj.set(to, []);
      adj.get(from)!.push(to);
      adj.get(to)!.push(from);
    }
    const queue = [startId];
    reachable.add(startId);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!reachable.has(nb)) {
          reachable.add(nb);
          queue.push(nb);
        }
      }
    }

    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        const nearest = [...reachable]
          .map((rid) => ({ rid, d: euclidean(cityNodes[rid].position, node.position) }))
          .sort((a, b) => a.d - b.d)[0];
        if (nearest) {
          console.warn(`Forced connectivity edge: ${nearest.rid} → ${node.id}`);
          addLink(nearest.rid, node.id, false);
          if (!adj.has(nearest.rid)) adj.set(nearest.rid, []);
          if (!adj.has(node.id)) adj.set(node.id, []);
          adj.get(nearest.rid)!.push(node.id);
          adj.get(node.id)!.push(nearest.rid);
          reachable.add(node.id);
          const subq = [node.id];
          while (subq.length > 0) {
            const cur2 = subq.shift()!;
            for (const nb of adj.get(cur2) ?? []) {
              if (!reachable.has(nb)) { reachable.add(nb); subq.push(nb); }
            }
          }
        }
      }
    }
  }

  // --- Step 5: Build MapLink records ---
  const links: Record<string, MapLink> = {};
  for (const { from, to, isHighway } of pendingLinks) {
    const fromNode = cityNodes[from];
    const toNode   = cityNodes[to];
    if (!fromNode || !toNode) continue;
    const id = generateId();
    const rawKm = euclidean(fromNode.position, toNode.position) * SCALE_FACTOR;
    const distKm = clamp(Math.round(rawKm), wp.linkDistanceMinKm, wp.linkDistanceMaxKm);
    links[id] = {
      id,
      fromNodeId: from,
      toNodeId:   to,
      baseCost:   GameConfig.map.transportCostPerLink,
      capacity:   isHighway ? GameConfig.map.linkCapacityHighway : GameConfig.map.linkCapacityRoad,
      investmentLevel: 0,
      distance:   distKm,
      linkType:   isHighway ? "highway" : "road",
    };
  }
  return links;
}

// ------------------------------------------------------------------
// Spatial queries (unchanged)
// ------------------------------------------------------------------

/** Returns IDs of nodes directly connected to nodeId (undirected). */
export function getConnectedNodes(state: GameState, nodeId: string): string[] {
  const connected = new Set<string>();
  for (const link of Object.values(state.mapLinks)) {
    if (link.fromNodeId === nodeId) connected.add(link.toNodeId);
    if (link.toNodeId === nodeId) connected.add(link.fromNodeId);
  }
  return [...connected];
}

/** Returns true if a node type is a harbor source (can sell goods internationally). */
function isHarborType(type: string): boolean {
  return type === "harbor" || type === "port";
}

export function isHarborAccessible(state: GameState, nodeId: string): boolean {
  const node = state.cityNodes[nodeId];
  if (!node) return false;
  if (isHarborType(node.type)) return true;
  for (const link of Object.values(state.mapLinks)) {
    const neighborId =
      link.fromNodeId === nodeId ? link.toNodeId :
      link.toNodeId === nodeId ? link.fromNodeId : null;
    if (!neighborId) continue;
    if (isHarborType(state.cityNodes[neighborId]?.type ?? "")) return true;
  }
  return false;
}

export function getHarborLinkDistance(state: GameState, fromNodeId: string): number {
  const harborNodeIds = new Set(
    Object.values(state.cityNodes)
      .filter((n) => isHarborType(n.type))
      .map((n) => n.id)
  );
  if (harborNodeIds.has(fromNodeId)) return 0;

  const adj = new Map<string, string[]>();
  for (const link of Object.values(state.mapLinks)) {
    if (!adj.has(link.fromNodeId)) adj.set(link.fromNodeId, []);
    if (!adj.has(link.toNodeId))   adj.set(link.toNodeId, []);
    adj.get(link.fromNodeId)!.push(link.toNodeId);
    adj.get(link.toNodeId)!.push(link.fromNodeId);
  }

  const visited = new Set<string>();
  const queue: { nodeId: string; hops: number }[] = [{ nodeId: fromNodeId, hops: 0 }];
  visited.add(fromNodeId);
  while (queue.length > 0) {
    const { nodeId, hops } = queue.shift()!;
    for (const neighbor of adj.get(nodeId) ?? []) {
      if (visited.has(neighbor)) continue;
      if (harborNodeIds.has(neighbor)) return hops + 1;
      visited.add(neighbor);
      queue.push({ nodeId: neighbor, hops: hops + 1 });
    }
  }
  return Infinity;
}

export function getTransportCost(state: GameState, fromNodeId: string, toNodeId: string): number {
  if (fromNodeId === toNodeId) return 0;

  const adj = new Map<string, { neighbor: string; cost: number }[]>();
  for (const link of Object.values(state.mapLinks)) {
    const reduction = GameConfig.map.linkCostReductionPerLevel * link.investmentLevel;
    const cost = link.baseCost * (1 - reduction);
    if (!adj.has(link.fromNodeId)) adj.set(link.fromNodeId, []);
    if (!adj.has(link.toNodeId)) adj.set(link.toNodeId, []);
    adj.get(link.fromNodeId)!.push({ neighbor: link.toNodeId, cost });
    adj.get(link.toNodeId)!.push({ neighbor: link.fromNodeId, cost });
  }

  const dist = new Map<string, number>();
  const queue: { nodeId: string; cost: number }[] = [{ nodeId: fromNodeId, cost: 0 }];
  dist.set(fromNodeId, 0);
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const { nodeId, cost } = queue.shift()!;
    if (cost > (dist.get(nodeId) ?? Infinity)) continue;
    if (nodeId === toNodeId) return cost;
    for (const { neighbor, cost: edgeCost } of adj.get(nodeId) ?? []) {
      const newCost = cost + edgeCost;
      if (newCost < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, newCost);
        queue.push({ nodeId: neighbor, cost: newCost });
      }
    }
  }
  return dist.get(toNodeId) ?? Infinity;
}
