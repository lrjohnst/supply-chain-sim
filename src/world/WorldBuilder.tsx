import { useCallback, useMemo, useState } from "react";
import type { MapConfig, ZoneChar } from "../types";
import {
  defaultMapConfig, europeanMapConfig, developingMapConfig,
  frontierMapConfig, industrialMapConfig,
} from "../config/gameConfig";
import { defaultWorldParams, type WorldParams } from "../config/worldParams";
import { generateWorld, advanceWorld, cloneWorld, computeStats, type World } from "./worldModel";
import WorldMap from "./WorldMap";
import { Section, Slider, NumberField, Select, Toggle, Stat } from "./controls";

const PRESETS: Record<string, MapConfig> = {
  Default: defaultMapConfig,
  European: europeanMapConfig,
  Developing: developingMapConfig,
  Frontier: frontierMapConfig,
  Industrial: industrialMapConfig,
};

const ZONES: ZoneChar[] = ["metropolitan", "industrial", "rural", "coastal"];

/** Everything needed to reproduce a world, exactly. This is what gets exported. */
interface WorldSpec {
  formatVersion: 1;
  seed: number;
  map: MapConfig;
  world: WorldParams;
}

function randomSeed() { return Math.floor(Math.random() * 2 ** 32); }

export default function WorldBuilder() {
  const [seed, setSeed] = useState(() => randomSeed());
  const [map, setMap] = useState<MapConfig>(defaultMapConfig);
  const [wp, setWp] = useState<WorldParams>(defaultWorldParams);
  const [showLabels, setShowLabels] = useState(false);
  const [showTerrain, setShowTerrain] = useState(true);
  const [autoRegen, setAutoRegen] = useState(true);
  const [fitKey, setFitKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const [world, setWorld] = useState<World>(() => generateWorld(seed, defaultMapConfig, defaultWorldParams));
  // Step 0 is kept whole so Reset is exact, not a re-derivation.
  const [origin, setOrigin] = useState<World>(() => cloneWorld(world));

  const regenerate = useCallback((s = seed, m = map, p = wp) => {
    const w = generateWorld(s, m, p);
    setWorld(w);
    setOrigin(cloneWorld(w));
    setFitKey((k) => k + 1);
  }, [seed, map, wp]);

  // Any parameter edit regenerates immediately when auto is on — that tight loop
  // is the point of the tool. Generation of a 50-node world is sub-millisecond.
  const patchMap = useCallback((patch: Partial<MapConfig>) => {
    setMap((m) => {
      const next = { ...m, ...patch };
      if (autoRegen) regenerate(seed, next, wp);
      return next;
    });
  }, [autoRegen, regenerate, seed, wp]);

  const patchWp = useCallback((patch: Partial<WorldParams>) => {
    setWp((p) => {
      const next = { ...p, ...patch };
      if (autoRegen) regenerate(seed, map, next);
      return next;
    });
  }, [autoRegen, regenerate, seed, map]);

  const step = useCallback((n: number) => setWorld((w) => advanceWorld(cloneWorld(w), n)), []);
  const reset = useCallback(() => setWorld(cloneWorld(origin)), [origin]);

  const stats = useMemo(() => computeStats(world, map, wp), [world, map, wp]);

  const spec: WorldSpec = useMemo(() => ({ formatVersion: 1, seed, map, world: wp }), [seed, map, wp]);
  const specJson = useMemo(() => JSON.stringify(spec, null, 2), [spec]);

  const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(null), 2500); };

  const copySpec = async () => {
    try {
      await navigator.clipboard.writeText(specJson);
      flash("Parameters copied to clipboard");
    } catch {
      flash("Clipboard blocked — use Download instead");
    }
  };

  const downloadSpec = () => {
    const blob = new Blob([specJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `world-${seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSpec = () => {
    const raw = window.prompt("Paste a world JSON export:");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<WorldSpec>;
      if (!parsed.map || !parsed.world || typeof parsed.seed !== "number") {
        throw new Error("missing seed, map or world");
      }
      // Merge over the defaults so an export from an older format version, or one
      // missing a field added since, still loads instead of producing undefined.
      const m = { ...defaultMapConfig, ...parsed.map };
      const p = { ...defaultWorldParams, ...parsed.world };
      setSeed(parsed.seed); setMap(m); setWp(p);
      regenerate(parsed.seed, m, p);
      flash("World imported");
    } catch (e) {
      flash(`Could not read that JSON — ${e instanceof Error ? e.message : "invalid"}`);
    }
  };

  const fmtInt = (n: number) => Math.round(n).toLocaleString("nl-NL");

  return (
    <div className="wb">
      <header className="wb-topbar">
        <div className="wb-brand">
          <h1>World Builder</h1>
          <span>Supply Chain Sim — same generator as the game</span>
        </div>

        <div className="wb-seedbox">
          <label>
            Seed
            <input type="number" value={seed}
                   onChange={(e) => setSeed(Number(e.target.value))} />
          </label>
          <button onClick={() => { const s = randomSeed(); setSeed(s); regenerate(s); }}>🎲 Random</button>
          <button className="wb-primary" onClick={() => regenerate()}>Regenerate</button>
        </div>

        <div className="wb-steps">
          <span className="wb-stepcount">step <strong>{world.step}</strong></span>
          <button onClick={() => step(1)}>+1</button>
          <button onClick={() => step(10)}>+10</button>
          <button onClick={() => step(50)}>+50</button>
          <button onClick={reset} disabled={world.step === 0}>⟲ Reset to 0</button>
        </div>
      </header>

      <div className="wb-body">
        <aside className="wb-panel">
          <div className="wb-panel-head">
            <Toggle label="Auto-regenerate on change" value={autoRegen} onChange={setAutoRegen} />
            {!autoRegen && <p className="wb-hint">Changes apply on Regenerate.</p>}
          </div>

          <Section title="Presets" open>
            <div className="wb-presets">
              {Object.entries(PRESETS).map(([name, cfg]) => (
                <button key={name} onClick={() => { setMap(cfg); regenerate(seed, cfg, wp); }}>{name}</button>
              ))}
            </div>
            <button className="wb-wide" onClick={() => { setWp(defaultWorldParams); regenerate(seed, map, defaultWorldParams); }}>
              Reset hidden parameters
            </button>
          </Section>

          <Section title="Player-visible" subtitle="also on the game's start screen" open>
            <Slider label="Map size" value={map.nodeCount} min={10} max={120} step={1}
                    onChange={(v) => patchMap({ nodeCount: v })} hint="Total cities." />
            <Slider label="Ports" value={map.portCount} min={0} max={12} step={1}
                    onChange={(v) => patchMap({ portCount: v })} />
            <Select label="Map type" value={map.mapType}
                    options={["trading", "industrial", "frontier"] as const}
                    onChange={(v) => patchMap({ mapType: v })} hint="Shifts the zone weights." />
            <Select label="Connectivity" value={map.connectivity}
                    options={["isolated", "sparse", "normal", "dense"] as const}
                    onChange={(v) => patchMap({ connectivity: v })} />
            <Slider label="Minimum degree" value={map.minimumDegree} min={0} max={4} step={1}
                    onChange={(v) => patchMap({ minimumDegree: v })}
                    hint="Guaranteed roads per city. 2 = no dead ends." />
            <Select label="Infrastructure" value={map.infrastructure}
                    options={["undeveloped", "basic", "developed", "advanced"] as const}
                    onChange={(v) => patchMap({ infrastructure: v })} />
            <Select label="Difficulty" value={map.difficulty}
                    options={["easy", "medium", "hard"] as const}
                    onChange={(v) => patchMap({ difficulty: v })} />
          </Section>

          <Section title="Scale" subtitle="the world's real size">
            <Slider label="World diagonal" value={wp.worldDiagonalKm} min={100} max={2000} step={10}
                    onChange={(v) => patchWp({ worldDiagonalKm: v })}
                    format={(v) => `${v} km`}
                    hint="This — not the canvas — sets how big the world is. NL is ~300 km corner to corner; 800 gives an Italy-sized country." />
            <Slider label="Link length floor" value={wp.linkDistanceMinKm} min={1} max={60} step={1}
                    onChange={(v) => patchWp({ linkDistanceMinKm: v })}
                    format={(v) => `${v} km`}
                    hint="No road is ever shorter than this. At 20 km a dense Dutch network is impossible however you scale the world." />
            <Slider label="Link length ceiling" value={wp.linkDistanceMaxKm} min={20} max={400} step={5}
                    onChange={(v) => patchWp({ linkDistanceMaxKm: v })} format={(v) => `${v} km`} />
            <NumberField label="Canvas width" value={map.canvasWidth} step={100}
                         onChange={(v) => patchMap({ canvasWidth: v })}
                         hint="Coordinate space only. Bigger canvas = nodes spread over more pixels while the pixel-based thresholds stay put, so this quietly acts as a connectivity knob." />
            <NumberField label="Canvas height" value={map.canvasHeight} step={100}
                         onChange={(v) => patchMap({ canvasHeight: v })} />
          </Section>

          <Section title="Regions & placement">
            <Slider label="Nodes per region" value={wp.nodesPerRegion} min={2} max={30} step={1}
                    onChange={(v) => patchWp({ nodesPerRegion: v })}
                    hint="Region count = nodeCount / this, clamped." />
            <Slider label="Region count min" value={wp.regionCountMin} min={1} max={12} step={1}
                    onChange={(v) => patchWp({ regionCountMin: v })} />
            <Slider label="Region count max" value={wp.regionCountMax} min={1} max={16} step={1}
                    onChange={(v) => patchWp({ regionCountMax: v })} />
            <Slider label="Region separation" value={wp.centreGapFactor} min={0.02} max={0.6} step={0.01}
                    onChange={(v) => patchWp({ centreGapFactor: v })}
                    format={(v) => `${(v * 100).toFixed(0)}% of width`}
                    hint="Lower values let regions interleave instead of forming separate blobs." />
            <Slider label="Scatter tightness" value={wp.scatterSigmaFactor} min={0.5} max={8} step={0.1}
                    onChange={(v) => patchWp({ scatterSigmaFactor: v })}
                    hint="Higher = tighter clusters around each centre; lower = cities spread out." />
            <Slider label="Min city separation" value={wp.minNodeSeparation} min={20} max={220} step={5}
                    onChange={(v) => patchWp({ minNodeSeparation: v })}
                    format={(v) => `${v} px`}
                    hint="Must stay below every zone threshold below, or no road can form organically." />
            <Slider label="Canvas padding" value={wp.nodePadding} min={0} max={200} step={5}
                    onChange={(v) => patchWp({ nodePadding: v })} format={(v) => `${v} px`} />
            <Slider label="Port edge margin" value={map.portEdgeMargin} min={20} max={400} step={10}
                    onChange={(v) => patchMap({ portEdgeMargin: v })} format={(v) => `${v} px`}
                    hint="How close ports sit to the coast." />
          </Section>

          <Section title="Population">
            <Slider label="Population μ (log)" value={wp.popMu} min={8} max={14} step={0.05}
                    onChange={(v) => patchWp({ popMu: v })}
                    format={(v) => `${v.toFixed(2)} → median ${Math.round(Math.exp(v)).toLocaleString("nl-NL")}`} />
            <Slider label="Population σ (log)" value={wp.popSigma} min={0.1} max={2} step={0.05}
                    onChange={(v) => patchWp({ popSigma: v })}
                    hint="Spread between the smallest and biggest city." />
            <NumberField label="Population floor" value={wp.popMin} step={1000}
                         onChange={(v) => patchWp({ popMin: v })} />
            <NumberField label="Population ceiling" value={wp.popMax} step={10000}
                         onChange={(v) => patchWp({ popMax: v })} />
            <Slider label="Growth ceiling base" value={wp.geoCeilingBase} min={2} max={16} step={0.1}
                    onChange={(v) => patchWp({ geoCeilingBase: v })}
                    hint="geoCeiling — how much room a city has left to grow." />
            <Slider label="Growth ceiling slope" value={wp.geoCeilingSlope} min={0} max={4} step={0.05}
                    onChange={(v) => patchWp({ geoCeilingSlope: v })} />
          </Section>

          <Section title="Zone weights" subtitle={map.mapType}>
            <p className="wb-hint">Relative chance a region gets each character, for the current map type.</p>
            {ZONES.map((z) => (
              <Slider key={z} label={z} value={wp.zoneWeights[map.mapType][z]} min={0} max={80} step={1}
                      onChange={(v) => patchWp({
                        zoneWeights: {
                          ...wp.zoneWeights,
                          [map.mapType]: { ...wp.zoneWeights[map.mapType], [z]: v },
                        },
                      })} />
            ))}
            <Slider label="Difficulty shift" value={wp.difficultyZoneShift} min={0} max={30} step={1}
                    onChange={(v) => patchWp({ difficultyZoneShift: v })}
                    hint="Points moved between metropolitan and rural by difficulty." />
          </Section>

          <Section title="Roads" subtitle="connection thresholds">
            <p className="wb-hint">Two cities get a road when their distance is below the average of their zone thresholds, times the connectivity factor.</p>
            {ZONES.map((z) => (
              <Slider key={z} label={z} value={wp.zoneThresholds[z]} min={40} max={500} step={5}
                      onChange={(v) => patchWp({ zoneThresholds: { ...wp.zoneThresholds, [z]: v } })}
                      format={(v) => `${v} px`} />
            ))}
            <Slider label={`Intra-zone × (${map.connectivity})`}
                    value={wp.connectivityFactors[map.connectivity].intraZone}
                    min={0.1} max={3} step={0.05}
                    onChange={(v) => patchWp({
                      connectivityFactors: {
                        ...wp.connectivityFactors,
                        [map.connectivity]: { ...wp.connectivityFactors[map.connectivity], intraZone: v },
                      },
                    })} />
            <Slider label={`Cross-zone × (${map.connectivity})`}
                    value={wp.connectivityFactors[map.connectivity].crossZone}
                    min={0.1} max={3} step={0.05}
                    onChange={(v) => patchWp({
                      connectivityFactors: {
                        ...wp.connectivityFactors,
                        [map.connectivity]: { ...wp.connectivityFactors[map.connectivity], crossZone: v },
                      },
                    })}
                    hint="Lower than intra-zone keeps regions separate; equal integrates them." />
          </Section>

          <Section title="Highways">
            <Slider label="MST reach" value={map.highwayMaxDistance} min={50} max={900} step={10}
                    onChange={(v) => patchMap({ highwayMaxDistance: v })} format={(v) => `${v} px`}
                    hint="Pixels, not km — rescale it when you change the canvas." />
            <NumberField label="'developed' min population" value={wp.highwayDevelopedMinPop} step={5000}
                         onChange={(v) => patchWp({ highwayDevelopedMinPop: v })} />
            <NumberField label="'advanced' min population" value={wp.highwayAdvancedMinPop} step={5000}
                         onChange={(v) => patchWp({ highwayAdvancedMinPop: v })} />
            <Slider label="'advanced' reach ×" value={wp.highwayAdvancedReachMultiplier} min={1} max={3} step={0.05}
                    onChange={(v) => patchWp({ highwayAdvancedReachMultiplier: v })} />
            <Slider label="'basic' top fraction" value={wp.highwayBasicFraction} min={0.01} max={0.5} step={0.01}
                    onChange={(v) => patchWp({ highwayBasicFraction: v })}
                    format={(v) => `${(v * 100).toFixed(0)}%`} />
          </Section>

          <Section title="Export / import" subtitle="send this to Claude" open>
            <div className="wb-exportrow">
              <button className="wb-primary" onClick={copySpec}>Copy JSON</button>
              <button onClick={downloadSpec}>Download</button>
              <button onClick={importSpec}>Import…</button>
            </div>
            <textarea className="wb-json" readOnly value={specJson} rows={10}
                      onFocus={(e) => e.currentTarget.select()} />
          </Section>
        </aside>

        <main className="wb-main">
          <div className="wb-maptools">
            <Toggle label="Terrain" value={showTerrain} onChange={setShowTerrain} />
            <Toggle label="City names" value={showLabels} onChange={setShowLabels} />
            <button onClick={() => setFitKey((k) => k + 1)}>Fit to view</button>
            <span className="wb-legend">
              <i style={{ background: "#c87a1a" }} /> highway
              <i style={{ background: "#6b7a94" }} /> road
              <i style={{ borderColor: "#f39c12" }} /> dead end
              <i style={{ borderColor: "#e74c3c" }} /> isolated
            </span>
          </div>

          <WorldMap
            cityNodes={world.cityNodes}
            mapLinks={world.mapLinks}
            showLabels={showLabels}
            showTerrain={showTerrain}
            fitKey={fitKey}
          />

          <div className="wb-stats">
            <Stat label="World" value={`${Math.round(stats.worldWidthKm)} × ${Math.round(stats.worldHeightKm)} km`}
                  hint="Set by the world diagonal, not by the canvas size." />
            <Stat label="Area" value={`${fmtInt(stats.worldAreaKm2)} km²`} />
            <Stat label="Cities" value={`${stats.nodes} (${stats.ports} ports)`} />
            <Stat label="Population" value={fmtInt(stats.totalPopulation)} />
            <Stat label="Median city" value={fmtInt(stats.medianPopulation)} />
            <Stat label="Largest" value={fmtInt(stats.largestCity)} />
            <Stat label="Mean wealth" value={stats.meanWealth.toFixed(3)} />
            <Stat label="Links" value={`${stats.links} (${stats.highways} hw)`} />
            <Stat label="Mean degree" value={stats.meanDegree.toFixed(2)} />
            <Stat label="Dead ends" value={String(stats.deadEnds)} warn={stats.deadEnds > stats.nodes * 0.2} />
            <Stat label="Isolated" value={String(stats.isolated)} warn={stats.isolated > 0} />
            <Stat label="Forced edges" value={String(stats.forcedEdges)}
                  warn={stats.forcedEdges > stats.nodes * 0.1}
                  hint="BFS fallback links. High means the thresholds are too tight for the city spacing." />
            <Stat label="Link length" value={`${stats.minLinkKm}–${stats.maxLinkKm} km (avg ${stats.meanLinkKm.toFixed(0)})`} />
            <Stat label="On the clamp" value={`${stats.clampedLinks} / ${stats.links}`}
                  warn={stats.links > 0 && stats.clampedLinks > stats.links * 0.5}
                  hint="Links pinned to the length floor or ceiling. Over half means the clamp, not the geometry, is deciding your distances." />
            <Stat label="Network factor" value={stats.meanNetworkFactor.toFixed(2)} />
            <Stat label="Zones" value={ZONES.map((z) => `${z[0].toUpperCase()}${stats.zoneCounts[z] ?? 0}`).join(" ")} />
          </div>
        </main>
      </div>

      {notice && <div className="wb-notice">{notice}</div>}
    </div>
  );
}
