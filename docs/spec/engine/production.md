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
