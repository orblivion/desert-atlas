#!/bin/python3

import subprocess, os, json, time
from glob import glob
from pprint import pprint

regions = [
    {"REGION": "new-hampshire", "REGION_PATH": "north-america/us"},
    {"REGION": "illinois", "REGION_PATH": "north-america/us"},
    {"REGION": "massachusetts", "REGION_PATH": "north-america/us"},
    {"REGION": "ontario", "REGION_PATH": "north-america/canada"},
]

output_dir = os.path.join("output", str(time.time()))
manifest_path = os.path.join(output_dir, "manifest.json")

os.makedirs(output_dir)

for region in regions:
    result = subprocess.run(['bash', 'build.sh'], env=dict(region, OUTPUT_DIR=output_dir))
    if result.returncode != 0:
        raise Exception("Error building for:", region)

manifest = {
    region["REGION"]: {
        "files" : [
            os.path.basename(path)
            for path
            # TODO - with REGION name collisions, we'll probably actually want
            # to put these files in the appropriate path
            in sorted(glob(os.path.join(output_dir, region["REGION"] + '.tar.gz.[0-9]*')))
        ],
    }
    for region in regions
}

with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)
