// ============================================================
// Core identifiers
// ============================================================

export type EntityId = string;

export type ProductId =
  | "raw_chicken"
  | "chicken"
  | "chicken_soup"
  | "bauxite"
  | "alumina"
  | "aluminium"
  | "laptop_whitelabel"
  | "laptop_branded"
  | "ice_cream_strawberry"
  | "printer_branded";

// ============================================================
// Harbor shocks & economic history
// ============================================================

/** A commodity price shock that is actively decaying back to baseline. */
export interface ActiveHarborShock {
  id: string;
  productId: ProductId;
  basePrice: number;
  shockedPrice: number;
  /** Duration drawn from normal distribution at shock creation. */
  normalizationDuration: number;
  /** Turns elapsed since the shock fired (0 on the turn it fires). */
  turnsElapsed: number;
}

/** Per-turn economic snapshot for the rolling history window. */
export interface EconomicSnapshot {
  turn: number;
  // Harbor prices
  harborPrices: Partial<Record<ProductId, number>>;
  harborBasePrices: Partial<Record<ProductId, number>>;
  harborShockDisplacements: Partial<Record<ProductId, number>>;
  harborNoiseTerm: Partial<Record<ProductId, number>>;
  // Demand — firmId → productId → value
  effectiveDemand: Record<string, Partial<Record<ProductId, number>>>;
  demandNoiseTerm: Record<string, Partial<Record<ProductId, number>>>;
  // Recession
  recessionSeverity: number;         // 0 when no recession
  recessionNoiseTerm: number;        // severity noise term this turn
  recessionEffectiveSeverity: number;// clamped severity actually used
  // Active shock summaries
  activeShocks: Array<{
    productId: ProductId;
    turnsElapsed: number;
    normalizationDuration: number;
    sCurveProgress: number;
    displacement: number;
  }>;
  // Interest rate (average across active loans; config base if no loans)
  currentInterestRate: number;
  // Net worth & cash
  playerNetWorth: number;
  aiNetWorth: number;
  playerCash: number;
  aiCash: number;
}

/** "mine" is a post-MVP firm type included now so product registry handlingFirms stay correct. */
export type FirmType = "farm" | "factory" | "store" | "mine";

export type NodeType = "city" | "harbor" | "port" | "airport";

/**
 * Geographic character of the region a city belongs to. Drawn once per region
 * centre in buildCityNodes and then carried on every node in that region.
 *
 * Drives: starting wealthIndex, population dealing order, link thresholds in
 * buildMapLinks, and the terrain colouring in NodeMap.
 */
export type ZoneChar = "metropolitan" | "industrial" | "rural" | "coastal";

// ============================================================
// Map configuration (player-configurable in a future UI)
// ============================================================

export interface MapConfig {
  // --- Scale ---
  nodeCount:        number;   // "Map size" — total nodes
  portCount:        number;   // "Number of ports"
  // --- Map type ---
  // "trading"    more coastal zones, denser connections
  // "industrial" more inland industrial zones, fewer ports
  // "frontier"   more rural, sparse connections, larger distances
  mapType: "trading" | "industrial" | "frontier";
  // --- Connectivity ---
  // "isolated"  very few connections, dead-ends common (frontier/colonial feel)
  // "sparse"    average degree 2–3
  // "normal"    average degree 3–4 (balanced default)
  // "dense"     average degree 4–6, few dead-ends (Western European feel)
  // Controls intra-zone AND cross-zone link thresholds independently.
  connectivity: "isolated" | "sparse" | "normal" | "dense";
  // Hard floor on organic road connections per node.
  // 0 = BFS fallback only (some dead-ends), 2 = NL-style (every node has ≥ 2 roads)
  minimumDegree: number;
  // --- Infrastructure ---
  // "undeveloped"  no highways — all links are roads
  // "basic"        highways between top ~8% of cities by population
  // "developed"    highways connecting cities ≥ 80k population (default)
  // "advanced"     highways connecting cities ≥ 40k, wider MST reach
  infrastructure: "undeveloped" | "basic" | "developed" | "advanced";
  // --- Difficulty ---
  // Easy:   more metropolitan zones, more connections
  // Medium: balanced (reference)
  // Hard:   more rural zones, fewer connections
  difficulty: "easy" | "medium" | "hard";
  // --- Canvas ---
  canvasWidth:  number;   // screen coordinate space width
  canvasHeight: number;   // screen coordinate space height
  // --- Port placement ---
  portEdgeMargin: number;   // "Coastal proximity" — ports within this many px of canvas edge
  // --- Highway network ---
  highwayMaxDistance: number;  // Max Euclidean px between nodes to be joined by MST highway edge
}

export type ContractPartyType = "corporation" | "harbor" | "market";

// ============================================================
// Geography
// ============================================================

export interface MapLink {
  id: EntityId;
  fromNodeId: EntityId;
  toNodeId: EntityId;
  baseCost: number;       // € per unit transported per link
  capacity: number;       // max units per turn
  investmentLevel: number;
  distance: number;       // km between the two nodes
  linkType: "highway" | "road";
}

export interface StoreLocation {
  id: EntityId;
  locationClass: "A" | "B" | "C";
  size: "small" | "medium" | "large";
  /** Firm ID that occupies this location, or null if free. */
  occupiedByFirmId: EntityId | null;
}

export interface CityNode {
  id: EntityId;
  name: string;
  type: NodeType;
  /**
   * Region character, inherited from the region centre this node was scattered
   * around. Set once by buildCityNodes and never mutated. buildMapLinks reads it
   * for per-zone link thresholds; NodeMap reads it to colour the terrain.
   */
  zone: ZoneChar;
  /** Current population. Updated each turn by tickPopulation(). */
  population: number;
  /** Slots for production firms (factories, farms, mines). Stores use storeSlots instead. */
  factorySlots: number;
  energyCostMultiplier: number;
  /**
   * Harbor access flag — derived at runtime from node type and map topology;
   * stored here for convenience. True when type === "port" or when directly
   * connected to a port/harbor node. Do not set manually; use isHarborAccessible().
   * @deprecated Prefer checking node.type === "port" or isHarborAccessible() directly.
   */
  harborAccess: boolean;
  position: { x: number; y: number };
  /** Purchasing power index (0–1). Updated each turn by tickWealth(). */
  wealthIndex: number;
  /** Firm type presence history. Post-MVP: drives cluster bonuses. */
  industrialIdentity: Partial<Record<string, number>>;
  /** Per-city demand multiplier. Static tuning knob set at construction. */
  demandModifier: number;
  /**
   * Atomic store locations available in this city. Each entry is a fixed class+size combination
   * that a store firm can occupy. city.ts may append new entries as the city grows.
   */
  storeLocations: StoreLocation[];
  // --- City life system (static, set at construction) ---
  /** Hard upper bound on population. Derived from starting population and a random territory factor. */
  geoCeiling: number;
  /** Logistic growth rate per turn. Drawn from normal distribution at construction. */
  baseGrowthRate: number;
  /** Per-turn wealth drift. Can be negative. Drawn from normal distribution at construction. */
  baseWealthRate: number;
  // --- Full-game history (unbounded, one entry per completed turn) ---
  /** Population recorded at the end of each completed turn. Index = turn number. */
  populationHistory: number[];
  /** wealthIndex recorded at the end of each completed turn. Index = turn number. */
  wealthHistory: number[];
}

export interface HarborNode {
  id: EntityId;
  name: string;
  position: { x: number; y: number };
  prices: Record<ProductId, number>;
}

// ============================================================
// Investments
// ============================================================

export type InvestmentType =
  // Farm
  | "crop_fields"
  | "livestock_facilities"
  | "irrigation_systems"
  | "cold_storage"
  | "processing_yard_farm"
  | "seasonal_planning_unit"
  | "training_farm"
  // Factory
  | "production_line"
  | "storage_facilities"
  | "packaging_lines"
  | "quality_lab"
  | "logistics_hub"
  | "processing_unit"
  | "branding_facility"
  | "training_factory"
  | "barcode_scanning"
  // Store — base sections
  | "grocery_section"
  | "cosmetics_section"
  | "hardware_section"
  | "electronics_section"
  | "clothing_section"
  | "pharmacy_section"
  | "warehouse_capacity"
  | "training_store"
  // Store — section expansions (add one extra product slot per investment)
  | "grocery_section_expansion"
  | "electronics_section_expansion";

/** Investment build lifecycle. Startup phase is tracked on ProductionLineSetup, not here. */
export type InvestmentStatus = "queued" | "in_progress" | "complete";

export interface Investment {
  id: EntityId;
  type: InvestmentType;
  status: InvestmentStatus;
  turnsRemaining: number;
  costPaid: number;
  /**
   * When true, the End Turn gate for this unconfigured store section is
   * permanently suppressed until the player configures sourcing/pricing.
   * Only relevant for store section investments.
   */
  intentionallyIdle: boolean;
}

// ============================================================
// Production line configuration (v1.1)
// Each completed production_line investment has one of these.
// ============================================================

export type RecipeKey =
  | "chicken"
  | "chicken_soup"
  | "alumina_refining"
  | "aluminium_smelting"
  | "laptop_branding";

export type SourceType = "harbor" | "own_inventory" | "spot_market";

/**
 * State machine for a single production line instance.
 * Separate from the Investment lifecycle (build phases live on Investment).
 *
 * unconfigured → player picks recipe → starting_up → active (producing)
 *
 * Reconfiguring an active line: recipe changes, restarts startup phase.
 * intentionallyIdle: player dismissed the config gate permanently for this line.
 */
export interface ProductionLineSetup {
  investmentId: EntityId;
  recipe: RecipeKey | null;
  sourceType: SourceType;
  lineStatus: "unconfigured" | "starting_up" | "active";
  /** Turns remaining in the startup phase. 0 when not starting_up. */
  startupTurnsRemaining: number;
  /** Per-line batch progress counter (replaces shared firm.productionProgress). */
  progress: number;
  /** When true, the End Turn gate for this unconfigured line is permanently suppressed. */
  intentionallyIdle: boolean;
  /**
   * Recipe change queued by the player during the current turn.
   * Applied at the start of the next tick (before production), so the
   * current turn's production completes with the old recipe first.
   * null = no pending change.
   */
  pendingRecipe: RecipeKey | null;
  /**
   * Output quality of this production line (0–1). Starts at productionLineBaseQuality.
   * Improves with quality_lab and training budget; decays without training.
   * Checked against contract quality thresholds and tender min quality.
   */
  quality: number;
}

// ============================================================
// Inventory
// ============================================================

export interface InventoryLine {
  product: ProductId;
  quantity: number;
  unitCost: number;
}

// ============================================================
// Transactions (ledger entries)
// ============================================================

export type TransactionCategory =
  | "revenue"
  | "input_cost"
  | "overhead"
  | "operating_cost"
  | "loan_interest"
  | "loan_repayment"
  | "loan_draw"
  | "investment_cost"
  | "training_cost"
  | "marketing_cost"
  | "transport_cost"
  | "fine_payment"
  | "staff_cost";

export interface Transaction {
  id: EntityId;
  turn: number;
  firmId: EntityId | null;
  corporationId: EntityId;
  category: TransactionCategory;
  counterparty: string;
  product: ProductId | null;
  quantity: number | null;
  unitPrice: number | null;
  total: number;
  description: string;
}

// ============================================================
// Loans
// ============================================================

export interface Loan {
  id: EntityId;
  corporationId: EntityId;
  /** Cumulative amount ever drawn from this facility (historical record). */
  principal: number;
  outstandingBalance: number;
  /** Tracks the current base rate; updated each turn from state.currentBaseInterestRate. */
  annualInterestRate: number;
}

// ============================================================
// Contracts
// ============================================================

export type ContractStatus = "active" | "completed" | "breached" | "pending";

export interface ContractParty {
  type: ContractPartyType;
  corporationId: EntityId | null;
  firmId: EntityId | null;
}

export interface Contract {
  id: EntityId;
  status: ContractStatus;
  buyerParty: ContractParty;
  sellerParty: ContractParty;
  product: ProductId;
  volumePerTurn: number;
  unitPrice: number;
  qualityThreshold: number;
  deliveryTurns: number;
  startTurn: number;
  durationTurns: number;
  isInternal: boolean;
  turnsExecuted: number;
  /** Links this contract back to its origin. null for manually-created contracts. */
  originId: EntityId | null;
  /** Which system created this contract. Extensible for future mechanisms. */
  originType: "tender" | "direct" | "sourcing" | null;
  /** Whether the one-turn advance renewal notice has been sent for this contract. */
  incumbentNoticeGiven: boolean;
  /** Last turn a breach risk warning was emitted for this contract. 0 = never. */
  lastBreachWarnTurn: number;
  /** Cumulative units short-delivered across all turns. Resets on a full-delivery turn. */
  cumulativeVolumeShortfall: number;
  /** Consecutive turns where seller quality was below threshold. Resets when quality recovers. */
  consecutiveQualityFailureTurns: number;
}

// ============================================================
// Tenders
// ============================================================

export type TenderStatus = "open" | "awarded" | "closed" | "expired";
export type TenderDirection = "market" | "player_sourcing";

export interface TenderBid {
  corporationId: EntityId;
  firmId: EntityId;
  volumeOffered: number;
  unitPrice: number;
  qualityOffered: number;
  submittedTurn: number;
}

export interface Tender {
  id: EntityId;
  direction: TenderDirection;
  publishedByCorporationId: EntityId | null;
  /** The specific buyer firm for sourcing tenders. Null for market tenders. */
  publishedByFirmId: EntityId | null;
  product: ProductId;
  volumeRequired: number;
  targetUnitPrice: number;
  minQuality: number;
  durationTurns: number;
  openTurn: number;
  closeTurn: number;
  status: TenderStatus;
  bids: TenderBid[];
  awardedBids: TenderBid[];
  // ---- Renewal cycle fields ----
  /** Duration of the supply contract spawned when this tender is awarded. */
  contractDurationTurns: number;
  /** Bidding window for the renewal tender (turns between contract expiry and renewal close). */
  renewalGapTurns: number;
  /** Which renewal cycle this is. Starts at 1. */
  cycleNumber: number;
  /** The tender this was renewed from. null for the first cycle. */
  previousTenderId: EntityId | null;
  /** How much minQuality increases each renewal cycle. */
  qualityDriftPerCycle: number;
  /** Volume growth factor applied to produce this tender's volumeRequired from the prior cycle. */
  volumeGrowthFactor: number;
  /** Corporation that held the previous contract. Gets advance notice of renewal. */
  incumbentCorporationId: EntityId | null;
  /** Whether the advance renewal notice has been pushed to the incumbent. */
  incumbentNoticeGiven: boolean;
}

// ============================================================
// Tender renewals
// ============================================================

export interface PendingTenderRenewal {
  originalTenderId: EntityId;
  scheduledForTurn: number;
  incumbentCorporationId: EntityId | null;
  productId: ProductId;
}

// ============================================================
// Firms
// ============================================================

export interface Firm {
  id: EntityId;
  corporationId: EntityId;
  cityNodeId: EntityId;
  type: FirmType;
  name: string;
  /** locationClass is only meaningful for stores. It models consumer footfall and market reach (demand multiplier, elasticity scaling). Non-store firms default to "B" with no mechanical effect. Future firm types (factory, farm, mine) will use different location models. */
  locationClass: "A" | "B" | "C";
  /** size drives investment slots for stores, factories, and farms. Mine capacity model is deferred — mine capacity is determined by geological deposit, not a size choice at construction. Non-store firms default to "medium". */
  size: "small" | "medium" | "large";
  investments: Investment[];
  // Production line configs — one entry per completed production_line investment
  productionLines: ProductionLineSetup[];
  inventory: InventoryLine[];
  /** Reserved for future tender tracking. Currently unused by the engine. */
  activeTenderIds: EntityId[];
  sellToCompetitors: boolean;
  /** Retail price overrides (player-set). Falls back to config benchmark if absent. */
  retailPrices: Partial<Record<ProductId, number>>;
  /**
   * Sales ramp progress per product (continuous float).
   * Advances by unitsSold/fullRampDemand each turn; resets to 0 on stockout.
   * Fed into computeRampFraction() to produce the ramp multiplier.
   */
  salesRampProgress: Partial<Record<ProductId, number>>;
  /**
   * Harbor auto-source: store buys exactly estimated demand of this product
   * from harbor each turn as a spot purchase. Stores only.
   */
  harborAutoSource: Partial<Record<ProductId, boolean>>;
  /** Training intensity for this firm (0–100). Default: corporation's corporateTrainingIntensity. */
  trainingIntensity: number;
  /** True when the player has individually overridden this firm's training intensity. */
  trainingIntensityOverridden: boolean;
  /**
   * Actual trained fraction of staff (0.0–1.0). Starts at 0.0 on a new firm.
   * Distinct from trainingIntensity: this only moves via updateTrainedFraction()
   * in the engine tick, never directly from the training slider. Drives the
   * staff ball display and the retail capacity multiplier. Store firms only.
   */
  trainedFraction: number;
  /**
   * Employee headcount, recalculated each turn from completed section
   * investments and store size. Store firms only; minimum 1.
   */
  employeeCount: number;
  /**
   * Per-product utilization this turn (0.0–1.0+), relative to an equal
   * fair share of the section's total capacity. Store firms only.
   */
  utilizationPerSlot: Partial<Record<ProductId, number>>;
  /**
   * True if this product's sales were actually truncated below demand
   * because the section's capacity pool ran out this turn. Distinct from
   * utilizationPerSlot crossing 100% — this is the accurate "at capacity"
   * signal (utilizationPerSlot measures fair-share load, which can exceed
   * 100% without the pool itself being exhausted). Store firms only.
   */
  capacityLimitedSlot: Partial<Record<ProductId, boolean>>;
}

// ============================================================
// Corporations
// ============================================================

export interface Corporation {
  id: EntityId;
  name: string;
  isPlayer: boolean;
  cash: number;
  firmIds: EntityId[];
  loanIds: EntityId[];
  cumulativeRevenue: number;
  /** Corporate-wide training intensity (0–100). Applied to new firms and non-overridden firms. */
  corporateTrainingIntensity: number;
  marketingBudgetPerTurn: number;
  multiYearContractsUnlocked: boolean;
  /** AI only. Set when the AI cannot meet an obligation. Game continues without it. */
  eliminated: boolean;
}

// ============================================================
// Macro events
// ============================================================

export type MacroEventType =
  | "interest_rate_change"
  | "recession"
  | "commodity_price_shock"
  | "tender_opportunity"
  | "tender_closure"
  | "barcode_scanning_available";

export interface MacroEvent {
  id: EntityId;
  type: MacroEventType;
  turn: number;
  description: string;
  payload: Record<string, unknown>;
  acknowledged: boolean;
}

// ============================================================
// Game state
// ============================================================

export interface GameState {
  turn: number;
  phase: "setup" | "playing" | "won" | "lost";
  corporations: Record<EntityId, Corporation>;
  cityNodes: Record<EntityId, CityNode>;
  harborNode: HarborNode;
  mapLinks: Record<EntityId, MapLink>;
  firms: Record<EntityId, Firm>;
  contracts: Record<EntityId, Contract>;
  tenders: Record<EntityId, Tender>;
  loans: Record<EntityId, Loan>;
  transactions: Transaction[];
  pendingEvents: MacroEvent[];
  eventHistory: MacroEvent[];
  barcodeAvailable: boolean;
  recessionTurnsRemaining: number;
  /** Severity multiplier drawn when a recession fires (0 = no recession active). */
  recessionSeverity: number;
  /** Turns remaining before another recession can be generated. */
  recessionCooldownRemaining: number;
  /** Currently decaying commodity price shocks. */
  activeHarborShocks: ActiveHarborShock[];
  /** Rolling economic history (capped at config window). */
  economicHistory: EconomicSnapshot[];
  /** Current base interest rate, updated by macro events. New loans use this. */
  currentBaseInterestRate: number;
  /** Notifications generated during this tick. Read and cleared by tick(). */
  pendingNotifications: string[];
  /** Tender renewals queued for posting. Processed by processRenewals() in tick.ts. */
  pendingTenderRenewals: PendingTenderRenewal[];
}

// ============================================================
// Derived / computed
// ============================================================

export interface FirmBooks {
  firmId: EntityId;
  turn: number;
  revenue: number;
  inputCosts: number;
  overheadCosts: number;
  operatingCosts: number;
  staffWageCosts: number;
  capitalExpenditure: number;
  netProfit: number;
  lines: Transaction[];
}

export interface CorporateBooks {
  corporationId: EntityId;
  turn: number;
  revenue: number;
  inputCosts: number;
  overheadCosts: number;
  operatingCosts: number;
  staffWageCosts: number;
  capitalExpenditure: number;
  loanInterest: number;
  netProfit: number;
  netWorth: number;
  firmBooks: FirmBooks[];
  lines: Transaction[];
}

// ============================================================
// Open market sourcing (v1.1)
// ============================================================

export interface MarketSource {
  type: "harbor" | "own_firm" | "rival_firm";
  label: string;             // "Harbor", "Norvik Farm", "Rival Corp Store"
  corporationId: EntityId | null;
  firmId: EntityId | null;
  unitPrice: number;
  availableVolume: number;
  isSpot: boolean;           // true = spot purchase (no contract), false = via contract
  transportCost: number;     // additional cost per unit to reach destination node
}
