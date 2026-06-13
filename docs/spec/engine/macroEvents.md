## macroEvents.ts

**Confirmed behavior:**
- Two functions: firePendingEvents (turn start) and generateUpcomingEvents (turn end)
- Events: interest_rate_change, recession, commodity_price_shock, tender_opportunity, tender_closure, barcode_scanning_available
- Interest rate changes apply delta to ALL active loans including existing ones
- currentBaseInterestRate on GameState updated by interest rate events. New loans use this rate
- Commodity shocks affect harbor-sold products only: bauxite, ice cream, laptops, printers
- Shock normalization: S-curve decay (logistic), duration drawn from normal distribution, noise always present throughout lifecycle
- Recession: severity and duration drawn from distributions (skew parameter in config, default 0, not yet wired up — placeholder)
- No recession stacking. Cooldown after recession ends
- Noise always present on harbor prices and demand throughout entire lifecycle, not just during events
- Barcode event fires deterministically at turn 16 (1984 Q1)
- Random events check every 4 turns, 25% chance
- Recessions and commodity shocks have independent config blocks
- Tender generation logic is a placeholder. Post-MVP: market-demand-driven tender generation

**Open questions:**
- Recession skew parameter exists in config but is not yet wired up
