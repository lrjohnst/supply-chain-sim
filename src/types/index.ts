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

// Products the harbor sells (v1.1: exactly four)
export const HARBOR_SELL_PRODUCTS: ProductId[] = [
  "ice_cream_strawberry",
  "laptop_whitelabel",
  "printer_branded",
  "bauxite",
];

export type FirmType = "farm" | "factory" | "store";

export type NodeType = "city" | "town" | "harbor";

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
}

export interface CityNode {
  id: EntityId;
  name: string;
  type: NodeType;
  population: number;
  firmSlots: number;
  energyCostMultiplier: number;
  hasHarborAccess: boolean;
  position: { x: number; y: number };
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
  // Store
  | "grocery_section"
  | "cosmetics_section"
  | "hardware_section"
  | "electronics_section"
  | "clothing_section"
  | "pharmacy_section"
  | "warehouse_capacity"
  | "training_store";

export type InvestmentStatus = "not_built" | "in_progress" | "complete";

export interface Investment {
  id: EntityId;
  type: InvestmentType;
  status: InvestmentStatus;
  turnsRemaining: number;
  costPaid: number;
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

export interface ProductionLineSetup {
  investmentId: EntityId;   // which production_line investment this belongs to
  recipe: RecipeKey | null; // null = not configured yet
  sourceType: SourceType;
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
  | "operating_cost"
  | "loan_interest"
  | "loan_repayment"
  | "investment_cost"
  | "training_cost"
  | "marketing_cost"
  | "transport_cost";

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
  principal: number;
  outstandingBalance: number;
  annualInterestRate: number;
  quarterlyPayment: number;
  turnTaken: number;
  durationTurns: number;
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
  quality: number;
  investments: Investment[];
  // Production line configs — one entry per completed production_line investment
  productionLines: ProductionLineSetup[];
  inventory: InventoryLine[];
  activeContractIds: EntityId[];
  activeTenderIds: EntityId[];
  productionProgress: Record<RecipeKey, number>; // per-recipe batch progress
  // v1.1
  sellToCompetitors: boolean;
  // Retail price overrides (player-set). Falls back to config benchmark if absent.
  retailPrices: Partial<Record<ProductId, number>>;
  // Sales ramp progress: turns this product has been actively selling at this firm
  salesRampTurns: Partial<Record<ProductId, number>>;
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
  activeContractIds: EntityId[];
  cumulativeRevenue: number;
  trainingBudgetPerTurn: number;
  marketingBudgetPerTurn: number;
  multiYearContractsUnlocked: boolean;
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
}

// ============================================================
// Derived / computed
// ============================================================

export interface FirmBooks {
  firmId: EntityId;
  turn: number;
  revenue: number;
  inputCosts: number;
  operatingCosts: number;
  netProfit: number;
  lines: Transaction[];
}

export interface CorporateBooks {
  corporationId: EntityId;
  turn: number;
  revenue: number;
  inputCosts: number;
  operatingCosts: number;
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
