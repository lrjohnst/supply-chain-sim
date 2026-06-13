# Lucas Johnston's Supply Chain Sim
## Master Specification Document v1.0
*For use as context in MVP 2.0 development*

---

# PART 1: DESIGN PRINCIPLES

**Risk/profit tradeoff is the heartbeat of the game.** Every meaningful decision involves accepting more risk for more potential reward. A loan funds a mine that could make you rich or bankrupt you. A long-term contract gives stability but locks you in when the market moves. The game should never let the player feel completely safe.

**Early game is a struggle, late game is earned.** The player should feel financially precarious for the first 20-30 turns regardless of strategy. Cash is tight, quality is low, contracts are short, the market is uncertain. The satisfaction of stability comes from surviving that period, not from avoiding it.

**Specialization is rewarded, generalism is taxed.** A player who focuses on one supply chain builds quality, reputation, and contract eligibility faster than one who spreads thin. The game mechanics should make this visible and tangible, not just implied.

**Supply chains have inertia.** Goods tend to keep flowing. When a contract ends, the market does not disappear. It posts a new tender. The player who built the relationship has advance notice. Supply chain continuity is a strategic asset worth protecting.

**The ramp curve gives happy anticipation.** A new product does not sell at full demand immediately. It grows slowly following a logistic S-curve. The player should feel the satisfaction of watching a market grow over many turns, not instant gratification. Stockouts reset the ramp as a meaningful punishment.

**Stockouts are punished harshly.** Empty shelves reset the demand ramp to zero. Early stockouts are disproportionately damaging because they lose compounding ramp progress. This rewards planning and punishes over-extension.

**The harbor is a market of last resort, not a crutch.** The harbor provides infinite supply at spot price. It is always available to buy from. Selling requires winning a tender. Harbor prices fluctuate with noise, shocks, and macro events. Players who depend entirely on the harbor are exposed to price shocks they cannot control.

**Noise makes the economy feel alive.** Harbor prices, consumer demand, recession severity, and commodity shocks all have permanent random noise applied every turn. The economy is never a clean mathematical function. Players should feel like they are reading a living system, not solving an equation.

**The books are a diagnostic tool, not the game.** The game should not feel like bookkeeping. The books exist so the player can understand what is happening and why. The challenge is running a business in a living economy, not administering a spreadsheet.

---

# PART 2: CORE CONCEPTS GLOSSARY

**Corporation:** The player's holding entity. Owns all firms. Has consolidated books, a cash balance, loans, and a corporate training intensity setting.

**Firm:** The fundamental unit of the game. A farm, factory, or store. Has its own P&L, inventory, investments, production lines, and training intensity. Belongs to one corporation.

**Investment:** A firm-level improvement that takes turns to build and costs money each turn of construction. Generates operating cost when complete regardless of whether it is being used.

**Production line:** A factory investment that runs one specific recipe. Goes through states: queued → building → idle/unconfigured → starting up → active. Quality is tracked per production line, not per firm.

**Harbor:** A global supply bucket. Sells exactly four products: bauxite, strawberry ice cream, white-label laptops, branded printers. Never buys. All harbor purchases are spot price, no contracts. Prices fluctuate with noise and commodity shocks.

**Tender:** A competitive bidding event. Has a bidding window. Winner is awarded a delivery contract. Tenders cycle: when a contract expires naturally, a renewal tender posts automatically after a gap. Incumbents receive advance notice.

**Contract:** A bilateral delivery agreement between two corporations, or between a corporation and the market. Executes each turn: seller delivers, buyer pays. Has quality and volume breach conditions. Player can declare breach or continue when conditions are met.

**Market contract:** A contract where the buyer is the abstract market rather than a specific corporation. Goods disappear into the market on delivery. Revenue posts to the seller. Used for tender-awarded delivery obligations.

**Books:** The accounting system. Every ledger entry carries a full descriptor tuple: counterparty, product, quantity, unit price, total. Transaction categories: revenue, input_cost, overhead, operating_cost, training_cost, marketing_cost, capital_expenditure, loan_interest, loan_repayment, fine_payment. Books show completed turns only. Current in-progress turn never shown.

**Net worth:** Cash + firm asset values at cost + inventory at input cost − all liabilities. No depreciation in MVP. Used as the win condition metric.

**Ramp:** A per-product per-store value tracking market penetration. Follows a logistic S-curve (k=0.30, midpoint=7). Advances by units sold / fullRampDemand each turn. Resets to zero on stockout. Pauses when harbor purchases zero units due to low demand.

**Training intensity:** A per-firm value 0-100. Determines training cost and quality trajectory. Corporate slider sets default for all non-overridden firms. Per-firm override is independently settable. Quality improves when intensity ≥ qualityThreshold (default 50), decays below it.

**Chaos engine:** A logistic map (x → r·x·(1-x), r=3.82) driving permanent noise on harbor prices and consumer demand. Applied as the last step in all demand and price calculations.

---

# PART 3: FUNCTIONAL SPEC PER ENGINE FILE

## tick.ts

**Confirmed behavior:**
- Single synchronous function transitioning game state from turn N to N+1
- Sequence: fire macro events → tick harbor prices → advance investments → production → execute contracts → process renewals → evaluate tenders → harbor spot purchases → retail sales → process loans → deduct operating costs → update quality → tick cities → check contract risks → AI decisions → generate macro events → append economic snapshot → check win condition → advance turn counter
- Player has no input during execution
- Nothing happens mid-turn
- Win condition check before macro event generation. If game over, turn counter does not increment
- winCondition.ts reports only, never sets phase directly
- Phase set to won only when player confirms end game
- pendingWin removed. justWon flag in tick result triggers store to show win screen

**Open questions:**
- None

---

## winCondition.ts

**Confirmed behavior:**
- Checks all corporations each turn
- Player checked first: simultaneous win goes to player
- Win: net worth ≥ configured threshold
- Loss: bankruptcy (cash insufficient for obligation) or time limit (turn ≥ 200)
- Bankruptcy during Keep Playing is still a loss
- AI winning ends game immediately with loss screen for player
- AI bankruptcy eliminates AI, game continues without them
- reason field on result: "won", "loss_bankruptcy", "loss_time_limit", "loss_ai_won"

**Open questions:**
- None

---

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

---

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

---

## products.ts (product registry)

**Confirmed behavior:**
- Single source of truth for product metadata
- Every product has: displayName, category (raw_material / intermediate_good / consumer_good), purchaseSources, saleDestinations, handlingFirms, transformableFrom, transformableInto, perishable (placeholder false), whiteLabelEligible, isBranded, storageFirmEligible (placeholder false)
- Branded goods cannot be stored in factory under any circumstances
- Raw materials, intermediate goods, and white-label goods can be stored in factory
- Helper functions: getProduct, getAllProducts, displayName, getProductsByCategory, getProductsByPurchaseSource, getProductsBySaleDestination, getProductsHandledBy, isFactoryStorageEligible, isSoldByHarbor
- MVP products: bauxite, alumina, aluminium, raw_chicken, packaged_chicken, chicken_soup, white_label_laptop, branded_laptop, branded_strawberry_ice_cream, branded_printer
- Product ID naming uses existing codebase convention (ice_cream_strawberry etc.), display names use readable format

**Open questions:**
- None

---

## investments.ts

**Confirmed behavior:**
- Investment lifecycle: queued → in_progress → complete
- Cost spread evenly across build turns, one payment per turn
- Payment failure: investment pauses, notification fires, resumes when funds available
- Cancellation stops future payments, sunk cost lost, no refund
- Slot limit counts queued, in_progress, and complete investments
- not_built status removed
- Firm type validation in startInvestment: invalid investment types rejected at engine level
- Valid investment types per firm type driven by config
- Operating cost accrues on complete investments regardless of whether production line is configured or running
- Production line startup phase: separate from build phase. Player-initiated by configuring recipe
- productionLineStartupTurns: configurable in config
- Startup cost: baseTrainingCost × startupCostFraction per turn during startup
- Recipe change is queued until End Turn, cancellable until then
- Recipe change on active line restarts startup phase next turn
- End Turn gate fires when investment complete but unconfigured (production lines and store sections)
- Three gate options: Configure Now, Leave Idle (fires again next turn), Mark as Intentionally Idle

**Open questions:**
- None

---

## production.ts

**Confirmed behavior:**
- Farm: seasonal multiplier (Q1 0.7, Q2 1.2, Q3 1.1, Q4 0.8), reliability multiplier (random 0.8-1.0 without irrigation, 1.0 with), output at zero unit cost
- Factory: each production line runs one configured recipe only, no auto-selection
- Production line lifecycle: unconfigured → starting_up → active
- Available recipes: bauxite→alumina, alumina→aluminium (2 turns), raw_chicken→packaged_chicken, raw_chicken→chicken_soup, white_label_laptop→branded_laptop
- Each recipe has its own maxBatchSizePerTurn in config
- Progress tracked per line instance, not per recipe. Two aluminium lines run independently
- starting_up lines consume nothing and produce nothing
- Output unit cost derived from input cost basis

**Open questions:**
- Production startup cost accounting differs from investment cost accounting. Post-MVP: investments may be capitalized and depreciated. Startup costs remain direct expenses.

---

## contracts.ts

**Confirmed behavior:**
- Three contract types by buyer: harbor (seller delivers to harbor buyer), market (seller delivers to abstract market), firm-to-firm (between two corporations)
- No harbor contracts exist. Harbor purchases are spot only
- Internal contracts (same corporation): cash moves between firms at transfer price set by selling firm. Player can micromanage per-firm profitability
- Partial delivery: deliver available inventory, notify, do not auto-breach
- Zero inventory delivery: notify separately from partial delivery
- Quality tracked per production line, not per firm
- Breach conditions: cumulativeVolumeShortfall threshold OR consecutiveQualityFailureTurns threshold
- When breach conditions met: player harmed → End Turn gate fires (Declare Breach / Continue Contract). AI harmed → auto-breach immediately
- Market-buyer quality breach: auto-terminate after qualityBreachConsecutiveTurns. Triggers renewal cycle
- Market-buyer volume breach: auto-terminate when threshold crossed. Triggers renewal cycle. Notification: market has found another supplier
- Fine on breach: breachFineAmount from config, posted as fine_payment on both sides. Uses requireCash for player seller, eliminateCorporation for AI seller
- Advance notice: incumbent corporation notified one turn before renewal tender posts
- Renewal scheduled on natural completion and on market-buyer breach/quality-terminate
- checkContractRisks: inventory warning and quality warning fire every N turns (breachWarningIntervalTurns) while risk persists. Stable notification ID per contract, does not stack
- originType and originId on Contract: extensible origin system (tender / direct / sourcing / null)
- multiYearContractsUnlocked required for contracts longer than 2 turns (skippable for tender-spawned contracts)
- checkMilestones called in market and firm-to-firm revenue branches

**Open questions:**
- Market-buyer fine: no fine paid on market breach (no counterparty). Known gap

---

## tenders.ts

**Confirmed behavior:**
- Tender lifecycle: open (bidding window) → awarded or expired
- Award spawns a delivery contract. No lump sum at award time
- Contract starts turn+1 after award. First delivery next turn
- Market tenders: lowest price wins. Sourcing tenders: highest price wins
- Quality checked against minQuality. Bids below threshold rejected
- publishedByFirmId on Tender: sourcing tender receives goods at specific firm
- Renewal cycle: when tender-spawned contract expires naturally OR market-buyer breach terminates, PendingTenderRenewal queued
- Renewal tender posts same turn contract expires (processRenewals called after executeContracts in tick sequence)
- Renewal volume: previous volume × growth factor drawn from normal distribution (mean 1.05, stdDev 0.1). Can go down
- Renewal quality threshold: previous + qualityDriftPerCycle
- Renewal price: recalculated from current market conditions
- Incumbent gets advance notice one turn before renewal posts
- Incumbent advance notice is always active for MVP. Post-MVP: business development unlock
- No persistent tenders. Starting tenders removed from newGame.ts. Debug panel spawn buttons are testing mechanism
- Bid quality snapshotted at submission time (post-MVP: re-evaluate at award)
- No inventory reservation on bids (post-MVP: deposits or reservation)
- withdrawTenderBid: removes all bids by corporation from open tender
- AI never submits tender bids (post-MVP: AI bids on industrial tenders)
- Eligible firms for bidding: must hold inventory of tendered product OR have active production line producing it

**Open questions:**
- Tender generation logic is placeholder in macroEvents.ts. Post-MVP: market-demand-driven generation

---

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

---

## loans.ts

**Confirmed behavior:**
- Variable rate loans: interest rate changes apply delta to all active loans including existing ones
- Quarterly payment recalculates each turn from current annualInterestRate, remaining balance, remaining turns
- quarterlyPayment on Loan stored as display value only (payment at origination)
- Loan max: max(totalAssets, assetFloor) × leverageRatio. assetFloor €15k, leverageRatio 3x (configurable)
- Paid-off loans removed from state and corp.loanIds when balance < €0.01
- New loans use currentBaseInterestRate from GameState
- loan_interest hits P&L. loan_repayment is balance sheet only, excluded from net profit
- Fine deduction in breach uses requireCash for player, eliminateCorporation for AI

**Open questions:**
- Loan repayment notification not implemented

---

## operatingCosts.ts

**Confirmed behavior:**
- Deduction order: firm base overhead → firm investment operating costs → startup commissioning costs → training costs → marketing budget
- Firm base overhead: flat per-turn cost per firm type from game start regardless of investments. Config: firmBaseOverhead per type
- Training cost: baseTrainingCostPerTurn[firmType] × (trainingIntensity / 100). Posted as firm-level training_cost transaction
- Marketing: single corporate-level marketing_cost transaction
- Quality per production line, not per firm
- Quality improves if trainingIntensity ≥ qualityThreshold (default 50). Decays below
- Quality lab and training stack additively in same turn
- Stores excluded from quality mechanics entirely (post-MVP: store quality affects customer satisfaction)
- AI eliminated on first operating cost shortfall, no grace period, notification fires to player
- starting_up production lines pay startupCostFraction of normal operating cost per turn

**Open questions:**
- None

---

## ai.ts

**Confirmed behavior:**
- Single AI corporation. First non-player non-eliminated corp found
- Exits immediately if eliminated
- Auto-sources ice cream for stores with completed grocery section
- Bids on market tenders where inventory or active production line exists for that product
- Bids at 97-100% of target price randomly. Minimum acceptable: unitCost × 1.05
- Expands into cities where player has presence but AI does not
- Debt-to-revenue ratio check before expansion: limit 2.0. Zero revenue uses 1.0 as divisor
- Firm build cost read from config
- Emergency loan parameters in config under ai block
- AI starting city from GameConfig.ai.startingCityId
- AI-expanded firms inherit AI corp's corporateTrainingIntensity
- AI never sources from player firms (post-MVP)
- AI never writes contracts (post-MVP)
- AI never bids on sourcing tenders (post-MVP)

**Open questions:**
- AI only builds stores. Never factories or farms. Cannot participate in industrial supply chains

---

## books.ts

**Confirmed behavior:**
- Pure read, no mutations. Called on demand by UI
- Transaction categories in computeFirmBooks: revenue, input_cost, overhead, operating_cost, training_cost, transport_cost, startup_cost, capital_expenditure. All explicitly handled
- marketing_cost and loan categories at corporate level only
- loan_repayment excluded from P&L (balance sheet item)
- loan_interest included as P&L expense at corporate level
- Zero-total transactions skipped in bucketing, included in raw lines
- Internal transfers excluded from consolidated P&L to avoid double-counting
- Net worth always reflects current state regardless of which historical turn is viewed. UI note shown
- Books screen shows completed turns only. Default previous turn. Current turn never shown
- Turn selector for browsing history

**Open questions:**
- Post-MVP: net worth should be read from EconomicHistory for selected turn

---

## history.ts

**Confirmed behavior:**
- Rolling 40-turn EconomicSnapshot per turn (configurable window)
- Records per turn: harbor prices, base prices, shock displacements, noise terms, effective demand per store per product, recession severity, active shocks, player and AI net worth and cash, interest rate
- Snapshot written at end of tick before turn increments
- Foundation for future player-facing economic dashboard

**Open questions:**
- None

---

## map.ts

**Confirmed behavior:**
- Single source of truth for spatial infrastructure
- buildCityNodes(), buildMapLinks(): hardcoded for MVP
- getTransportCost(): Dijkstra on baseCost, bidirectional links
- isHarborAccessible(), getConnectedNodes()
- 16 nodes: 5 cities, 10 towns, 1 harbor city
- 22 directed connections treated as bidirectional
- Harbor products can only be sourced at harbor-connected nodes. Moving inland costs transport per link per unit

**Open questions:**
- Post-MVP: config-driven or procedurally generated map topology

---

## city.ts

**Confirmed behavior:**
- tickCities called each turn before retail sales
- wealthIndex per city: Gaussian noise (σ=0.005) applied each turn, clamped 0.1-0.9
- getCityDemandMultiplier: demandModifier × (0.5 + wealthIndex). At defaults equals 1.0
- getCityIndustrialBonus: returns 1.0 always (placeholder)
- wealthIndex initial values: towns 0.5, cities 0.6, harbor city 0.7
- demandModifier initial value: 1.0 for all

**Open questions:**
- Post-MVP: full city growth, population change, wealth trends, employment effects, cluster bonuses

---

## milestones.ts

**Confirmed behavior:**
- Single authoritative location for milestone checks
- €100k cumulative revenue: unlocks multiYearContractsUnlocked on corporation
- Called from tenders.ts and retail.ts wherever revenue posts
- contracts.ts reads the flag but does not set it

**Open questions:**
- Post-MVP: home for business development tree unlocks

---

## newGame.ts

**Confirmed behavior:**
- Pure assembler. Imports from map.ts and city.ts for spatial data
- Player and AI start with identical cash: GameConfig.player.startingCash (€100k)
- AI seeded in GameConfig.ai.startingCityId (city_b)
- No starting tenders seeded
- pendingTenderRenewals initialized empty
- currentBaseInterestRate initialized from config
- makeFirm factory: trainingIntensity defaults to corporateTrainingIntensity, trainingIntensityOverridden: false

**Open questions:**
- Post-MVP: setup phase for choosing starting conditions, difficulty, corporation identity

---

# PART 4: CONFIG FILE REFERENCE

```typescript
game: {
  turnsNormal: 200,
  quartersPerYear: 4
}

player: {
  startingCash: 100000
}

loans: {
  baseAnnualInterestRate: 0.06,
  minDurationTurns: 1,
  maxDurationTurns: 40,
  leverageRatio: 3,
  assetFloor: 15000
}

contracts: {
  breachFineAmount: 5000,
  volumeShortfallBreachThreshold: 50,
  qualityBreachConsecutiveTurns: 3,
  breachWarningIntervalTurns: 5,
  breachWarningQualityMargin: 0.1
}

tenders: {
  contractDurationTurns: 8,
  renewalGapTurns: 4,
  qualityDriftPerCycle: 0.02,
  volumeGrowthMean: 1.05,
  volumeGrowthStdDev: 0.1,
  incumbentNoticeTurns: 1
}

firmBaseOverhead: {
  factory: 500,
  farm: 200,
  store: 300,
  mine: 400
}

firmInvestmentSlotLimit: 8

investments: {
  productionLineStartupTurns: 2,
  startupCostFraction: 0.3,
  productionLineBaseQuality: 0.4,
  qualityGainPerTurnWithLab: 0.02,
  qualityGainFromTraining: 0.01,
  qualityDecayWithoutTraining: 0.005
}

training: {
  baseTrainingCostPerTurn: {
    farm: 200,
    factory: 400,
    store: 150,
    mine: 300
  },
  defaultCorporateIntensity: 50,
  qualityThreshold: 50
}

production: {
  recipes: {
    bauxite_to_alumina: { maxBatchSizePerTurn: 300, turnsPerBatch: 1 },
    alumina_to_aluminium: { maxBatchSizePerTurn: 150, turnsPerBatch: 2 },
    chicken_to_packaged: { maxBatchSizePerTurn: 200, turnsPerBatch: 1 },
    chicken_to_soup: { maxBatchSizePerTurn: 200, turnsPerBatch: 1 },
    laptop_branding: { maxBatchSizePerTurn: 100, turnsPerBatch: 1 }
  }
}

seasonal: {
  yieldMultiplier: [0.7, 1.2, 1.1, 0.8]
}

harborBasePrices: {
  bauxite: 31,
  ice_cream_strawberry: 1.80,
  laptop_whitelabel: 280,
  printer_branded: 85
}

retailBenchmarkPrices: {
  chicken: 8.50,
  chicken_soup: 4.20,
  ice_cream_strawberry: 3.20,
  laptop_branded: 450,
  printer_branded: 120
}

retailElasticity: {
  chicken: 0.5,
  chicken_soup: 0.6,
  ice_cream_strawberry: 0.6,
  laptop_branded: 0.4,
  printer_branded: 0.35
}

consumerDemand: {
  perCapitaDemand: {
    chicken: 0.0025,
    chicken_soup: 0.0015,
    ice_cream_strawberry: 0.004,
    laptop_branded: 0.00015,
    printer_branded: 0.00008
  },
  noiseStdDev: 0.02
}

salesRamp: {
  kSteepness: 0.30,
  midpointProgress: 7
}

harborPrices: {
  noiseStdDev: 0.01
}

commodityShockEvents: {
  checkFrequencyTurns: 4,
  probability: 0.25,
  normalizationMeanTurns: 8,
  normalizationStdDev: 3,
  kSteepness: 0.8,
  noiseStdDev: 0.015,
  shockMultiplierMin: 0.85,
  shockMultiplierMax: 1.35
}

recessionEvents: {
  checkFrequencyTurns: 8,
  probability: 0.15,
  cooldownTurns: 12,
  severityMin: 0.5,
  severityMax: 0.95,
  durationMin: 2,
  durationMax: 12,
  skew: 0,
  severityNoiseStdDev: 0.02
}

interestRateEvents: {
  checkFrequencyTurns: 6,
  probability: 0.2,
  deltaMin: -0.02,
  deltaMax: 0.03
}

tenderEvents: {
  checkFrequencyTurns: 8,
  probability: 0.2,
  minQuality: 0.4
}

bankruptcy: {
  lookbackTurns: 10,
  warningThresholdTurns: 10
}

winCondition: {
  netWorthThreshold: 5000000
}

map: {
  transportCostPerLink: 100,
  linkCapacityBase: 1000
}

cities: {
  wealthNoiseStdDev: 0.005,
  wealthMin: 0.1,
  wealthMax: 0.9
}

history: {
  rollingWindowTurns: 40,
  transactionRetentionTurns: 40
}

ai: {
  startingCityId: "city_b",
  debtToRevenueRatioLimit: 2.0,
  tenderMarginMinimum: 0.05,
  emergencyLoanAmount: 30000,
  firmEstablishmentCost: 10000
}

music: {
  bpm: 174,
  chaosR: 3.82,
  chaosInitialX: 0.7,
  melodyGain: 0.18,
  bassGain: 0.22,
  arpGain: 0.10,
  percGain: 0.9,
  chaosFillThreshold: 0.82,
  chaosStabThreshold: 0.88,
  masterVolume: 0.8,
  enabled: true
}

spotPurchasePremium: 0.12
```

---

# PART 5: PRODUCT ROADMAP

## Supply chains and products
- Mines as a firm type: open pit, shaft, well. Finite reserves, geographic constraint, surveying unit reveals depth
- Farm seasonal dynamics: harvest cycles, crop rotation, weather events
- White-label to branded conversion with brand equity system
- Brand as a tradeable asset between corporations
- Focused marketing per product/brand rather than corporate-wide
- More supply chains: dairy, electronics components, construction materials, automotive
- Product ID rename to match readable convention (packaged_chicken, white_label_laptop etc.)

## City and geography
- City as a living system: population growth and contraction, wealth trends, employment rates
- City wealth affects consumer purchasing power and product mix demand
- Player's own firms influence city wealth and industrial identity over time
- Cluster bonuses for concentrated firm types in one city
- City events: factory closure, population boom, industrial decline
- Four countries with inter-country trade at high transport cost
- Full hex grid world map with ocean links between countries
- Airport nodes enabling expensive fast transport links

## Competition and AI
- AI competitor personality system: 10 traits distributed across 60 points at game start
- Generated profile picture per competitor
- Free chat between player and competitors
- Competitors contact player unprompted to taunt or compliment
- Corporate-level trade and trade war mechanics
- AI builds factories and farms, participates in industrial supply chains
- AI submits tender bids for industrial output
- AI writes contracts with other firms
- Multiple AI competitors

## Economics and finance
- Economic growth and inflation as ambient background forces
- Baseline price drift over time (currently static)
- Depreciation of firm assets (currently carried at cost indefinitely)
- SPAC financing as alternative to loans
- Real estate as a separate investment dynamic
- Stock market as a side mechanic
- Difficulty levels with different config profiles (recession severity, competition aggressiveness)
- Interest rate cycles with economic phases

## Progression and specialization
- Full business development tree: established supplier status, regional brand, industrial player
- Incumbent advance notice becomes a business development unlock
- Specialization bonus on production lines: continuous same-recipe production accelerates quality gain
- Brand depth for retail: continuous same-product selling builds demand beyond ramp ceiling
- Technology tree: barcode scanning (1984), JIT delivery, ERP systems, digital marketplaces
- Ambient technology progression tied to calendar: energy transition, logistics software
- Greenhouse gas emission-free win condition
- Energy as a separate firm type with wind/solar/hydrogen progression

## Contracts and tenders
- Breach declaration fine: post-MVP set per contract rather than global config
- Market-buyer fine mechanism: requires different counterparty model
- Bid deposits or inventory reservation to prevent award shortfalls
- Quality re-evaluated at award time rather than snapshotted at bid submission
- Per-contract negotiation of terms (price, volume, duration, quality, fine)
- Sourcing screen: dedicated UI for managing supply contracts per firm

## Stores and retail
- Store quality affecting customer satisfaction and repeat visits
- Budget chain mechanics: volume discounts on harbor purchases, logistics network bonus
- Brand dilution for chains that expand too wide without quality investment
- Focused marketing per product driving ramp speed
- Seasonal demand variation per product
- Store sections for cosmetics, hardware, clothing, pharmacy with associated products

## Infrastructure
- Storage facility as a separate firm type
- Transport network investment: reducing link costs, increasing capacity
- Logistics hub investments improving delivery time across network
- Per-firm training override fully exposed in UI with expandable breakdown

## Game experience
- Setup phase: choose starting conditions, difficulty, corporation identity before game begins
- Hall of fame with win statistics
- Summary screen on game end showing career statistics
- Multiple win conditions: domination, supply chain monopoly, conglomerate, greenhouse gas free
- Save and load game
- Procedurally generated or config-driven map topology for replayability
- Competitor diplomacy screen

---

# PART 6: KNOWN GAPS IN MVP

- AI only builds stores, never factories or farms
- AI never submits tender bids for industrial output
- Market-buyer volume breach has no fine (no counterparty)
- Net worth in books always reflects current state, not historical turn
- Recession skew parameter in config but not yet wired up
- Trend indicator in products screen uses only 2 data points
- Loan repayment notification not implemented
- Sourcing screen not built: supply contract management crammed into RightPanel
- Products screen shows no trend for first 2 turns
- Peak revenue in win screen limited to rolling transaction window (last 40 turns)

---

*End of Master Specification Document v1.0*
*Next session: start fresh Claude Code chat and attach this document*
*MVP 2.0 first priorities: sourcing screen, AI industrial participation, specialization bonus, multiple win conditions, business development tree*
