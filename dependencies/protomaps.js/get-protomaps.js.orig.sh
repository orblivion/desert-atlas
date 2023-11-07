#!/bin/bash

set -euf -o pipefail

wget https://unpkg.com/protomaps@1.23.0/dist/protomaps.js -O /tmp/protomaps.js
sha256sum /tmp/protomaps.js | grep 34c1522a16d8df029938a5494147d4fdd6cf050553e6f5b8b145e3e2bc0cd364 || (echo "sha256sum did not match"; exit 1)
mv /tmp/protomaps.js protomaps.js.orig
