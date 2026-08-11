ALTER TABLE teapot_mcp_sessions
    ADD COLUMN token_hash text UNIQUE CHECK (token_hash IS NULL OR length(token_hash) = 64);

UPDATE teapot_mcp_sessions SET token_hash = md5(id::text || ':legacy-a') || md5(id::text || ':legacy-b')
WHERE token_hash IS NULL;

ALTER TABLE teapot_mcp_sessions ALTER COLUMN token_hash SET NOT NULL;

CREATE INDEX teapot_mcp_sessions_token_idx
    ON teapot_mcp_sessions(token_hash, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE teapot_mcp_proposals (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES teapot_mcp_sessions(id) ON DELETE CASCADE,
    client_name text NOT NULL,
    tool_name text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    state text NOT NULL CHECK (state IN ('pending', 'approved', 'denied', 'expired', 'stale', 'applied', 'failed')),
    payload jsonb NOT NULL,
    patch_digest text NOT NULL CHECK (length(patch_digest) = 64),
    map_url text,
    expected_revision bigint CHECK (expected_revision IS NULL OR expected_revision >= 0),
    estimated_cost_usd double precision CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    terminal_message text,
    result jsonb,
    CHECK (expires_at > created_at)
);

CREATE INDEX teapot_mcp_proposals_owner_state_idx
    ON teapot_mcp_proposals(owner_id, state, created_at DESC);
CREATE INDEX teapot_mcp_proposals_session_idx
    ON teapot_mcp_proposals(session_id, created_at DESC);
CREATE INDEX teapot_mcp_proposals_expiry_idx
    ON teapot_mcp_proposals(expires_at)
    WHERE state IN ('pending', 'approved');

CREATE TABLE teapot_mcp_approvals (
    id uuid PRIMARY KEY,
    proposal_id uuid NOT NULL UNIQUE REFERENCES teapot_mcp_proposals(id) ON DELETE CASCADE,
    owner_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES teapot_mcp_sessions(id) ON DELETE CASCADE,
    tool_name text NOT NULL,
    patch_digest text NOT NULL CHECK (length(patch_digest) = 64),
    expected_revision bigint CHECK (expected_revision IS NULL OR expected_revision >= 0),
    token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
);

CREATE INDEX teapot_mcp_approvals_active_idx
    ON teapot_mcp_approvals(proposal_id, expires_at)
    WHERE used_at IS NULL;
