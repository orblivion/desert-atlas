#!/bin/bash

set -exuo pipefail

# don't bother renaming pbf files, we'll delete them between continents anyway. instead just add the continent name to the package files

CONTINENT_FILE=./pbf/continents/$CONTINENT.osm.pbf
CONTINENT_FILE_TMP=./pbf/continents/$CONTINENT.tmp
OUTPUT_DIR=./pbf/regions

# Download the continent if we don't already happen to have it
ls $CONTINENT_FILE || (wget https://download.geofabrik.de/${CONTINENT}-latest.osm.pbf -O $CONTINENT_FILE_TMP && mv $CONTINENT_FILE_TMP $CONTINENT_FILE)

#MAX_NODES = 24000000
# trying half the size
MAX_NODES = 12000000

# Delete anything that might be here from the previous continent or a previous attempt
ls $OUTPUT_DIR/0.osm.pbf && rm $OUTPUT_DIR/*.osm.pbf || echo ''
ls $OUTPUT_DIR/areas.list && rm $OUTPUT_DIR/areas.list || echo ''

cd splitter

# mapid=0 just sets the file names to start with 0
java -Xmx2000m -jar splitter.jar --max-nodes=$MAX_NODES $CONTINENT_FILE --mapid=0 --output-dir=$OUTPUT_DIR

# Save some space
rm $CONTINENT_FILE
