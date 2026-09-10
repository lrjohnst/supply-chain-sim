# Utilization System Redesign

## Status
Deferred. Current implementation is a placeholder.

## Problem with current system

Store throughput capacity is derived directly from fullRampDemand:

```
maxThroughput = floor(fullRampDemand × (capacityMin + trainedFraction × capacityRange))
```

This means at 100% training, maxThroughput equals exactly fullRampDemand. Capacity is always conveniently equal to demand. This is circular and unrealistic.

Two scenarios that should exist but currently cannot:
- A small A-location store that cannot serve all customers even at 100% training
- A large C-location store with more capacity than customers (overcapacity)

## Desired system

### Independent capacity

Store capacity is a property of the store itself, not derived from demand:

```
storeCapacity = baseCapacityPerEmployee × employeeCount × trainedFractionMultiplier
```

Where baseCapacityPerEmployee is a config parameter representing how many units per turn one fully trained employee can process. This is product-agnostic: a unit of capacity serves one customer regardless of what they buy.

trainedFractionMultiplier = capacityMin + trainedFraction × capacityRange (same formula, different basis)

effectiveSales = min(cityDemandShare, storeCapacity, inventoryAvailable)

### City-wide demand pool

Each product has a city-level demand pool per turn. Multiple stores in the same city draw from this shared pool. The pool is distributed proportionally to store capacity or in order of store quality/brand (to be designed).

If total store capacity across all stores in the city exceeds the demand pool, stores share the demand proportionally. If demand exceeds total capacity, customers go unserved.

This makes competition between stores in the same city meaningful: opening a second store in a city already served by a competitor reduces that competitor's market share.

### Overcapacity as a cost

A store with more throughput capacity than customers generates staff wages with no corresponding revenue. The player should feel the cost of over-building through the staff wages mechanic already implemented.

## Design questions to resolve before implementing

1. How is city-wide demand distributed between competing stores? Options:
   - Proportional to store capacity
   - Proportional to store quality × brand × price attractiveness
   - First-come-first-served by store age

2. Does the city demand pool update every turn or only when stores open/close?

3. How does this interact with the ramp curve? Does the ramp track store-level familiarity or city-level product penetration?

4. What happens when a competitor closes? Does their former demand flow back to the pool?

## Implementation notes

- retail.ts runRetailSales needs access to all stores in the same city for the same product
- A new city-level demand state may be needed on CityNode or computed fresh each tick
- harborSpotPurchase.ts capacity cap calculation must use the same new formula
- The utilization bar in StoreFirmOverview should show storeCapacity vs cityDemandShare, not sold vs maxThroughput
