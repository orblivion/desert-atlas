#!/bin/bash

set -exuo pipefail

HERE="$(dirname "$(readlink -f "$0")")"
cd $HERE

BUILD_DIR=$(mktemp -d)

mkdir -p $BUILD_DIR

# TODO - loop over all of the regions
REGION=new-hampshire

PBF_FILE_NAME=$REGION-latest.osm.pbf
PBF_FILE_TMP=$BUILD_DIR/$PBF_FILE_NAME
PBF_FILE=pbf/$PBF_FILE_NAME
MBT_FILE=$BUILD_DIR/$REGION.mbtiles
PMT_FILE=$BUILD_DIR/$REGION.pmtiles

# Delete mbtiles and pmtiles to avoid confusion. Don't delete pbf though. Don't want to abuse Geofabrik by downloading over and over in case we need to re-run this.
rm -f $MBT_FILE $PMT_FILE

# Download *only if we don't have it already* (again, not to abuse Geofabrik)
# TODO - could md5 verify that we have the right thing
ls $PBF_FILE || (wget https://download.geofabrik.de/north-america/us/$REGION-latest.osm.pbf -O $PBF_FILE_TMP && mv $PBF_FILE_TMP $PBF_FILE) || exit 1

./tilemaker/build/tilemaker \
    --config config-protomaps.json \
    --process process-protomaps.lua \
    --input $PBF_FILE \
    --output $MBT_FILE

./go-pmtiles/go-pmtiles convert $MBT_FILE $PMT_FILE
