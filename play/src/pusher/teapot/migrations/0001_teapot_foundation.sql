CREATE TABLE teapot_users (
    id uuid PRIMARY KEY,
    display_name text,
    admission_state text NOT NULL DEFAULT 'pending'
        CHECK (admission_state IN ('pending', 'admitted', 'suspended')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE teapot_provider_links (
    user_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (provider, provider_subject),
    UNIQUE (user_id, provider)
);

CREATE TABLE teapot_user_roles (
    user_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('member', 'creator', 'moderator', 'operator')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, role)
);

CREATE TABLE teapot_capability_grants (
    user_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    capability text NOT NULL CHECK (
        capability IN (
            'world.enter',
            'asset.create',
            'asset.manage-own',
            'asset.manage-any',
            'map.edit',
            'map.publish',
            'map.manage-any',
            'mcp.connect',
            'mcp.approve',
            'endorsement.create',
            'identity.manage'
        )
    ),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, capability)
);

CREATE TABLE teapot_asset_catalogs (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE RESTRICT,
    kind text NOT NULL CHECK (kind IN ('woka', 'woka-part', 'map-entity', 'tileset', 'reference')),
    name text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX teapot_asset_catalogs_owner_idx ON teapot_asset_catalogs(owner_id, kind);

CREATE TABLE teapot_assets (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE RESTRICT,
    object_reference text NOT NULL UNIQUE,
    kind text NOT NULL CHECK (kind IN ('woka', 'woka-part', 'map-entity', 'tileset', 'reference')),
    media_type text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    published boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX teapot_assets_owner_idx ON teapot_assets(owner_id, kind) WHERE deleted_at IS NULL;

CREATE TABLE teapot_catalog_assets (
    catalog_id uuid NOT NULL REFERENCES teapot_asset_catalogs(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL REFERENCES teapot_assets(id) ON DELETE RESTRICT,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (catalog_id, asset_id)
);

CREATE TABLE teapot_map_revisions (
    map_id text PRIMARY KEY,
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    last_object_reference text,
    updated_by uuid REFERENCES teapot_users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE teapot_map_writer_leases (
    map_id text PRIMARY KEY REFERENCES teapot_map_revisions(map_id) ON DELETE CASCADE,
    lease_token uuid NOT NULL UNIQUE,
    writer_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    expected_revision bigint NOT NULL CHECK (expected_revision >= 0),
    source text NOT NULL CHECK (source IN ('wam', 'tmj', 'mcp')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE INDEX teapot_map_writer_leases_expiry_idx ON teapot_map_writer_leases(expires_at);

CREATE TABLE teapot_mcp_sessions (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    client_name text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL
);

CREATE INDEX teapot_mcp_sessions_owner_idx ON teapot_mcp_sessions(owner_id, expires_at);

CREATE TABLE teapot_endorsements (
    id uuid PRIMARY KEY,
    candidate_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    endorser_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'revoked')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (candidate_id, endorser_id),
    CHECK (candidate_id <> endorser_id)
);

CREATE INDEX teapot_endorsements_candidate_idx ON teapot_endorsements(candidate_id, state);

CREATE TABLE teapot_audit_events (
    id uuid PRIMARY KEY,
    actor_id uuid REFERENCES teapot_users(id) ON DELETE SET NULL,
    action text NOT NULL,
    object_type text NOT NULL,
    object_id text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL
);

CREATE INDEX teapot_audit_events_object_idx ON teapot_audit_events(object_type, object_id, created_at);
CREATE INDEX teapot_audit_events_actor_idx ON teapot_audit_events(actor_id, created_at);
