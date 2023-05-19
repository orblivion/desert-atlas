#!/bin/bash

set -exuo pipefail

# don't bother renaming pbf files, we'll delete them between continents anyway. instead just add the continent name to the package files

CONTINENT_DIR=$(readlink -f pbf/$CONTINENT)
CONTINENT_FILE=$CONTINENT_DIR/continent.osm.pbf
CONTINENT_FILE_TMP=$CONTINENT_FILE.tmp
PBF_OUTPUT_DIR=$CONTINENT_DIR/regions

# NOTE - This needs to match with the same path in build_all.py
AREAS_LIST_PATH=$OUTPUT_DIR/areas.$CONTINENT.list

mkdir -p $PBF_OUTPUT_DIR

# Download the continent if we don't already happen to have it
ls $CONTINENT_FILE || (wget https://download.geofabrik.de/${CONTINENT}-latest.osm.pbf -O $CONTINENT_FILE_TMP && mv $CONTINENT_FILE_TMP $CONTINENT_FILE)

MAX_NODES=24000000

# Delete anything that might be here from the previous continent or a previous attempt
ls $PBF_OUTPUT_DIR && rm -r $PBF_OUTPUT_DIR || echo ''

cd splitter

# mapid=0 just sets the file names to start with 0
# max-nodes sets the region size. We are making relatively few big regions than the default of many small regions
#  * It makes it not crash (OOM, I think) when splitting
#  * It *seems* to run faster in the browser for the Sandstorm app
java -Xmx2000m -jar splitter.jar --max-nodes=$MAX_NODES --mapid=0 --output-dir=$PBF_OUTPUT_DIR $CONTINENT_FILE

mv $PBF_OUTPUT_DIR/areas.list $AREAS_LIST_PATH
