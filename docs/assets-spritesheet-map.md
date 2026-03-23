# Asset Spritesheet Map

> **Note**: This document is based on visual analysis of assets from the **Sprout Lands Basic Pack** by **Cup Nooble**. Tile coordinates are given as (col, row) starting from (0, 0) at top-left.

---

## Tile Size Reference

All tilesets use **16x16 pixel tiles** as the base unit. Character and object sprites also use 16x16 base units, sometimes spanning 2x2 or 3x4 tile areas for larger objects.

**Display scale**: Render at 3x = 48x48 px per tile.

---

## 1. Grass.png

**Dimensions**: 176x112px — 11 cols x 7 rows of 16x16

This is a **bitmask autotile** set. Each tile variant handles a specific combination of grass neighbors. The bitmask checks the **4 cardinal neighbors** (N, E, S, W) to select the correct edge tile.

### Bitmask Encoding (4-bit, cardinal only)

```
Bit 3 (8) = North neighbor is grass
Bit 2 (4) = East neighbor is grass
Bit 1 (2) = South neighbor is grass
Bit 0 (1) = West neighbor is grass
```

Value `0` = isolated (no grass neighbors). Value `15` = fully interior (all 4 neighbors are grass).

### Group A: Small Isolated Island (cols 0–2, rows 0–2)

A complete 3x3 set for small standalone grass patches surrounded by water on all sides.

| Grid (col, row) | N     | E     | S     | W     | Description                   |
|----------------|-------|-------|-------|-------|-------------------------------|
| (0, 0)         | water | grass | grass | water | Top-left corner               |
| (1, 0)         | water | grass | grass | grass | Top edge                      |
| (2, 0)         | water | water | grass | grass | Top-right corner              |
| (0, 1)         | grass | grass | grass | water | Left edge                     |
| (1, 1)         | grass | grass | grass | grass | Full inner — all neighbors grass |
| (2, 1)         | grass | water | grass | grass | Right edge                    |
| (0, 2)         | grass | grass | water | water | Bottom-left corner            |
| (1, 2)         | grass | grass | water | grass | Bottom edge                   |
| (2, 2)         | grass | water | water | grass | Bottom-right corner           |

### Group B: Single Tile and Thin Strip Variants (col 3, rows 0–5)

For very narrow (1-tile-wide) grass strips.

| Grid (col, row) | Description                              |
|----------------|------------------------------------------|
| (3, 0)         | Isolated single tile — water on all 4 sides |
| (3, 1)         | Horizontal strip — left cap              |
| (3, 2)         | Horizontal strip — middle (repeatable)   |
| (3, 3)         | Horizontal strip — right cap             |
| (3, 4)         | Vertical strip — top cap                 |
| (3, 5)         | Vertical strip — middle (repeatable)     |

### Group C: Large Island Bitmask Tiles (cols 4–10, rows 0–4)

Main bitmask block for rendering large grass islands surrounded by water. Covers all 47 standard autotile combinations.

| Grid (col, row) | Description                                             |
|----------------|---------------------------------------------------------|
| (4, 0)         | N exposed, E+S+W=grass — top edge of large island      |
| (5, 0)         | N+E exposed — top-right outer corner                   |
| (6, 0)         | E exposed, N+S+W=grass — right edge                    |
| (7, 0)         | S+E exposed — bottom-right outer corner                |
| (8, 0)         | S exposed — bottom edge                                |
| (9, 0)         | S+W exposed — bottom-left outer corner                 |
| (10, 0)        | W exposed — left edge                                  |
| (4, 1)         | N+W exposed — top-left outer corner                    |
| (5, 1)         | Inner concave — grass all cardinal, missing NE diagonal |
| (6, 1)         | Inner concave — missing NW diagonal                    |
| (7, 1)         | Inner concave — missing SE diagonal                    |
| (8, 1)         | Inner concave — missing SW diagonal                    |
| (5, 2)         | Inner concave — missing NE+NW diagonals                |
| (6, 2)         | Inner concave — missing NE+SE diagonals                |

Remaining tiles in rows 2–4 continue covering all diagonal combinations for complete 47-tile autotile coverage.

### Group D: Decorative Inner Grass Variants (rows 5–6)

Cosmetic alternates for the (1, 1) inner tile with:
- Tiny flowers (white/yellow dots)
- Small pebble clusters
- Subtle texture variations

These are drop-in visual replacements for interior grass — same neighbor logic, different appearance.

---

## 2. Water.png

**Dimensions**: 64x16px — 4 cols x 1 row of 16x16

4 frames of animated water cycling for a subtle shimmer effect. All frames are flat teal/cyan with light blue ripple marks.

| Grid (col, row) | Description                        |
|----------------|------------------------------------|
| (0, 0)         | Frame 0 — base, subtle ripple lines |
| (1, 0)         | Frame 1 — slightly different ripple |
| (2, 0)         | Frame 2 — ripple variant           |
| (3, 0)         | Frame 3 — ripple variant           |

For static display, use frame 0 or 1. To animate, cycle all 4 frames.

---

## 3. Hills.png

**Dimensions**: ~176x192px (approximate)

Contains grass tiles combined with cliff edges across three distinct sections:

| Section         | Content                                                              |
|-----------------|----------------------------------------------------------------------|
| Top section     | Green grass bitmask set — same structure as Grass.png but with cliff/height edge transitions |
| Middle section  | Cliff face tiles — brown/tan vertical cliff walls with various edge combinations |
| Bottom section  | Sandy/path transition tiles at cliff base; sand biome transition tiles |

---

## 4. Basic Grass Biom things 1.png

**Dimensions**: 144x80px — 9 cols x 5 rows of 16x16

Decoration sprites placed on top of grass tiles (not walkable). Objects span 1x1, 1x2, or 2x2 tile areas.

> **Verified**: every tile below was confirmed by pixel-accurate extraction and visual inspection. Pixel offsets (sx, sy) are the values that render correctly in PixiJS at 3× scale.

### ⚠️ Do NOT use in grass scenes
These tiles are UI/inventory icons (have white outline border) or aquatic props — they look wrong on grass:
- **(2,2)**: Red apple — inventory icon
- **(3,2), (4,2)**: Brown bell/hive shapes — inventory icons
- **(5,3)**: Blue chest icon — inventory icon
- **(0,4)–(3,4)**: Lily pad and log fragments — aquatic, visually incomplete when isolated
- **(7,4)–(8,4)**: Lily pads — aquatic water plants

### Row 0–1: Trees (cols 0–4)

| Grid Region | Object | Size | sx, sy, sw, sh |
|-------------|--------|------|----------------|
| (0,0)–(0,1) | Small standalone tree — round green canopy + brown trunk | 1×2 tiles (16×32) | 0, 0, 16, 32 |
| (1,0)–(2,1) | Large green round tree — full bushy canopy + trunk | 2×2 tiles (32×32) | **16, 0, 32, 32** |
| (3,0)–(4,1) | Cherry blossom / heart tree — green canopy with pink hearts | 2×2 tiles (32×32) | **48, 0, 32, 32** |

### Row 0: Individual mushrooms (cols 5–8)

| Grid | Object | sx, sy, sw, sh |
|------|--------|----------------|
| (5,0) | Brown mushroom pair (two caps + stems) | 80, 0, 16, 16 |
| (6,0) | Pink/brown mushroom (single cap) | 96, 0, 16, 16 |
| (7,0) | Purple cross mushroom | 112, 0, 16, 16 |
| (8,0) | Purple mushroom variant | 128, 0, 16, 16 |

### Row 1: Leaf clusters & rocks (cols 5–8)

| Grid | Object | sx, sy, sw, sh |
|------|--------|----------------|
| (5,1) | Green leaf cluster — 3 leaves (upper portion of a bush) | 80, 16, 16, 16 |
| (6,1) | Green leaf cluster — 6 leaves, double row | 96, 16, 16, 16 |
| (7,1) | Grey rock pile (medium, angular) | **112, 16, 16, 16** |
| (8,1) | Grey rock pile (large, rounded) | 128, 16, 16, 16 |

### Row 2: Berry clusters, log, flowers, sunflower top (cols 0–8)

| Grid | Object | sx, sy, sw, sh | Notes |
|------|--------|----------------|-------|
| (0,2) | Pink berry cluster (3 berries, no leaves) | 0, 32, 16, 16 | |
| (1,2) | Pink berries + green leaf | 16, 32, 16, 16 | |
| (2,2) | Red apple + leaf | 32, 32, 16, 16 | ⚠️ UI item |
| (3,2) | Brown bell/hive shape | 48, 32, 16, 16 | ⚠️ UI item |
| (4,2) | Brown bell shape variant | 64, 32, 16, 16 | ⚠️ UI item |
| (5,2) | Horizontal log / fallen trunk | 80, 32, 16, 16 | |
| (6,2) | Yellow flower + green leaves | 96, 32, 16, 16 | |
| (7,2) | Yellow flower + leaves (larger) | 112, 32, 16, 16 | |
| (8,2) | Sunflower head — top half only | 128, 32, 16, 16 | Use as 16×32 with row 3 |

### Row 3: Bushes, flower buds, flower clusters, sunflower stem (cols 0–8)

| Grid | Object | sx, sy, sw, sh | Notes |
|------|--------|----------------|-------|
| (0,3) | Dark green round bush with pink flower dots | **0, 48, 16, 16** | ✓ Grass-safe |
| (1,3) | Dark green round bush (plain, no flowers) | **16, 48, 16, 16** | ✓ Grass-safe |
| (2,3) | Tiny pink/brown flower bud | 32, 48, 16, 16 | |
| (3,3) | Small flower bud with green leaves | 48, 48, 16, 16 | |
| (4,3) | Pink flower cluster (3 flowers grouped) | **64, 48, 16, 16** | ✓ Grass-safe |
| (5,3) | Blue chest icon + green leaves | 80, 48, 16, 16 | ⚠️ UI item |
| (6,3) | Pink/rose flower cluster (3 flowers + leaves) | 96, 48, 16, 16 | |
| (7,3) | Pink/rose flower cluster (larger, more detailed) | 112, 48, 16, 16 | |
| (8,3) | Sunflower stem — bottom half only | 128, 48, 16, 16 | Use as 16×32 with row 2 |

### Full sunflower (16×32 spanning rows 2–3, col 8)

To render the complete sunflower (head + stem + leaves), use: **sx=128, sy=32, sw=16, sh=32**

### Row 4: Lily pads, rocks (cols 0–8)

| Grid | Object | sx, sy, sw, sh | Notes |
|------|--------|----------------|-------|
| (0,4) | Green oval — lily pad left half | 0, 64, 16, 16 | ⚠️ Aquatic |
| (1,4) | Green oval + brown end — lily pad/log fragment | 16, 64, 16, 16 | ⚠️ Aquatic/incomplete |
| (2,4) | Large round green leaf — lily pad | 32, 64, 16, 16 | ⚠️ Aquatic |
| (3,4) | Green oval + brown cap — log fragment | 48, 64, 16, 16 | ⚠️ Aquatic/incomplete |
| (4,4) | Brown stump base (thin trunk bottom only) | 64, 64, 16, 16 | Poor standalone visual |
| (5,4) | Grey rock pile (medium, 2 stacked stones) | **80, 64, 16, 16** | ✓ Grass-safe |
| (6,4) | Grey rock (angular, stepped) | **96, 64, 16, 16** | ✓ Grass-safe |
| (7,4) | Green lily pad with notch | 112, 64, 16, 16 | ⚠️ Aquatic |
| (8,4) | Lily pad + lily flower | 128, 64, 16, 16 | ⚠️ Aquatic |

---

## 5. Basic Plants.png

**Dimensions**: 96x32px — 6 cols x 2 rows of 16x16

Farm/garden plants across growth stages. Each column is a plant type; each row is a growth stage.

| Grid (col, row) | Description                            |
|----------------|----------------------------------------|
| (0, 0)         | Seed / just planted — bare soil marker |
| (1, 0)         | Sprout stage 1 — tiny green shoot      |
| (2, 0)         | Sprout stage 2 — small plant           |
| (3, 0)         | Grown plant with leaves                |
| (4, 0)         | Flowering plant (small flower bud)     |
| (5, 0)         | Sunflower / tall flower (yellow)       |
| (0, 1)         | Another seed type                      |
| (1, 1)         | Purple berry bush — sprout             |
| (2, 1)         | Purple berry bush — growing            |
| (3, 1)         | Purple berry bush — grown              |
| (4, 1)         | Purple berry bush — ripe (berries visible) |
| (5, 1)         | Decorative plant variant               |

---

## 6. Chest.png

**Dimensions**: 240x96px

Visually rendered as 48x48 sprites (3x3 tiles each): 5 cols x 2 rows at 48x48.

| Position (48x48 grid) | Description                          |
|----------------------|--------------------------------------|
| Row 0, Col 0         | Wooden chest — closed                |
| Row 0, Col 1         | Wooden chest — open                  |
| Row 0, Col 2         | Chest with decorative clasp — closed |
| Row 0, Col 3         | Purple/gem-studded chest — closed    |
| Row 0, Col 4         | Ornate chest — closed                |
| Row 1, Col 0         | Barrel / crate variant — sealed      |
| Row 1, Col 1         | Barrel — open                        |
| Row 1, Col 2         | Coin stack                           |
| Row 1, Col 3         | Small bag / pouch                    |
| Row 1, Col 4         | Boot (classic RPG joke loot)         |

In 16x16 terms: 15 cols x 6 rows. Use pixel offsets `(col * 48, row * 48)` with 48x48 frame size.

---

## 7. Paths.png

**Dimensions**: 64x64px — 4 cols x 4 rows of 16x16

Diagonal path/walkway tiles for outdoor ground decoration. Tiles appear as thin brown diagonal marks (scattered dirt/pebbles) rather than solid fills — they are decorative ground overlays.

| Grid (col, row) | Description                                |
|----------------|--------------------------------------------|
| (0, 0)         | Path center (diagonal hatch pattern, brown/tan) |
| (1, 0)         | Path — top-left branch                     |
| (2, 0)         | Path — top-right branch                    |
| (3, 0)         | Path — isolated segment                    |
| (0, 1)         | Diagonal path going bottom-right           |
| (1, 1)         | Path junction                              |
| (2, 1)         | Path segment variant                       |
| (3, 1)         | Corner turn                                |
| (0–3, 2–3)    | Additional path segments with same diagonal mark pattern |

---

## 8. Basic Furniture.png

**Dimensions**: 144x96px — 9 cols x 6 rows of 16x16 (3 cols x 2 rows at 48x48)

Furniture for house interiors. Objects are 48x48 (3x3 tiles) each.

| Position (48x48 grid) | Description                                |
|----------------------|--------------------------------------------|
| Row 0, Col 0         | Wooden bookshelf / cabinet (brown, tall)   |
| Row 0, Col 1         | Wooden table with tablecloth (pink)        |
| Row 0, Col 2         | Small decorative pot / vase (with flower)  |
| Row 1, Col 0         | Large wooden dresser / chest of drawers    |
| Row 1, Col 1         | Wooden chair / stool                       |
| Row 1, Col 2         | Bed (light blue blanket, wooden frame)     |

Additional smaller items in remaining cells include window frame and door frame variants.

Use pixel offsets `(col * 48, row * 48)` with 48x48 frame size.

---

## 9. Wooden House.png

**Dimensions**: 112x80px — 7 cols x 5 rows of 16x16

This is **not a pre-made house sprite**. It is a **component tileset** for assembling wooden building exteriors. All pieces must be composed manually.

### Left Section (cols 0–1, all rows) — Front Wall with Window

| Grid (col, row) | Description                              |
|----------------|------------------------------------------|
| (0,0)–(1,0)    | Top of front wall — wooden plank with upper trim |
| (0,1)–(1,1)    | Window — light blue/white pane, brown frame |
| (0,2)–(1,2)    | Mid wall — plain wooden planks           |
| (0,3)–(1,3)    | Lower wall / base trim                   |
| (0,4)–(1,4)    | Ground level / foundation bottom         |

### Middle Section (cols 2–3, all rows) — Door and Side Wall

| Grid (col, row) | Description                              |
|----------------|------------------------------------------|
| (2,0)–(3,0)    | Top trim / upper wall side               |
| (2,1)–(3,1)    | Wall side — no window                    |
| (2,2)–(3,2)    | Door opening — top                       |
| (2,3)–(3,3)    | Door opening — bottom (brown door with handle) |
| (2,4)–(3,4)    | Threshold / step                         |

### Right Section (cols 4–6, all rows) — Log/Plank Wall Texture

Repeatable horizontal log/plank texture (3 wide x 5 tall). Safe to tile horizontally and vertically for longer or taller walls.

| Grid (col, row) | Description         |
|----------------|---------------------|
| (4,0)–(6,0)    | Top log row         |
| (4,1)–(6,1)    | Log row — repeatable middle |
| (4,2)–(6,2)    | Log row             |
| (4,3)–(6,3)    | Log row             |
| (4,4)–(6,4)    | Bottom log row      |

### Assembly Order

1. Tile right-section log tiles (repeated) for side and back walls.
2. Place left-section tiles on front face (includes window).
3. Place middle-section tiles for the door section.
4. Cap with roof tiles from `Wooden_House_Roof_Tilset.png`.

---

## 10. Wooden_House_Walls_Tilset.png

**Dimensions**: 80x48px — 5 cols x 3 rows of 16x16

Interior wall tiles for the inside surfaces of house walls as seen from a top-down view. Warm brown tone with subtle wood grain.

| Grid (col, row) | Description                                    |
|----------------|------------------------------------------------|
| (0,0)–(3,0)    | Top row — dark wooden planks (interior wall top), 4 variants |
| (4, 0)         | Top-row corner piece                           |
| (0,1)–(3,1)    | Middle row — lighter wood plank interior wall tiles |
| (4, 1)         | Mid corner piece                               |
| (0,2)–(3,2)    | Bottom row — floor/baseboard transition tiles  |
| (4, 2)         | Bottom corner piece                            |

---

## 11. Wooden_House_Roof_Tilset.png

**Dimensions**: 112x80px — 7 cols x 5 rows of 16x16

Roof tiles for the top of wooden houses viewed from overhead. Dark brown diagonal scale/shingle pattern.

### Left Section (cols 0–3, rows 0–4) — Main Roof Bitmask

| Grid (col, row) | Description                        |
|----------------|------------------------------------|
| (0, 0)         | Roof — top-left corner             |
| (1, 0)         | Roof — top edge (repeatable)       |
| (2, 0)         | Roof — top edge variant            |
| (3, 0)         | Roof — top-right corner            |
| (0, 1)         | Roof — left edge                   |
| (1, 1)         | Roof — inner tile (main repeatable shingle) |
| (2, 1)         | Roof — inner variant               |
| (3, 1)         | Roof — right edge                  |
| (0,2)–(3,4)    | Additional edge and corner combinations for full bitmask coverage |

### Middle Section (col 4, rows 0–4) — Roof Ridge/Peak

Tiles for the center peak of the roof (the ridge running along the top).

### Right Section (cols 5–6, rows 0–4) — Gable End Variants

Additional roof edge variants for gable ends of the building.

---

## 12. Fences.png

Small image — approximately 3 cols x 2 rows of 16x16 (fence segments ~16x16 or 32x16).

| Row | Description                                                  |
|-----|--------------------------------------------------------------|
| Row 0 | Fence with left post, middle fence segment, fence with right post |
| Row 1 | Fence segment variants — corner, T-junction, etc.           |

Appearance: brown wooden horizontal rails with vertical posts.

---

## 13. Tilled_Dirt.png

Bitmask autotile set for tilled farm soil (light beige/tan). Same structure as `Grass.png`.

| Section        | Content                                                      |
|----------------|--------------------------------------------------------------|
| Edge/corner tiles | All cardinal bitmask variants — same layout as Grass.png Group A and C |
| Interior tile  | Solid tilled soil (no exposed edges)                         |
| Transition tiles | Edges where tilled dirt meets regular ground               |
| Single-tile variants | Isolated tilled soil patches                          |

---

## 14. Doors.png

**Dimensions**: 16x32px — 1 col x 2 rows of 16x16

A single closed wooden door, split into top and bottom halves for top-down placement.

| Grid (col, row) | Description                                   |
|----------------|-----------------------------------------------|
| (0, 0)         | Top half — header/top frame, brown wood grain |
| (0, 1)         | Bottom half — lower door panel, same brown    |

Used as an overlay on house wall tiles. Assemble both tiles vertically for the complete door.

---

## 15. Basic Charakter Spritesheet.png

**Dimensions**: 192x192px — 4 cols x 4 rows of 48x48

Main playable character — a cute white cat/rabbit with purple markings. Each cell is 48x48 px.

| Row | Direction            | Frame 0       | Frame 1      | Frame 2       | Frame 3       |
|-----|----------------------|---------------|--------------|---------------|---------------|
| 0   | Walk Down (facing camera) | Stand    | Left step    | Stand         | Right step    |
| 1   | Walk Up (facing away)     | Stand    | Left step    | Stand         | Right step    |
| 2   | Walk Left                 | Stand    | Step         | Stand         | Step          |
| 3   | Walk Right                | Stand    | Step         | Stand         | Step          |

Pixel offset formula: `x = col * 48`, `y = row * 48`, frame size = 48x48.

### Animation Recommendations

| State          | Row | Frames    | Speed (normalized) |
|----------------|-----|-----------|-------------------|
| Idle           | 0   | 0 and 2   | 0.05–0.08 (slow bob) |
| Walk down      | 0   | 0–3       | 0.15              |
| Walk up        | 1   | 0–3       | 0.15              |
| Walk left      | 2   | 0–3       | 0.15              |
| Walk right     | 3   | 0–3       | 0.15              |
| Happy/excited  | 3   | 0–3       | 0.15–0.20         |
| Visitor sprite | 2   | 0–3       | 0.15              |

---

## 16. Basic Charakter Actions.png

**Dimensions**: 96x576px — 2 cols x 12 rows of 48x48 (24 total action frames)

Extended action animations for the character. Each animation occupies 2 rows (4 frames per row = 8 frames per animation).

| Rows  | Animation             |
|-------|-----------------------|
| 0–1   | Sleeping / lying down |
| 2–3   | Digging / hoeing action |
| 4–5   | Watering action       |
| 6–7   | Fishing — cast        |
| 8–9   | Fishing — idle        |
| 10–11 | Surprised / jump      |

Pixel offset formula: `x = col * 48`, `y = row * 48`, frame size = 48x48.

---

## Summary: Asset Usage for the Island Scene

| Scene Element          | Asset File                       | Tile / Region                    |
|------------------------|----------------------------------|----------------------------------|
| Water background       | Water.png                        | (0,0) or (1,0) — animate all 4  |
| Grass island interior  | Grass.png                        | (1,1) — inner solid tile         |
| Grass island top edge  | Grass.png                        | (1,0)                            |
| Grass island bottom edge | Grass.png                      | (1,2)                            |
| Grass island left edge | Grass.png                        | (0,1)                            |
| Grass island right edge | Grass.png                       | (2,1)                            |
| Grass island top-left corner | Grass.png                 | (0,0)                            |
| Grass island top-right corner | Grass.png                | (2,0)                            |
| Grass island bottom-left corner | Grass.png              | (0,2)                            |
| Grass island bottom-right corner | Grass.png             | (2,2)                            |
| Large green tree       | Basic Grass Biom things 1.png    | (1,0)–(2,1) = sx=16,sy=0,32×32   |
| Cherry blossom tree    | Basic Grass Biom things 1.png    | (3,0)–(4,1) = sx=48,sy=0,32×32   |
| Dark bush w/ flowers   | Basic Grass Biom things 1.png    | (0,3) = sx=0,sy=48,16×16         |
| Sunflower              | Basic Grass Biom things 1.png    | (8,2)+(8,3) = sx=128,sy=32,16×32 |
| Pink flower cluster    | Basic Grass Biom things 1.png    | (4,3) = sx=64,sy=48,16×16        |
| Grey rock pile         | Basic Grass Biom things 1.png    | (7,1) = sx=112,sy=16,16×16       |
| Path tiles             | Paths.png                        | (0,0) or other segment variants  |
| Chest                  | Chest.png                        | Row 0, Col 0 = 48x48 sprite      |
| Pet character (idle)   | Basic Charakter Spritesheet.png  | Row 0, frames 0+2                |
| Pet character (walk)   | Basic Charakter Spritesheet.png  | Row 0–3, all 4 frames            |
| Visitor character      | Basic Charakter Spritesheet.png  | Row 2, all 4 frames              |
