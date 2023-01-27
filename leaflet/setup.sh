#!/bin/bash

set -euf -o pipefail

wget https://unpkg.com/leaflet@1.9.3/dist/leaflet.js -O /tmp/leaflet.js
sha256sum /tmp/leaflet.js | grep 5819285cec137b229c94e1ee5ad73e8b6b84345a4367d60f75fe477fe0fb7b03 || (echo "sha256sum did not match"; exit 1)
mv /tmp/leaflet.js leaflet.js

wget https://unpkg.com/leaflet@1.9.3/dist/leaflet.css -O /tmp/leaflet.css
sha256sum /tmp/leaflet.css | grep 90b693d86392a4779c861b28cf307e7e59c3fb35328c4d8b95f58f814d38c722 || (echo "sha256sum did not match"; exit 1)
mv /tmp/leaflet.css leaflet.css
