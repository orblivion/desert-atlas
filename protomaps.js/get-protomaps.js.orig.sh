#!/bin/bash

set -euf -o pipefail

wget https://unpkg.com/protomaps@0.3.5/dist/protomaps.js -O /tmp/protomaps.js
sha256sum /tmp/protomaps.js | grep 844230d1b0269a1a9fd10ff36d786d198a7b89a70fe21811281c091c1a64efc3 || (echo "sha256sum did not match"; exit 1)
mv /tmp/protomaps.js protomaps.js.orig
