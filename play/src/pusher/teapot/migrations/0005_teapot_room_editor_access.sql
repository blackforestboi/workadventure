CREATE TABLE teapot_room_access_policies (
    map_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('view', 'edit', 'admin')),
    mode TEXT NOT NULL CHECK (mode IN ('everyone', 'specific', 'nobody')),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by UUID REFERENCES teapot_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (map_id, role)
);

CREATE TABLE teapot_room_access_grants (
    map_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('view', 'edit', 'admin')),
    user_id UUID NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES teapot_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (map_id, role, user_id),
    FOREIGN KEY (map_id, role) REFERENCES teapot_room_access_policies(map_id, role) ON DELETE CASCADE
);

CREATE INDEX teapot_room_access_grants_user_idx ON teapot_room_access_grants(user_id, map_id, role);

CREATE TABLE teapot_room_visitors (
    map_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    first_visited_at TIMESTAMPTZ NOT NULL,
    last_visited_at TIMESTAMPTZ NOT NULL,
    visit_count BIGINT NOT NULL DEFAULT 1 CHECK (visit_count > 0),
    PRIMARY KEY (map_id, user_id)
);

CREATE INDEX teapot_room_visitors_recent_idx ON teapot_room_visitors(map_id, last_visited_at DESC, user_id);
