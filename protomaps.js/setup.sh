#!/bin/bash

set -euf -o pipefail

./get-protomaps.js.orig.sh
./apply-patch.sh
