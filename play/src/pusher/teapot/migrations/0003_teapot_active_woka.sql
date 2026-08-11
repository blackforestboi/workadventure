CREATE UNIQUE INDEX teapot_assets_id_owner_idx ON teapot_assets(id, owner_id);

CREATE TABLE teapot_active_woka_selections (
    owner_id uuid PRIMARY KEY REFERENCES teapot_users(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (asset_id, owner_id) REFERENCES teapot_assets(id, owner_id) ON DELETE RESTRICT
);

CREATE INDEX teapot_active_woka_asset_idx ON teapot_active_woka_selections(asset_id);
