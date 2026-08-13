ALTER TABLE teapot_asset_catalogs
DROP CONSTRAINT teapot_asset_catalogs_kind_check;

ALTER TABLE teapot_asset_catalogs
ADD CONSTRAINT teapot_asset_catalogs_kind_check
CHECK (kind IN ('woka', 'woka-part', 'map-entity', 'tileset', 'reference', 'terrain-surface', 'vegetation'));

ALTER TABLE teapot_assets
DROP CONSTRAINT teapot_assets_kind_check;

ALTER TABLE teapot_assets
ADD CONSTRAINT teapot_assets_kind_check
CHECK (kind IN ('woka', 'woka-part', 'map-entity', 'tileset', 'reference', 'terrain-surface', 'vegetation'));
