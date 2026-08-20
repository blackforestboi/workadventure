# Map style packs

Map style packs let creators keep matching terrain and object assets together while preserving the existing Terrain and Objects workflows.

## Browse and create styles

Both asset libraries show the same **Style** selector. **Default style** contains the creator's existing custom assets, while **Built-in** shows the bundled catalog. Selecting a custom style filters both libraries to the assets copied into that style.

Choose **New style** from the selector to create a named pack. Style names are trimmed, limited to 80 characters, and unique for the current creator regardless of letter case.

## Copy an asset into a style

Open an asset card's three-dot menu and choose **Copy for style**. The target list shows every writable style and disables targets that already contain the asset. A successful copy keeps the current library open and makes the copied asset searchable by its original name, tags, keywords, and category.

Object copies retain their complete prefab metadata, including dimensions, collision, animation, placement, wall, and vegetation settings. Terrain copies retain the catalog or saved-asset identity needed to select and paint with the asset. Copying creates another logical style entry; it does not duplicate the underlying image bytes.

## Guide image generation

Every attached image is classified as either **Object reference** or **Style / mood guide**. New images start as Object references and can be changed individually or as a batch. The Description field has the matching **Object** and **Style / mood** switch.

Object guidance describes subject identity, content, silhouette, or geometry. Style / mood guidance describes palette, texture, rendering language, atmosphere, or mood. These roles travel with the generation request through retries and provider adapters; providers receive separate, clearly delimited instructions for the two roles.

## Persistence and privacy

Signed-in creators synchronize style names and supported asset memberships through the authenticated Teapot authoring API. Anonymous styles remain isolated in browser storage and are not merged automatically into a later account. Reference images used for generation remain ephemeral and are not added to a style unless the creator explicitly saves or copies the resulting asset.

Built-in identifiers are treated as opaque allowlisted catalog keys. The server never resolves a client-provided style source as a URL or filesystem path, and copy operations do not reveal whether another creator's source or destination exists.
