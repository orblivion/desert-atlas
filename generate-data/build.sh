#!/bin/bash

set -exuo pipefail

HERE="$(dirname "$(readlink -f "$0")")"
cd $HERE

BUILD_DIR=$(mktemp -d)
OUTPUT_DIR=output

mkdir -p $BUILD_DIR

PBF_FILE_NAME=$REGION-latest.osm.pbf
PBF_FILE_TMP=$BUILD_DIR/$PBF_FILE_NAME
# Keep pbf file (not in a temp dir). Don't want to abuse Geofabrik by
# downloading over and over in case we need to re-run this.
PBF_FILE=pbf/$PBF_FILE_NAME

MBT_FILE=$BUILD_DIR/$REGION.mbtiles
PMT_FILE=$BUILD_DIR/$REGION.pmtiles
SEARCH_FILE=$BUILD_DIR/$REGION.csv

# Note the . at the end. The package will be split into mulitple files
# and they will be numbered, starting with this prefix.
PKG_PREFIX=$REGION.tar.gz.
PKG_TMP=$(mktemp)

# Download *only if we don't have it already* (again, not to abuse Geofabrik)
# TODO - could md5 verify that we have the right thing
ls $PBF_FILE || (wget https://download.geofabrik.de/north-america/us/$REGION-latest.osm.pbf -O $PBF_FILE_TMP && mv $PBF_FILE_TMP $PBF_FILE) || exit 1

python3 extract_search.py $PBF_FILE $SEARCH_FILE

./tilemaker/tilemaker \
    --config config-protomaps.json \
    --process process-protomaps.lua \
    --input $PBF_FILE \
    --output $MBT_FILE

./go-pmtiles/go-pmtiles convert $MBT_FILE $PMT_FILE

rm $MBT_FILE # We don't want it in the resulting package.

tar -czvf $PKG_TMP $BUILD_DIR
split -d -b 2M $PKG_TMP $OUTPUT_DIR/$PKG_PREFIX
