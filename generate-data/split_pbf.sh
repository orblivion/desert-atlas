#!/bin/bash

# Used for splitting the planet into super regions, splitting each super region
# into regions, and splitting some regions into sub-regions

set -exuo pipefail

# Delete anything that might be here from a previous attempt
ls $PBF_OUTPUT_DIR && rm -r $PBF_OUTPUT_DIR || echo ''

cd splitter

# mapid=0 just sets the file names to start with 0
# max-nodes sets the region size. We are making relatively few big regions, rather than the default of many small regions
#  * It makes the splitter not crash (OOM, I think)
#    * When splitting the planet, they need to be much bigger than our ideal size of a region. That's the only reason we have "super regions". When splitting super regions into regions, memory isn't such an issue.
#  * It *seems* to run faster in the browser for the Sandstorm app
java -Xmx${MAX_MEMORY}m -jar splitter.jar --max-nodes=$MAX_NODES --mapid=0 --output-dir=$PBF_OUTPUT_DIR $PBF_INPUT_FILE
