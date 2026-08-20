CREATE TABLE teapot_map_styles (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    normalized_name text NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 80),
    is_default boolean NOT NULL DEFAULT false,
    is_builtin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (owner_id, normalized_name),
    UNIQUE (id, owner_id),
    CHECK (NOT is_default OR (normalized_name = 'default' AND is_builtin))
);

CREATE UNIQUE INDEX teapot_map_styles_default_owner_idx
    ON teapot_map_styles(owner_id)
    WHERE is_default;

CREATE INDEX teapot_map_styles_owner_order_idx
    ON teapot_map_styles(owner_id, is_default DESC, normalized_name, id);

CREATE TABLE teapot_map_style_entries (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    style_id uuid NOT NULL,
    asset_kind text NOT NULL CHECK (
        asset_kind IN ('woka', 'woka-part', 'map-entity', 'tileset', 'reference', 'terrain-surface', 'vegetation')
    ),
    source_type text NOT NULL CHECK (source_type IN ('teapot-asset', 'built-in')),
    source_asset_id uuid,
    source_namespace text,
    source_key text NOT NULL,
    source_version integer NOT NULL CHECK (source_version > 0),
    canonical_source_key text NOT NULL,
    metadata_version integer NOT NULL CHECK (metadata_version > 0),
    metadata_snapshot jsonb NOT NULL,
    derived_from_asset_id uuid,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (style_id, owner_id) REFERENCES teapot_map_styles(id, owner_id) ON DELETE CASCADE,
    FOREIGN KEY (source_asset_id, owner_id) REFERENCES teapot_assets(id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (derived_from_asset_id, owner_id) REFERENCES teapot_assets(id, owner_id) ON DELETE RESTRICT,
    UNIQUE (style_id, canonical_source_key),
    CHECK (
        (source_type = 'teapot-asset'
            AND source_asset_id IS NOT NULL
            AND source_namespace IS NULL
            AND source_key = source_asset_id::text
            AND derived_from_asset_id = source_asset_id)
        OR
        (source_type = 'built-in'
            AND source_asset_id IS NULL
            AND source_namespace IS NOT NULL
            AND length(source_namespace) BETWEEN 1 AND 64
            AND derived_from_asset_id IS NULL)
    )
);

CREATE INDEX teapot_map_style_entries_style_kind_idx
    ON teapot_map_style_entries(style_id, asset_kind, created_at, id);

CREATE INDEX teapot_map_style_entries_source_asset_idx
    ON teapot_map_style_entries(source_asset_id)
    WHERE source_asset_id IS NOT NULL;

CREATE TABLE teapot_map_style_idempotency (
    owner_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    operation text NOT NULL CHECK (operation IN ('create-style', 'copy-entry')),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
    request_fingerprint text NOT NULL CHECK (length(request_fingerprint) BETWEEN 1 AND 512),
    result_style_id uuid,
    result_entry_id uuid,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (owner_id, operation, idempotency_key),
    FOREIGN KEY (result_style_id, owner_id) REFERENCES teapot_map_styles(id, owner_id) ON DELETE CASCADE,
    FOREIGN KEY (result_entry_id) REFERENCES teapot_map_style_entries(id) ON DELETE CASCADE,
    CHECK (
        (operation = 'create-style' AND result_style_id IS NOT NULL AND result_entry_id IS NULL)
        OR (operation = 'copy-entry' AND result_style_id IS NULL AND result_entry_id IS NOT NULL)
    )
);

-- Expand/backfill only: legacy readers remain valid because source asset rows are untouched.
INSERT INTO teapot_map_styles (
    id, owner_id, name, normalized_name, is_default, is_builtin, created_at, updated_at
)
SELECT
    md5(owner_id::text || ':teapot-map-style:default')::uuid,
    owner_id,
    'Default',
    'default',
    true,
    true,
    MIN(created_at),
    MIN(created_at)
FROM teapot_assets
GROUP BY owner_id
ON CONFLICT (owner_id, normalized_name) DO NOTHING;

INSERT INTO teapot_map_style_entries (
    id,
    owner_id,
    style_id,
    asset_kind,
    source_type,
    source_asset_id,
    source_namespace,
    source_key,
    source_version,
    canonical_source_key,
    metadata_version,
    metadata_snapshot,
    derived_from_asset_id,
    created_at,
    updated_at
)
SELECT
    md5(asset.id::text || ':teapot-map-style-entry:default')::uuid,
    asset.owner_id,
    style.id,
    asset.kind,
    'teapot-asset',
    asset.id,
    NULL,
    asset.id::text,
    1,
    'teapot-asset:' || asset.id::text || ':v1',
    1,
    asset.metadata,
    asset.id,
    asset.created_at,
    asset.created_at
FROM teapot_assets asset
JOIN teapot_map_styles style
    ON style.owner_id = asset.owner_id AND style.is_default
ON CONFLICT (style_id, canonical_source_key) DO NOTHING;
