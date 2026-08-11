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
fi

exec npm run start
