# Backlog — Supply Chain Sim

Applicatie-specifieke items. Server-/infrastructuurwerk hoort in `/home/claude/BACKLOG.md`.

## Open

| # | Item | Prioriteit | Notities |
|---|------|-----------|----------|
| 1 | `tsc -b` faalt: 31 type-fouten op `main` | **Hoog** | `npm run build` (= `tsc -b && vite build`) breekt af op de typecheck (31 fouten; ik noemde eerder 40 — dat was een regeltelling, sommige fouten beslaan twee regels). `ReadmeClaude.md` schrijft "zero errors before committing" voor, maar commit `acf2df3` voldoet daar niet aan. Grofweg drie categorieën: (a) ongebruikte imports/variabelen (`TS6133`/`TS6196`) — triviaal; (b) `strictNullChecks`-meldingen in `ProductsScreen.tsx` en `contracts.ts` — echte null-paden, even nakijken; (c) inhoudelijke type-mismatches: `tick.ts:133` (`"won"` past niet in `LossReason`), `headless.ts:99` (`Contract` mist `originId`, `originType`, `incumbentNoticeGiven`, `lastBreachWarnTurn`), `gameStore.ts:2/18` (dubbele import `ProductId`), en op drie plekken een `number` tegen een literal-type `50`. Dat laatste ruikt naar een verkeerd afgeleid config-type. Zolang dit open staat draait de deploy op `npx vite build` (esbuild strípt types en typecheckt niet), zie `docs/deployment.md`. |
| 2 | JS-bundle is 739 kB (217 kB gzip) | Middel | Eén chunk, boven Vite's 500 kB-waarschuwing. Recharts is de dikste afhankelijkheid. Op te lossen met `manualChunks` of een dynamische import van de grafiekschermen. Niet dringend — over HTTPS met gzip laadt het prima. |
| 3 | Forced-connectivity randen lopen hoog | Middel | Over vijf seeds vuurt de BFS-fallback in `buildMapLinks` 9–11 keer op een kaart van 50 nodes — ruwweg één node op de vijf haalt het netwerk niet organisch. `map.md` stap 5 zegt dat dat betekent dat de drempels krap staan ten opzichte van de knooppuntafstand. Waarschijnlijk dezelfde oorzaak als de klacht "clusters met dode ruimte ertussen". Generatievraag, geen rendervraag. |
| 8 | Wereldschaal is niet uitdrukbaar | Middel | `SCALE_FACTOR = 800 / hypot(canvasWidth, canvasHeight)` — de 800 is een literal, dus canvasgrootte verandert de pixeldichtheid maar nooit het formaat in km. De wereld is altijd 800 km op de diagonaal (~301.000 km² bij de standaardverhouding). Er is dus géén knop om de wereld kleiner te maken. Voorwaarde voor elke tegelkaart, want een tegel heeft een maat in km nodig. |
| 10 | World Builder: stappen draait alleen city life | Middel | `tickPopulation` + `tickWealth`, niet de volledige `tick.ts` (die heeft corporaties en firma's nodig). Juiste scope voor een *wereld*bouwer, maar je ziet dus niet hoe de economie steden over 200 beurten hervormt. |
| 11 | World Builder: geen touch-ondersteuning | Laag | Kaart reageert op wiel en slepen, niet op aanraking. Zelfde gat als in de game. |
| 9 | Kustlijn is een rechthoek | Laag | Bewust buiten scope gehouden bij de terreinlaag. Een hull of een geruiste rand leest beter. Zie `docs/rendering.md`. |
| 4 | `known-gaps.md` is verouderd | Laag | Beschrijft nog het MVP 1.0-tijdperk. Zie `docs/spec/handoff.md`. |
| 5 | Rasterkaart-vraag beantwoorden (optie B vs C) | Middel | De openstaande ontwerpvraag uit `docs/spec/handoff.md`: is het probleem leesbaarheid of *feel*? Blokkeert de kaartherziening. |
| 6 | `npm audit`: 7 kwetsbaarheden | Laag | 2 moderate, 5 high — allemaal in devDependencies (buildketen), niet in wat de browser krijgt. Meelopen bij een volgende dependency-ronde. |
| 7 | Geen automatische deploy | Laag | Herbouwen na een push gaat nu handmatig via `docs/deployment.md`. Een git-hook of klein deploy-script zou dat kunnen afvangen. |

## Afgerond

| # | Item | Notities |
|---|------|----------|
| ~~—~~ | ~~Live zetten op srv6~~ | ~~2026-09-10: draait op https://supply-chain-sim.lucasjohnston.nl, statische Vite-build achter Nginx met SPA-fallback en Let's Encrypt-certificaat.~~ |
| ~~—~~ | ~~`[MAP-VERIFY]`-logging opruimen~~ | ~~2026-09-11: alle vier verwijderd samen met de RNG-replay die ze controleerden.~~ |
| ~~—~~ | ~~RNG-replay-koppeling in `buildMapLinks`~~ | ~~2026-09-11: opgeheven. Zone staat nu op `CityNode`; `buildMapLinks` trekt geen RNG meer en heeft geen seed-parameter.~~ |
| ~~—~~ | ~~Remote repo koppelen en pushen~~ | ~~2026-09-10: `github.com/lrjohnst/supply-chain-sim` was lokaal ingesteld maar leeg; volledige historie gepusht.~~ |
