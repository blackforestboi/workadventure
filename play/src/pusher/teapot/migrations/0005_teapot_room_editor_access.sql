CREATE TABLE teapot_room_editor_policies (
    map_id text PRIMARY KEY,
    mode text NOT NULL CHECK (mode IN ('everyone', 'specific', 'nobody')),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by uuid REFERENCES teapot_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE teapot_room_editor_grants (
    map_id text NOT NULL REFERENCES teapot_room_editor_policies(map_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES teapot_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (map_id, user_id)
);

CREATE INDEX teapot_room_editor_grants_user_idx ON teapot_room_editor_grants(user_id);
