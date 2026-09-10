/**
 * products.ts — central product registry.
 *
 * Single authoritative source for what every product IS and how it moves
 * through the world: display name, category, purchase sources, sale
 * destinations, firm handling eligibility, transformation graph, and flags.
 *
 * What this file does NOT own:
 *   - Prices of any kind (→ gameConfig.ts / harbor.ts)
 *   - Production recipes and quantities (→ gameConfig.ts)
 *   - Demand rates (→ gameConfig.ts)
 *
 * Note on product ID naming: IDs (e.g. "laptop_whitelabel", "chicken") are
 * kept as-is for MVP 1.0. Renaming to the canonical spec convention
 * (white_label_laptop, packaged_chicken, etc.) is a dedicated task deferred
 * to MVP 2.0 and must not be folded into other changes.
 */

import type { ProductId, FirmType, InvestmentType } from "../types";

// ============================================================
// Types
// ============================================================

export type ProductCategory = "raw_material" | "intermediate_good" | "consumer_good";
export type PurchaseSource  = "harbor" | "own_firm" | "competitor_firm";
export type SaleDestination = "tender" | "direct_contract" | "consumer_retail";

export interface ProductProfile {
  /** Human-readable display name. Single source of truth — use displayName() everywhere. */
  displayName: string;

  category: ProductCategory;

  /** Where this product can be acquired. A product may have multiple valid sources. */
  purchaseSources: PurchaseSource[];

  /** Where this product can be sold. A product may have multiple valid destinations. */
  saleDestinations: SaleDestination[];

  /**
   * Firm types that can receive, hold, or process this product.
   * "mine" is a post-MVP firm type; including it now means bauxite handling
   * will be correctly defined when mines are implemented without touching the registry.
   */
  handlingFirms: FirmType[];

  /** Products this can be made from via transformation. Empty = not produced via transformation. */
  transformableFrom: ProductId[];

  /** Products this can become via transformation. Empty = end product or not transformable. */
  transformableInto: ProductId[];

  // ---- Flags ----

  /**
   * Post-MVP placeholder. Default false for all MVP products.
   * Set to true for perishables (raw chicken, packaged chicken, chicken soup,
   * ice cream) when spoilage mechanics are implemented.
   */
  perishable: boolean;

  /**
   * True if this product can be purchased unbranded and branded by the player
   * via a branding facility investment. The white-label form is the input;
   * the branded form is the output.
   */
  whiteLabelEligible: boolean;

  /**
   * True if this product is a branded finished consumer good — either purchased
   * pre-branded from an external source (harbor) or produced as the branded
   * output of a player factory. Branded consumer goods cannot be stored in a
   * factory (only the production buffer is permitted by the engine).
   */
  isBranded: boolean;

  /**
   * Post-MVP placeholder for standalone storage firm type.
   * Default false for all MVP products.
   */
  storageFirmEligible: boolean;

}

// ============================================================
// Registry
// ============================================================

const PRODUCT_REGISTRY: Record<ProductId, ProductProfile> = {

  // ---- Raw materials ----

  bauxite: {
    displayName: "Bauxite",
    category: "raw_material",
    purchaseSources: ["harbor"],
    saleDestinations: ["direct_contract"],
    handlingFirms: ["factory", "mine"],   // mine: post-MVP firm type
    transformableFrom: [],
    transformableInto: ["alumina"],
    perishable: false,
    whiteLabelEligible: false,
    isBranded: false,
    storageFirmEligible: false,
  },

  raw_chicken: {
    displayName: "Raw chicken",
    category: "raw_material",
    purchaseSources: ["own_firm"],
    saleDestinations: ["direct_contract"],
    handlingFirms: ["farm", "factory"],
    transformableFrom: [],
    transformableInto: ["chicken", "chicken_soup"],
    perishable: false,   // post-MVP: should be true
    whiteLabelEligible: false,
    isBranded: false,
    storageFirmEligible: false,
  },

  // ---- Intermediate goods ----

  alumina: {
    displayName: "Alumina",
    category: "intermediate_good",
    purchaseSources: ["own_firm", "competitor_firm"],
    saleDestinations: ["tender", "direct_contract"],
    handlingFirms: ["factory"],
    transformableFrom: ["bauxite"],
    transformableInto: ["aluminium"],
    perishable: false,
    whiteLabelEligible: false,
    isBranded: false,
    storageFirmEligible: false,
  },

  aluminium: {
    displayName: "Aluminium",
    category: "intermediate_good",
    purchaseSources: ["own_firm", "competitor_firm"],
    saleDestinations: ["tender", "direct_contract"],
    handlingFirms: ["factory"],
    transformableFrom: ["alumina"],
    transformableInto: [],
    perishable: false,
    whiteLabelEligible: false,
    isBranded: false,
    storageFirmEligible: false,
  },

  // ---- Consumer goods ----

  chicken: {
    displayName: "Packaged chicken",
    category: "consumer_good",
    purchaseSources: ["own_firm", "competitor_firm"],
    saleDestinations: ["consumer_retail", "direct_contract"],
    handlingFirms: ["factory", "store"],
    transformableFrom: ["raw_chicken"],
    transformableInto: [],
    perishable: false,   // post-MVP: should be true
    whiteLabelEligible: false,
    isBranded: false,
    storageFirmEligible: false,
  },

  chicken_soup: {
    displayName: "Chicken soup",
    category: "consumer_good",
    purchaseSources: ["own_firm", "competitor_firm"],
    saleDestinations: ["consumer_retail", "direct_contract"],
    handlingFirms: ["factory", "store"],
    transformableFrom: ["raw_chicken"],
    transformableInto: [],
    perishable: false,   // post-MVP: should be true
    whiteLabelEligible: false,
    isBranded: false,
    storageFirmEligible: false,
  },

  /**
   * White-label laptop: purchased from harbor, stored in factory, branded by
   * player via branding facility into laptop_branded.
   * Factory storage is eligible because whiteLabelEligible is true.
   */
  laptop_whitelabel: {
    displayName: "White-label laptop",
    category: "consumer_good",
    purchaseSources: ["harbor", "own_firm", "competitor_firm"],
    saleDestinations: ["direct_contract"],
    handlingFirms: ["factory"],
    transformableFrom: [],
    transformableInto: ["laptop_branded"],
    perishable: false,
    whiteLabelEligible: true,
    isBranded: false,
    storageFirmEligible: false,
  },

  /**
   * Branded laptop: output of the player's branding facility.
   * isBranded: true → cannot be stored in a factory (production buffer only).
   * Note: the engine currently places branded laptops in factory inventory
   * post-production. This registry value is authoritative for UI and future
   * storage enforcement; it does not change existing production logic.
   */
  laptop_branded: {
    displayName: "Branded laptop",
    category: "consumer_good",
    purchaseSources: ["own_firm", "competitor_firm"],
    saleDestinations: ["consumer_retail", "direct_contract"],
    handlingFirms: ["store"],
    transformableFrom: ["laptop_whitelabel"],
    transformableInto: [],
    perishable: false,
    whiteLabelEligible: false,
    isBranded: true,
    storageFirmEligible: false,
  },

  /**
   * Strawberry ice cream: purchased pre-branded from harbor, sold in stores.
   * isBranded: true — arrives as a finished branded consumer good.
   * perishable: false for MVP; should be true when spoilage is implemented.
   */
  ice_cream_strawberry: {
    displayName: "Strawberry ice cream",
    category: "consumer_good",
    purchaseSources: ["harbor"],
    saleDestinations: ["consumer_retail"],
    handlingFirms: ["store"],
    transformableFrom: [],
    transformableInto: [],
    perishable: false,   // post-MVP: should be true
    whiteLabelEligible: false,
    isBranded: true,
    storageFirmEligible: false,
  },

  /**
   * Branded printer: purchased pre-branded from harbor, sold in stores.
   * isBranded: true — arrives as a finished branded consumer good.
   */
  printer_branded: {
    displayName: "Branded printer",
    category: "consumer_good",
    purchaseSources: ["harbor"],
    saleDestinations: ["consumer_retail"],
    handlingFirms: ["store"],
    transformableFrom: [],
    transformableInto: [],
    perishable: false,
    whiteLabelEligible: false,
    isBranded: true,
    storageFirmEligible: false,
  },

};

// ============================================================
// Public API
// ============================================================

/** Returns the full profile for a product. */
export function getProduct(id: ProductId): ProductProfile {
  return PRODUCT_REGISTRY[id];
}

/** Returns all [id, profile] entries in the registry. */
export function getAllProducts(): [ProductId, ProductProfile][] {
  return Object.entries(PRODUCT_REGISTRY) as [ProductId, ProductProfile][];
}

/** Returns the canonical display name for a product ID. Use everywhere instead of replace(/_/g, " "). */
export function displayName(id: ProductId): string {
  return PRODUCT_REGISTRY[id].displayName;
}

/** Returns all product IDs with the given category. */
export function getProductsByCategory(category: ProductCategory): ProductId[] {
  return getAllProducts()
    .filter(([, p]) => p.category === category)
    .map(([id]) => id);
}

/** Returns all product IDs purchasable from the given source. */
export function getProductsByPurchaseSource(source: PurchaseSource): ProductId[] {
  return getAllProducts()
    .filter(([, p]) => p.purchaseSources.includes(source))
    .map(([id]) => id);
}

/** Returns all product IDs sellable to the given destination. */
export function getProductsBySaleDestination(dest: SaleDestination): ProductId[] {
  return getAllProducts()
    .filter(([, p]) => p.saleDestinations.includes(dest))
    .map(([id]) => id);
}

/** Returns all product IDs that can be handled by the given firm type. */
export function getProductsHandledBy(firmType: FirmType): ProductId[] {
  return getAllProducts()
    .filter(([, p]) => p.handlingFirms.includes(firmType))
    .map(([id]) => id);
}

/**
 * Returns true if the product can be stored in a factory (beyond the built-in
 * production buffer) and is eligible for expanded capacity via a storage
 * facility investment.
 *
 * Rules:
 *   - Raw materials and intermediate goods: always eligible.
 *   - Consumer goods: eligible only if whiteLabelEligible and not isBranded.
 *   - Branded consumer goods: never eligible (factory storage prohibited).
 */
export function isFactoryStorageEligible(id: ProductId): boolean {
  const p = PRODUCT_REGISTRY[id];
  if (p.category === "raw_material" || p.category === "intermediate_good") return true;
  if (p.category === "consumer_good") return p.whiteLabelEligible && !p.isBranded;
  return false;
}

/** Returns true if the product can be purchased from the harbor. */
export function isSoldByHarbor(id: ProductId): boolean {
  return PRODUCT_REGISTRY[id].purchaseSources.includes("harbor");
}

/**
 * Canonical section → sellable product list, in priority order.
 * Order matters: it determines which product gets first access to a
 * section's shared capacity pool when capacity is constrained.
 * Single source of truth — used by retail.ts, harborSpotPurchase.ts, and StoreFirmOverview.tsx.
 */
export const STORE_SECTION_PRODUCTS: Partial<Record<InvestmentType, ProductId[]>> = {
  grocery_section:     ["chicken", "chicken_soup", "ice_cream_strawberry"],
  electronics_section: ["laptop_branded", "printer_branded"],
};

/** Maps a base section investment type to its expansion investment type, if any. */
export const SECTION_EXPANSION_TYPE: Partial<Record<InvestmentType, InvestmentType>> = {
  grocery_section:     "grocery_section_expansion",
  electronics_section: "electronics_section_expansion",
};

/**
 * Returns sellable product IDs for a store based on which sections are built.
 * Single source of truth — used by retail.ts, harborSpotPurchase.ts, and RightPanel.tsx.
 */
export function getStoreSellableProducts(
  firm: { investments: { type: string; status: string }[] }
): ProductId[] {
  const has = (t: string) =>
    firm.investments.some((i) => i.type === t && i.status === "complete");
  const products: ProductId[] = [];
  for (const [sectionType, sectionProducts] of Object.entries(STORE_SECTION_PRODUCTS)) {
    if (has(sectionType)) products.push(...sectionProducts!);
  }
  return products;
}

/** Total product slots in a section: 1 base + 1 per completed expansion investment. */
export function getSectionSlotCount(
  firm: { investments: { type: string; status: string }[] },
  sectionType: InvestmentType
): number {
  const expType = SECTION_EXPANSION_TYPE[sectionType];
  const expCount = expType
    ? firm.investments.filter((i) => i.type === expType && i.status === "complete").length
    : 0;
  return 1 + expCount;
}
