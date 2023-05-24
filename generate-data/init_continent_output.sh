#!/bin/bash

set -exuo pipefail

CONTINENT_DIR=$(readlink -f pbf/$CONTINENT)

# Clear the field of anything that may have been erroneously created in a previous run. Want to start the continent over.
rm $OUTPUT_DIR/$CONTINENT-*.tar.gz.*
