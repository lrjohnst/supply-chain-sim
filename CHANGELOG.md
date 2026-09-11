# Changelog

## Niet uitgebracht — terreinlaag op de kaart (2026-09-11)

### Toegevoegd
- **Voronoi-terreinlaag in `NodeMap`.** Land per stad, ingekleurd naar zonekarakter, met
  expliciete zee en een kustlijn eronder. Eigen `<g className="terrain">` als eerste kind van
  de bestaande pan/zoom-transformgroep, dus onder links en nodes, en `pointerEvents="none"`.
  Gememoïseerd op `gameState.cityNodes`. Nieuwe dependency: `d3-delaunay` (+19 kB raw, +7 kB gzip).
- **`CityNode.zone`** — het zonekarakter wordt nu op de node bewaard. `ZoneChar` is verhuisd
  naar `types/index.ts` en geëxporteerd. Zonder dit kon de renderer er niet bij: het type was
  privé, `_centreIdx` werd gestript en `mapSeed` staat niet op `GameState`, dus de zone was op
  runtime onherroepelijk weg.
- `docs/rendering.md` — waarom de laag er is, hoe hij is opgebouwd, palet en bekende grenzen.

### Gewijzigd
- **`buildMapLinks` replayt `buildCityNodes` Step 1 niet meer** en leest `node.zone`. De
  `seed`-parameter is vervallen: `buildMapLinks(cityNodes, config)`. De functie doet nu
  helemaal geen RNG-trekkingen. Daarmee is de stilste val in de codebase weg — een toegevoegde
  of verplaatste RNG-draw in Step 1 corrumpeerde voorheen de linkdrempels zonder één foutmelding.
- **Kleine gedragswijziging, geen pure refactor.** De replay wees grensnodes via Voronoi aan het
  dichtstbijzijnde regiocentrum toe; `buildCityNodes` kent de exacte `_centreIdx`. Een handvol
  nodes kreeg dus de verkeerde zone en daarmee de verkeerde drempel. Gemeten over vijf seeds:
  snelwegen identiek, geforceerde connectiviteitsranden 49 → 47, en één seed kreeg er twee wegen
  bij (62 → 64 links). De nieuwe getallen zijn de juiste.
- **Wegkleur** van `#2a3347` (`--border`) naar `#6b7a94` (`--text-dim`) op 0.75 opacity. De oude
  kleur was gekozen tegen een vrijwel zwarte achtergrond en verdween volledig onder elke landtint.
  Snelwegen (`#c87a1a`) ongewijzigd.

### Verwijderd
- De vier `[MAP-VERIFY]`-logs. Die bestonden uitsluitend om de replay te controleren.

### Geverifieerd
- `tsc -b` geeft exact dezelfde 31 fouten als vóór de wijziging, met een identieke verdeling per
  bestand — geen nieuwe fouten, en de aangeraakte bestanden zijn schoon.
- Headless gerenderd in jsdom: 50 terreincellen in drie zonekleuren, zee- en kustrect aanwezig,
  terrein is kind #0 van de transformgroep, 35 wegen in de nieuwe kleur, 17 snelwegen,
  3 havenankers, nul consolefouten.

### Niet gedaan (bewust)
- Viewport, fit-to-view en touch-handlers blijven ongemoeid. Dit is een pure renderwijziging.


## Niet uitgebracht — deploy en projectdocumentatie (2026-09-10)

Geen wijzigingen aan de game-code; alleen infrastructuur en documentatie.

### Toegevoegd
- Live gezet op https://supply-chain-sim.lucasjohnston.nl (srv6): statische Vite-build achter Nginx,
  SPA-fallback naar `index.html`, Let's Encrypt-certificaat met auto-renewal
- `docs/deployment.md` — waar het draait en hoe je herbouwt na een wijziging
- `BACKLOG.md` — open app-items, conform de conventie dat elke app een eigen backlog heeft
- Volledige historie gepusht naar `github.com/lrjohnst/supply-chain-sim` (remote was ingesteld maar leeg)

### Opgemerkt
- `tsc -b` faalt met 40 fouten op `main`, waardoor `npm run build` afbreekt. De deploy draait daarom
  op `npx vite build`. Zie BACKLOG.md item 1 — dit is bestaand werk, niet door de deploy veroorzaakt.

## v1.1 — Engine hardening, breach mechanics, city/map architecture, spec v1.0

### Added
- Training system: per-firm intensity (0-100%), corporate slider sets default, per-firm override
- Firm base overhead: flat per-turn cost per firm type regardless of investment state
- Breach declaration mechanic: player chooses to declare breach or continue when conditions met
- fine_payment transaction category with requireCash / eliminateCorporation pattern
- Tender-to-contract flow: winning a tender spawns a delivery contract, no lump sum
- Tender renewal cycle: automatic re-tender on expiry, volume and quality drift per cycle
- Incumbent advance notice: one turn warning before renewal tender posts
- market buyer type on contracts: goods delivered to abstract market
- map.ts: extracted from newGame.ts, owns all spatial infrastructure and Dijkstra pathfinding
- city.ts: city wealth index, per-turn noise, demand multiplier fed into retail
- milestones.ts: single authoritative milestone check location
- winCondition.ts: extracted from tick.ts, reports only
- products.ts: central product registry consolidating all product metadata
- Win screen, Loss screen with obligation detail
- Contracts screen: active and historical contract view
- Settings screen with music tab and live chaos index bar
- 8-bit title music via Web Audio API with chaos engine
- Master Specification Document v1.0 split into /docs/spec/ per-engine files
- Debug panel: CITIES, MUSIC, pending renewals, breach contract groups
- BottomBar burn rate indicator (live, excludes capital expenditure from calculation)

### Changed
- Training cost now posted as firm-level transaction (was corporate-level)
- Quality tracked per production line, not per firm
- Stores excluded from quality mechanics
- Deduction order: overhead → operating → startup → training → marketing
- Books: capitalExpenditure separated from operatingCosts
- Books screen: completed turns only, turn selector for history, current turn never shown
- Harbor auto-purchase: buy after sell calculation, not before
- Ramp: pauses on recession zero-purchase, resets only on genuine stockout
- NodeMap zoom: toward cursor, not origin
- AI starting city: from config, not hardcoded
- AI debtRatio: uses 1.0 as divisor when revenue is zero
- Start screen title: "Lucas Johnston's Supply Chain Sim"
- Loan quarterly payment: recalculates every turn from current rate

### Fixed
- Paid-off loans now removed from state on balance reaching zero
- AI-expanded firms now inherit AI corp training intensity
- Store section gate implemented alongside production line gate
- Recipe change queued until End Turn, cancellable
- Market-buyer quality and volume breach now trigger renewal cycle
- Zero inventory delivery notification distinct from partial delivery
- checkMilestones added to firm-to-firm revenue branch
- lastBreachWarnTurn initialized in createContract, not by callers
- publishedByFirmId on Tender: sourcing award delivered to correct firm
- Eligible firm filter for tender bidding: inventory OR active production line

---

## v1.0 — Initial engine + UI

### Engine (pure TypeScript, zero React)
- `GameState` data model: corporations, firms, city nodes, harbor, contracts, tenders, loans, ledger
- `tick()` turn engine: 13-step sequence (events → production → contracts → tenders → retail → loans → costs → AI → win check)
- Ledger with full line-item detail per transaction (counterparty, product, quantity, unit price)
- Five MVP supply chains: chicken, aluminium, laptop branding, ice cream, printers
- Harbor supply contracts, B2B tenders, internal contracts with lock icon
- Loan system with annuity repayment and dynamic interest rates
- Macro events: interest rate shocks, recessions, commodity price shocks, tender opportunities
- Barcode scanning unlock at 1984 Q1
- Multi-year contract milestone at €100k cumulative revenue
- Rule-based AI competitor: tender bidding, node expansion, debt ratio guard
- All numeric parameters in `gameConfig.ts` — nothing hardcoded in logic

### UI (React + TypeScript + Zustand)
- SVG node map: pan/zoom, firm sub-nodes, internal contract lines with lock icons, legend
- Right panel: city detail, firm management, investment queue, harbor sourcing contracts
- Books screen: multi-turn P&L per firm and consolidated, full ledger view
- Finance screen: loans, training/marketing sliders, milestone progress
- Tender board: bid submission, live bid list
- Bottom status bar: turn, cash, debt, net worth progress bar, last-turn P&L

### Simulation
- Headless simulation harness (`src/simulation/headless.ts`)
- First run revealed: ice cream margin cannot cover operating costs, AI has no supply mechanism

### Known issues going into v1.1
- Operating costs too high relative to retail margins
- AI never sources inventory (no harbor contracts)
- Retail price not player-controllable
- Ice cream contract expiry leaves store running at pure loss
