# Craftpix Summer RPG collection

This built-in editor collection is derived from the Craftpix **2D RPG Summer Tileset** supplied for this project.

- 7 buildings, including cottages, a village hall, a watchtower, a workshop, and a well
- 16 village props and decorations
- 10 grass, shrub, plant, berry, and mushroom objects
- 7 rocks and stone clusters
- 15 trees, dead trees, and stumps
- 21 native-size meadow, cliff, stair, cobblestone, and river terrain fragments
- 2 complete 13-piece path families

The original PNG artwork is preserved for placeable objects. Terrain fragments are packed on a 32-pixel grid in `assets/terrain/craftpix-summer-terrain.png`; 64-pixel road pieces are resampled to the editor's 32-pixel terrain grid.

## Default-size classifications

Every prefab carries one `size-*` tag and an aspect-ratio-aware initial width and height:

- `size-building` (6): cottages, the village hall, the watchtower, the workshop, and the tall house fit within a 3-by-3-tile frame.
- `size-canopy-tree` (12): living and dead full trees are two tiles tall.
- `size-medium` (11): the well, taller village props, the fence, and the two largest rocks stay at or below two tiles tall.
- `size-compact` (10): hand-sized props and smaller rocks stay around one tile or less.
- `size-ground-detail` (3): puddles are shallow, wide surface details.
- `size-low-vegetation` (13): grass, plants, shrubs, mushrooms, and stumps stay around one tile or less. Stumps use the `other` vegetation category so tree-canopy sizing is not applied to them.

Collision grids for buildings, rocks, signposts, doghouses, lanterns, and stumps are sized to their new initial footprint. The collection-level display-size contract applies these dimensions to the rendered image as well as the placement frame and migrates instances previously saved at the source image's natural size. Individually resized instances keep their authored dimensions.

The artwork remains subject to the license distributed with the original Craftpix download. Do not redistribute the source pack independently of the application.
