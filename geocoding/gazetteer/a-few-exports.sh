#!/bin/bash

# Export some of the things I was trying out
# Needs the osm.bz2 files. Maybe some are named wrong; I edited this file later.

set -eufx -o pipefail

mkdir -p out

osmium extract -p ../../regions/boston.geojson massachusetts-latest.osm.bz2 -o map.osm
./export.sh
mv out.json.gz ./out/boston.json.gz


osmium extract -p ../../regions/downtown-chicago.geojson illinois-latest.osm.bz2 -o map.osm
./export.sh
mv out.json.gz ./out/downtown-chicago.json.gz


osmium extract -p ../../regions/downtown-montreal.geojson quebec-latest.osm.bz2 -o map.osm
./export.sh
mv out.json.gz ./out/downtown-montreal.json.gz


osmium extract -p ../../regions/portsmouth-dover.geojson new-hampshire-latest.osm.bz2 -o map.osm
./export.sh
mv out.json.gz ./out/portsmouth-dover.json.gz
