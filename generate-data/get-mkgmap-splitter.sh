#!/bin/bash

set -exuo pipefail

VERSION=653
TMP_ZIP_LOCATION=$(mktemp)
TMP_DIR_LOCATION=$(mktemp -d)
HASH=a5acb49296899b5d2d81966bd549d3f40d3c48f47ead3395df3cb9081e7cc424

mkdir splitter || (echo "Existing splitter directory found. Safely delete it first."; exit 1)

curl https://www.mkgmap.org.uk/download/splitter.html | grep "Download splitter release" | grep -w $VERSION || (echo "Mkgmap Splitter seems to have been updated!"; exit 1)

wget https://www.mkgmap.org.uk/download/splitter-r${VERSION}.zip -O $TMP_ZIP_LOCATION

sha256sum $TMP_ZIP_LOCATION | grep $HASH || (echo "Mkgmap Splitter checksum failed!"; exit 1)

unzip $TMP_ZIP_LOCATION -d $TMP_DIR_LOCATION

# Normalize the final directory, don't want the version number in there
mv $TMP_DIR_LOCATION/splitter-r${VERSION}/* ./splitter/

# Just make sure that we didn't miss anything
rmdir $TMP_DIR_LOCATION/splitter-r${VERSION}
rmdir $TMP_DIR_LOCATION
