ALTER TABLE teapot_room_access_policies
    DROP CONSTRAINT IF EXISTS teapot_room_access_policies_role_check;
ALTER TABLE teapot_room_access_policies
    ADD CONSTRAINT teapot_room_access_policies_role_check
    CHECK (role IN ('view', 'edit', 'admin', 'directory'));

ALTER TABLE teapot_room_access_grants
    DROP CONSTRAINT IF EXISTS teapot_room_access_grants_role_check;
ALTER TABLE teapot_room_access_grants
    ADD CONSTRAINT teapot_room_access_grants_role_check
    CHECK (role IN ('view', 'edit', 'admin', 'directory'));
