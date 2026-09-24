/**
 * World generation regression check.
 *
 *   npx tsx scripts/verify-world-hash.ts
 *
 * Hashes everything that describes a generated world — node positions to nine
 * decimals, names, types, zones, populations, factory slots, wealth, geoCeiling,
 * growth and wealth rates, store counts, and the complete link set — across every
 * named preset and a fixed set of seeds.
 *
 * Run it before and after any change that is supposed to be behaviour-neutral:
 * hoisting a literal into WorldParams, refactoring a helper, reordering code.
 * Identical output means identical worlds. It is the check that lets the World
 * Builder be trusted — see docs/world-builder.md.
 *
 * If you deliberately change generation, the hashes SHOULD move. Record the new
 * ones in the commit message so the next person can tell intent from accident.
 */

import { createHash } from "node:crypto";
import { buildCityNodes, buildMapLinks } from "../src/engine/map";
import {
  defaultMapConfig, europeanMapConfig, developingMapConfig,
  frontierMapConfig, industrialMapConfig,
} from "../src/config/gameConfig";
import { defaultWorldParams } from "../src/config/worldParams";

const PRESETS = {
  default: defaultMapConfig,
  european: europeanMapConfig,
  developing: developingMapConfig,
  frontier: frontierMapConfig,
  industrial: industrialMapConfig,
};
const SEEDS = [1, 7, 42, 1234, 99999];

// buildMapLinks warns on every forced-connectivity edge; keep the output readable.
const realWarn = console.warn;
console.warn = () => {};

const rows: string[] = [];
for (const [name, cfg] of Object.entries(PRESETS)) {
  for (const seed of SEEDS) {
    const nodes = buildCityNodes(seed, cfg, defaultWorldParams);
    const links = buildMapLinks(nodes, cfg, defaultWorldParams);

    const nodeSig = Object.values(nodes).map((n) =>
      [n.id, n.name, n.type, n.zone, n.population, n.factorySlots,
       n.position.x.toFixed(9), n.position.y.toFixed(9), n.wealthIndex.toFixed(9),
       n.geoCeiling, n.baseGrowthRate.toFixed(9), n.baseWealthRate.toFixed(9),
       n.storeLocations.length].join("|")
    ).join("\n");

    const linkSig = Object.values(links)
      .map((l) => `${l.fromNodeId}>${l.toNodeId}|${l.linkType}|${l.distance}|${l.capacity}`)
      .sort()
      .join("\n");

    const hash = createHash("sha256").update(`${nodeSig}\n##\n${linkSig}`).digest("hex").slice(0, 16);
    rows.push(
      `${name.padEnd(11)} seed ${String(seed).padStart(5)}  ` +
      `nodes ${Object.keys(nodes).length}  links ${String(Object.keys(links).length).padStart(3)}  sha ${hash}`
    );
  }
}

console.warn = realWarn;
console.log(rows.join("\n"));
