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
#
###############################################################################
#
# NOTE: Right now we split the world into "super_regions" and split each
# super_region into regions. The only reason is that we run out of memory if we
# have too many resulting regions in a single split. However, I since noticed
# the --max-areas option. See here: https://www.mkgmap.org.uk/doc/splitter.html
#
# "Higher numbers mean fewer passes over the source file and hence quicker
# overall processing, but also require more memory. If you find you are running
# out of memory but don't want to increase your --max-nodes value, try reducing
# this instead."
#
# I actually think we should probably *not* bother with this because we
# eventually want to move off of rectangles and on to administrative regions.
# However if rectangles stick around for a long time and super_regions are
# annoying to deal with, it may be worth considering removing them and use a
# low --max-areas instead
#
###############################################################################

java -Xmx${MAX_MEMORY}m -jar splitter.jar --max-nodes=$MAX_NODES --mapid=0 --output-dir=$PBF_OUTPUT_DIR $PBF_INPUT_FILE
