#!/bin/bash
# Render every hero shot in order, one at a time. Safe to re-run: finished frames are skipped.
cd "$(dirname "$0")/.."
H=episodes/south-korea/build/hero
run() { mkdir -p "$H/$1"; echo "=== $1 $(date +%T)"; blender -b -P "blender/$2" -- anim "$PWD/$H/$1/f_" 144 24 $3 > "$H/$1.log" 2>&1; echo "=== $1 done $(date +%T) ($(ls "$H/$1" | wc -l) frames)"; }
run k2 k2_tank.py 2          # volumetric dust: rendered on twos
run reactor reactor.py
run crane container_crane.py
run carrier car_carrier.py
run battery ev_battery.py
run apartments seoul_apartments.py
run hbm hbm_package.py
echo "=== queue finished $(date +%T)"
