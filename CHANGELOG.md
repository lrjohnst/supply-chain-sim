# Changelog

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
