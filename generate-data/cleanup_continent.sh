#!/bin/bash

set -exuo pipefail

CONTINENT_DIR=$(readlink -f pbf/$CONTINENT)

# NOTE - This needs to match with the same path in build_all.py
CONTINENT_DONE_PATH=$OUTPUT_DIR/$CONTINENT.done

# Save some space
rm -r $CONTINENT_DIR

touch $OUTPUT_DIR/$CONTINENT.done
