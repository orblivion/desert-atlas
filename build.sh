#!/bin/bash

set -euo pipefail

# Submodules
git submodule init
git submodule update

(cd powerbox-http-proxy; go build && npm install && npm run build)

# Not quite submodules
(cd jquery; ./setup.sh)
(cd leaflet; ./setup.sh)
(cd protomaps.js; ./setup.sh)

# Make sure all of the symlinks within `assets/` are pointing to something real
# (I don't know if spk pack would catch this)
find assets -type l ! -exec test -e {} \; -exec false "{}" "+" || (echo "Some symlinked files didn't get created!"; exit 1)

# Pre-import to create __pycache__, which doesn't get created when you `spk dev`
# These __pycache__ items are referenced by sandstorm-files.list
python3 -c "import csv_format"
python3 -c "import query"
