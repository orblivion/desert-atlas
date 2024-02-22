#!/bin/bash
set -euo pipefail

cd /opt/app

# Powerbox Proxy

echo "Setting up powerbox-http-proxy"
(cd dependencies/powerbox-http-proxy; go build)

# Instead of installing npm (a lot of packages on Debian!) and building this
# tiny file that almost centairly will never change, I just built it and copied
# it to this repo. All I need to do is confirm that we have not upgraded
# powerbox-http-proxy
git -C dependencies/powerbox-http-proxy rev-parse HEAD | grep 40d655f2b9083cb4874cbc03753bb07060159357 || (
    echo "Error: Powerbox Proxy was updated, doublecheck that index.ts (powerbox-helper.js) is unchanged, and update this hash" && exit 1)

# Not quite submodules
echo "Setting up some js dependencies"
(cd dependencies/jquery; ./setup.sh)
(cd dependencies/leaflet; ./setup.sh)
(cd dependencies/protomaps.js; ./setup.sh)

# Make sure all of the symlinks within `assets/` are pointing to something real
# (I don't know if spk pack would catch this)
find assets -type l ! -exec test -e {} \; -exec false "{}" "+" || (echo "Some symlinked files didn't get created!"; exit 1)

echo "Making sure certain python stuff is in the __pycache__"
# Pre-import to create __pycache__, which doesn't get created when you `spk dev`
# These __pycache__ items are referenced by sandstorm-files.list
python3 -c "import csv_format"
python3 -c "import query"

echo "Building go server"
(cd go; go build .)

echo "Built!"

exit 0
