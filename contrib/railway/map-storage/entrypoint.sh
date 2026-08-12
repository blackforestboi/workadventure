#!/bin/sh
set -eu

# Railway volumes start empty. Seed the default room exactly once so a fresh
# tpot-world deployment can serve START_ROOM_URL immediately, while preserving
# all maps users upload later.
seed_marker="/maps/.tpot-starter-map-seeded"

if [ ! -e "$seed_marker" ]; then
    mkdir -p /maps/maps /maps/assets

    if [ ! -f /maps/maps/areas.wam ]; then
        cp /usr/src/map-storage/tests/assets/maps/areas.wam /maps/maps/areas.wam
        cp /usr/src/map-storage/tests/assets/maps/areas.tmj /maps/maps/areas.tmj
        cp -R /usr/src/map-storage/tests/assets/assets/. /maps/assets/
    fi

    touch "$seed_marker"
    chown -R node:node /maps
fi

# The original starter fixture is shared with local development and therefore
# references play.workadventure.localhost for its built-in collections. Rewrite
# only those known legacy URLs on the persisted starter map so existing maps and
# user-provided collection URLs remain untouched.
if [ -n "${PUSHER_URL:-}" ] && [ -f /maps/maps/areas.wam ]; then
    node <<'NODE'
const fs = require("fs");
const file = "/maps/maps/areas.wam";
const legacyBase = "http://play.workadventure.localhost";
const publicBase = process.env.PUSHER_URL.replace(/\/+$/, "");
const wam = JSON.parse(fs.readFileSync(file, "utf8"));
let changed = false;

for (const collection of wam.entityCollections ?? []) {
    if (typeof collection.url === "string" && collection.url.startsWith(`${legacyBase}/collections/`)) {
        collection.url = `${publicBase}${collection.url.slice(legacyBase.length)}`;
        changed = true;
    }
}

if (changed) fs.writeFileSync(file, JSON.stringify(wam));
NODE
fi

# The map editor always loads its custom-entity collection, including before
# the first uploaded asset. Seed the empty catalog once for existing volumes so
# that request returns a valid collection rather than a 404.
entity_collection_file="/maps/assets/entities/entities.json"
if [ ! -f "$entity_collection_file" ]; then
    mkdir -p "$(dirname "$entity_collection_file")"
    printf '%s' '{"version":"1.0","collection":[],"collectionName":"custom entities","tags":[]}' > "$entity_collection_file"
    chown node:node "$entity_collection_file"
fi

# Railway mounts a new persistent volume as root-owned. The bootstrap needs
# that privilege, but the map-storage server must still run unprivileged.
exec su -s /bin/sh node -c 'npm run start'
