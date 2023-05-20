#!/bin/bash

set -exuo pipefail

CONTINENT_DIR=$(readlink -f pbf/$CONTINENT)

# Save some space
rm -r $CONTINENT_DIR
