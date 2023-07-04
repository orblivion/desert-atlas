#!/bin/bash

set -exuo pipefail

# Clear the field of anything that may have been erroneously created in a previous run. Want to start the super region over.
ls $OUTPUT_DIR/$SUPER_REGION-*.tar.gz.* > /dev/null && rm $OUTPUT_DIR/$SUPER_REGION-*.tar.gz.* || echo ""
