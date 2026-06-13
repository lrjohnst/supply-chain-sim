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
