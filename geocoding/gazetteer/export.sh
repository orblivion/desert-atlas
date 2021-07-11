#!/bin/bash

set -eufx -o pipefail

rm -rf data out.json.gz

#Do some preparations: split whole OSM file into 3 files with nodes, ways, and relations.
java -jar gazetteer.jar split map.osm

#Parse data and stripe it
# I think `places` sometimes fails, depending on the data. But maybe osmnames would be a replacement for it.
java -jar gazetteer.jar slice pois places addresses

#Do spatial join
java -jar gazetteer.jar join --handlers out-gazetteer out.json.gz
