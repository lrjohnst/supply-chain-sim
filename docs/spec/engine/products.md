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
