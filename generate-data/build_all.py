#!/bin/python3

import subprocess, os, json, time
from glob import glob
from pprint import pprint

import parse_areas

# TODO - readable code
regions = [{"REGION": os.path.basename(fname).split('.')[0]} for fname in glob('pbf/*.osm.pbf')]

# Create this once (remember time.time() will change every run), pass into
# functions that need it
new_output_dir = os.path.join("output", str(time.time()))

# TODO maybe in other files
def split_continent(continent):
    #ls $PBF_FILE || (wget https://download.geofabrik.de/' + continent + '-latest.osm.pbf -O $PBF_FILE_TMP && mv $PBF_FILE_TMP $PBF_FILE) || exit 1

    # TODO - try half the size
    MAX_NODES = 24000000

    result = subprocess.run([
        'java',
        '-Xmx2000m',
        '-jar',
        'splitter.jar',
        '--max-nodes=' + int(MAX_NODES),
        continent + '-latest.osm.pbf',
    ])

def make_data_files(output_dir):
    os.makedirs(output_dir)

    for region in regions:
        result = subprocess.run(['bash', 'build_region.sh'], env=dict(region, OUTPUT_DIR=output_dir))
        if result.returncode != 0:
            raise Exception("Error building for:", region)

def make_manifest(output_dir):
    areas = parse_areas.get_areas()

    manifest = {
        region["REGION"]: {
            "files" : [
                os.path.basename(path)
                for path
                # TODO - with REGION name collisions, we'll probably actually want
                # to put these files in the appropriate path
                in sorted(glob(os.path.join(output_dir, region["REGION"] + '.tar.gz.[0-9]*')))
            ],
            "bounds" : areas[region["REGION"]],
        }
        for region in regions
    }

    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

make_data_files(new_output_dir)
make_manifest(new_output_dir)
