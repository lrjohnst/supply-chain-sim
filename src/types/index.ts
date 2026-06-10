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
  baseCost: number;       // cost per unit transported
  capacity: number;       // max units per turn
  investmentLevel: number; // 0 = base, higher = upgraded
}

export interface CityNode {
  id: EntityId;
  name: string;
  type: NodeType;
  population: number;
  firmSlots: number;       // max firms that can be built here
  energyCostMultiplier: number; // relative to harbor baseline
  hasHarborAccess: boolean;
  position: { x: number; y: number }; // for map rendering
}

export interface HarborNode {
  id: EntityId;
  name: string;
  position: { x: number; y: number };
  prices: Record<ProductId, number>; // current buy prices
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
  turnsRemaining: number; // 0 when complete
  costPaid: number;       // book value (no depreciation in MVP)
}

// ============================================================
// Production
// ============================================================

export interface ProductionLineConfig {
  inputProduct: ProductId;
  inputQuantity: number;
  outputProduct: ProductId;
  outputQuantity: number;
  turnsPerBatch: number;
}

// ============================================================
// Inventory
// ============================================================

export interface InventoryLine {
  product: ProductId;
  quantity: number;
  unitCost: number; // weighted average cost basis
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
  firmId: EntityId | null;       // null = corporate-level entry
  corporationId: EntityId;
  category: TransactionCategory;
  counterparty: string;          // human-readable: "Harbor", rival name, own firm name
  product: ProductId | null;     // null for non-product entries (interest, training)
  quantity: number | null;
  unitPrice: number | null;
  total: number;                 // negative = expense, positive = revenue
  description: string;           // e.g. "Bauxite — Harbor — 400t × €31/t"
}

// ============================================================
// Loans
// ============================================================

export interface Loan {
  id: EntityId;
  corporationId: EntityId;
  principal: number;
  outstandingBalance: number;
  annualInterestRate: number; // e.g. 0.08 = 8%
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
  corporationId: EntityId | null; // null if harbor or market
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
  qualityThreshold: number;  // 0–1, minimum quality to fulfill
  deliveryTurns: number;     // turns from order to delivery
  startTurn: number;
  durationTurns: number;     // 1–2 short term; longer after €100k milestone
  isInternal: boolean;       // true if both parties belong to same corporation
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
  publishedByCorporationId: EntityId | null; // null = market tender
  product: ProductId;
  volumeRequired: number;
  targetUnitPrice: number;
  minQuality: number;
  durationTurns: number;
  openTurn: number;
  closeTurn: number;
  status: TenderStatus;
  bids: TenderBid[];
  awardedBids: TenderBid[]; // may be partial, split across bidders
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
  quality: number;           // 0–1, improves with training and labs
  investments: Investment[];
  inventory: InventoryLine[];
  activeContractIds: EntityId[];
  activeTenderIds: EntityId[];
  // production state
  productionProgress: number; // turns elapsed in current batch
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
  cumulativeRevenue: number;          // tracks €100k milestone
  trainingBudgetPerTurn: number;      // corporate training slider
  marketingBudgetPerTurn: number;     // corporate marketing slider
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
  | "barcode_scanning_available"; // fires turn of 1984 Q1

export interface MacroEvent {
  id: EntityId;
  type: MacroEventType;
  turn: number;
  description: string;
  // effect payload — interpreted by engine based on type
  payload: Record<string, unknown>;
  acknowledged: boolean;
}

// ============================================================
// Game state
// ============================================================

export interface GameState {
  turn: number;             // 0-indexed, turn 0 = 1980 Q1
  phase: "setup" | "playing" | "won" | "lost";
  corporations: Record<EntityId, Corporation>;
  cityNodes: Record<EntityId, CityNode>;
  harborNode: HarborNode;
  mapLinks: Record<EntityId, MapLink>;
  firms: Record<EntityId, Firm>;
  contracts: Record<EntityId, Contract>;
  tenders: Record<EntityId, Tender>;
  loans: Record<EntityId, Loan>;
  transactions: Transaction[];        // append-only ledger
  pendingEvents: MacroEvent[];        // fires at start of next turn
  eventHistory: MacroEvent[];
  barcodeAvailable: boolean;
}

// ============================================================
// Derived / computed (not stored in state, computed on read)
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
