ALTER TABLE teapot_room_editor_policies RENAME TO teapot_room_access_policies;
ALTER TABLE teapot_room_editor_grants RENAME TO teapot_room_access_grants;

ALTER TABLE teapot_room_access_policies ADD COLUMN role text;
UPDATE teapot_room_access_policies SET role = 'edit';
ALTER TABLE teapot_room_access_policies ALTER COLUMN role SET NOT NULL;
ALTER TABLE teapot_room_access_policies
    ADD CONSTRAINT teapot_room_access_policies_role_check CHECK (role IN ('view', 'edit', 'admin'));

ALTER TABLE teapot_room_access_grants ADD COLUMN role text;
UPDATE teapot_room_access_grants SET role = 'edit';
ALTER TABLE teapot_room_access_grants ALTER COLUMN role SET NOT NULL;
ALTER TABLE teapot_room_access_grants
    ADD CONSTRAINT teapot_room_access_grants_role_check CHECK (role IN ('view', 'edit', 'admin'));

ALTER TABLE teapot_room_access_grants
    DROP CONSTRAINT teapot_room_editor_grants_map_id_fkey;
ALTER TABLE teapot_room_access_policies
    DROP CONSTRAINT teapot_room_editor_policies_pkey;
ALTER TABLE teapot_room_access_policies
    ADD CONSTRAINT teapot_room_access_policies_pkey PRIMARY KEY (map_id, role);

ALTER TABLE teapot_room_access_grants
    DROP CONSTRAINT teapot_room_editor_grants_pkey;
ALTER TABLE teapot_room_access_grants
    ADD CONSTRAINT teapot_room_access_grants_pkey PRIMARY KEY (map_id, role, user_id);
ALTER TABLE teapot_room_access_grants
    ADD CONSTRAINT teapot_room_access_grants_map_id_role_fkey
    FOREIGN KEY (map_id, role) REFERENCES teapot_room_access_policies(map_id, role) ON DELETE CASCADE;

DROP INDEX teapot_room_editor_grants_user_idx;
CREATE INDEX teapot_room_access_grants_user_idx ON teapot_room_access_grants(user_id, map_id, role);

CREATE TABLE teapot_room_visitors (
    map_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES teapot_users(id) ON DELETE CASCADE,
    first_visited_at timestamptz NOT NULL,
    last_visited_at timestamptz NOT NULL,
    visit_count bigint NOT NULL DEFAULT 1 CHECK (visit_count > 0),
    PRIMARY KEY (map_id, user_id)
);

CREATE INDEX teapot_room_visitors_recent_idx ON teapot_room_visitors(map_id, last_visited_at DESC, user_id);
