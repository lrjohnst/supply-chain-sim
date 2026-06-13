## retail.ts

**Confirmed behavior:**
- Demand calculation order: base demand → ramp fraction → elasticity → marketing → barcode → recession displacement → noise (noise always last)
- Noise always present every turn regardless of recession or shock state
- Sales ramp: logistic S-curve (k=0.30, midpoint=7). Reaches ~50% around turn 32-33
- Ramp advances by units_sold / fullRampDemand each turn (weighted by satisfaction)
- Ramp pauses when zero inventory because harbor bought zero units (recession / low demand)
- Ramp resets to zero on genuine stockout (had inventory, sold all, demand unsatisfied)
- Price below benchmark increases demand up to ceiling of 1.2. Price above reduces demand, floor of 0.1
- Lower prices increase fullRampDemand denominator, slightly slowing ramp progress per turn (intentional tension)
- Market size hint in UI shows fully-ramped maximum demand at current price, excluding ramp and recession
- computeFullDeterministicDemand excludes recession noise wobble (slight mismatch with actual sales during recessions, accepted for MVP)
- Recession multiplier: base severity + noise each turn. Severity drawn from distribution at recession start
- getCityDemandMultiplier from city.ts multiplied into base demand
- Harbor auto-purchase: buy exactly estimated demand units each turn (sale quantity calculated first, then purchase)
- spotPurchasePremium: 12% added to harbor price for auto-purchases (configurable)
- B2C only. No tenders in retail

**Open questions:**
- None
