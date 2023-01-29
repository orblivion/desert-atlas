#!/bin/python3

import subprocess, os, json
from glob import glob
from pprint import pprint

regions = [
    "new-hampshire",
    "illinois",
    "massachusetts",
]

MANIFEST_PATH = "output/manifest.json"

os.remove(MANIFEST_PATH)

for region in regions:
    subprocess.run(['bash', 'build.sh'], env={"REGION": region})

manifest = {
    region: {
        "files" : [
            os.path.basename(path)
            for path
            in glob(os.path.join("output", region + '.tar.gz.[0-9]*'))
        ],
    }
    for region in regions
}

with open(MANIFEST_PATH, "w") as f:
    json.dump(manifest, f, indent=2)
