# Lucas Johnston's Supply Chain Sim
## Master Specification Document v1.0
*For use as context in MVP 2.0 development*

---

This is the entry point for the SCS specification. Read the files relevant to the area you are working in.

## Top-level documents

- **[handoff.md](handoff.md) — current state, what was last worked on, open design questions. Read this first.**
- [design-principles.md](design-principles.md) — Nine core design principles that govern all gameplay decisions
- [glossary.md](glossary.md) — Definitions of Corporation, Firm, Contract, Tender, Ramp, Chaos engine, and all key terms
- [config-reference.md](config-reference.md) — Full GameConfig TypeScript block with all tunable numeric parameters
- [product-roadmap.md](product-roadmap.md) — Post-MVP feature roadmap across supply chains, cities, AI, finance, contracts, retail, and game experience
- [known-gaps.md](known-gaps.md) — Ten known MVP gaps with brief descriptions; includes MVP 2.0 priority list

## PART 3: FUNCTIONAL SPEC PER ENGINE FILE

One file per engine module. Each contains confirmed behavior and open questions.

| File | Engine module |
|------|--------------|
| [engine/tick.md](engine/tick.md) | Turn sequence orchestration and TickResult |
| [engine/winCondition.md](engine/winCondition.md) | Win/loss detection, simultaneous win rules, AI elimination |
| [engine/macroEvents.md](engine/macroEvents.md) | Recession, commodity shocks, interest rate events, barcode unlock |
| [engine/harbor.md](engine/harbor.md) | Harbor product list, spot pricing, price noise and shock displacement |
| [engine/products.md](engine/products.md) | Product registry: metadata, helpers, storage eligibility rules |
| [engine/investments.md](engine/investments.md) | Investment lifecycle, payment spreading, startup phase, gate on completion |
| [engine/production.md](engine/production.md) | Farm seasonal multipliers, factory recipes, per-line progress tracking |
| [engine/contracts.md](engine/contracts.md) | Contract types, breach conditions, gate system, renewal scheduling, fines |
| [engine/tenders.md](engine/tenders.md) | Tender lifecycle, award, renewal cycle, incumbent notice, bid eligibility |
| [engine/retail.md](engine/retail.md) | Demand pipeline, S-curve ramp, elasticity, recession, harbor auto-buy |
| [engine/loans.md](engine/loans.md) | Variable rate loans, payment recalculation, leverage limits |
| [engine/operatingCosts.md](engine/operatingCosts.md) | Deduction order, training cost, quality trajectory, startup cost fraction |
| [engine/ai.md](engine/ai.md) | AI decision loop, expansion rules, bid pricing, training inheritance |
| [engine/books.md](engine/books.md) | P&L bucketing, net worth, internal transfer exclusion, turn selector |
| [engine/history.md](engine/history.md) | Rolling 40-turn EconomicSnapshot, what is recorded per turn |
| [engine/map.md](engine/map.md) | Node topology, Dijkstra transport cost, harbor access rules |
| [engine/city.md](engine/city.md) | Wealth drift, demand multiplier formula, industrial bonus stub |
| [engine/milestones.md](engine/milestones.md) | €100k revenue unlock for multi-year contracts; business dev tree placeholder |
| [engine/newGame.md](engine/newGame.md) | Initial state assembly, AI seeding, makeFirm factory |
