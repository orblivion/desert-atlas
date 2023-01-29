#!/bin/python3

import subprocess, os, json, time
from glob import glob
from pprint import pprint

regions = [
    "new-hampshire",
    "illinois",
    "massachusetts",
]

output_dir = os.path.join("output", str(time.time()))
manifest_path = os.path.join(output_dir, "manifest.json")

os.makedirs(output_dir)

for region in regions:
    subprocess.run(['bash', 'build.sh'], env={"REGION": region, "OUTPUT_DIR": output_dir})

manifest = {
    region: {
        "files" : [
            os.path.basename(path)
            for path
            in glob(os.path.join(output_dir, region + '.tar.gz.[0-9]*'))
        ],
    }
    for region in regions
}

with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)
