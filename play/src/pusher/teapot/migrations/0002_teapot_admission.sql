CREATE TABLE teapot_oauth_states (
    state_hash text PRIMARY KEY CHECK (length(state_hash) = 64),
    provider text NOT NULL CHECK (provider = 'x'),
    encrypted_code_verifier text NOT NULL,
    redirect_uri text NOT NULL,
    return_to text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
);

CREATE INDEX teapot_oauth_states_expiry_idx ON teapot_oauth_states(expires_at)
    WHERE consumed_at IS NULL;

CREATE TABLE teapot_admission_links (
    id uuid PRIMARY KEY,
    candidate_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL,
    UNIQUE (id, candidate_id),
    CHECK (expires_at > created_at)
);

CREATE INDEX teapot_admission_links_candidate_idx
    ON teapot_admission_links(candidate_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE teapot_endorsement_intents (
    id uuid PRIMARY KEY,
    admission_link_id uuid NOT NULL,
    candidate_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    endorser_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL,
    FOREIGN KEY (admission_link_id, candidate_id)
        REFERENCES teapot_admission_links(id, candidate_id) ON DELETE CASCADE,
    CHECK (candidate_id <> endorser_id),
    CHECK (expires_at > created_at)
);

CREATE INDEX teapot_endorsement_intents_expiry_idx
    ON teapot_endorsement_intents(expires_at)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX teapot_endorsement_intents_candidate_idx
    ON teapot_endorsement_intents(candidate_id, endorser_id);

CREATE UNIQUE INDEX teapot_endorsement_intents_active_endorser_idx
    ON teapot_endorsement_intents(admission_link_id, endorser_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;
