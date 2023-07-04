#!/bin/bash

set -exuo pipefail

HERE="$(dirname "$(readlink -f "$0")")"
cd $HERE

BUILD_DIR=$(mktemp -d)
PKG_DIR=$BUILD_DIR/pkg

mkdir $PKG_DIR

MBT_FILE=$BUILD_DIR/tiles.mbtiles
PMT_FILE=$PKG_DIR/tiles.pmtiles
SEARCH_FILE=$PKG_DIR/search.csv

# Note the . at the end. The package will be split into mulitple files
# and they will be numbered, starting with this prefix.
PKG_PREFIX=$SUPER_REGION-$REGION-$SUB_REGION.tar.gz.

python3 extract_search.py $SUB_REGION_PBF_FILE $SEARCH_FILE

./tilemaker/tilemaker \
    --config config-protomaps.json \
    --process process-protomaps.lua \
    --input $SUB_REGION_PBF_FILE \
    --output $MBT_FILE

./go-pmtiles/go-pmtiles convert $MBT_FILE $PMT_FILE

# Remember that `pkg` is the package dir, and it's in the build dir. We want to
# be here so that the tree of the tar shows up the way we want.
cd $BUILD_DIR
tar -czvf pkg.tar.gz pkg

cd -
split -d -b 2M $BUILD_DIR/pkg.tar.gz $OUTPUT_DIR/$PKG_PREFIX

# This would take up a ton of extra space
rm -r $BUILD_DIR
