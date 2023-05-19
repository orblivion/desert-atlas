#!/bin/bash

set -exuo pipefail

# don't bother renaming pbf files, we'll delete them between continents anyway. instead just add the continent name to the package files

CONTINENT_DIR=$(readlink -f pbf/$CONTINENT)
CONTINENT_FILE=$CONTINENT_DIR/continent.osm.pbf
CONTINENT_FILE_TMP=$CONTINENT_FILE.tmp
OUTPUT_DIR=$CONTINENT_DIR/regions

mkdir -p OUTPUT_DIR

# Download the continent if we don't already happen to have it
ls $CONTINENT_FILE || (wget https://download.geofabrik.de/${CONTINENT}-latest.osm.pbf -O $CONTINENT_FILE_TMP && mv $CONTINENT_FILE_TMP $CONTINENT_FILE)

#MAX_NODES=24000000
# trying half the size
MAX_NODES=12000000

# Delete anything that might be here from the previous continent or a previous attempt
ls $OUTPUT_DIR && rm -r $OUTPUT_DIR || echo ''

cd splitter

# mapid=0 just sets the file names to start with 0
java -Xmx2000m -jar splitter.jar --max-nodes=$MAX_NODES --mapid=0 --output-dir=$OUTPUT_DIR $CONTINENT_FILE

# Save some space
rm -r $CONTINENT_DIR
