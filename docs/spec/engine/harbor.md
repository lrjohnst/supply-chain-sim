## harbor.ts

**Confirmed behavior:**
- Single source of truth for harbor products and pricing
- HARBOR_BASE_PRICES in gameConfig.ts (not in harbor.ts)
- getHarborSoldProducts() delegates to product registry
- getBasePrice() reads from config
- tickHarborPrices() applies noise + shock S-curve displacement every turn
- Noise is always present, not just during shocks
- Harbor sells: bauxite, strawberry ice cream, white-label laptops, branded printers
- No harbor contracts exist. All purchases are spot price, ad-hoc, turn by turn

**Open questions:**
- None
