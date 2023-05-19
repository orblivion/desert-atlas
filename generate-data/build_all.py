#!/bin/python3

import subprocess, os, json, time
from glob import glob

import parse_areas

def make_continent(continent, regions, output_dir):
    """
    We have generated all of the pbf files for all of the regions.
    """
    result = subprocess.run(['bash', 'get_continent.sh'], env=dict(CONTINENT=continent, OUTPUT_DIR=output_dir))

    continent_boundses = parse_areas.get_areas('splitter/areas.list')

    regions = [
        os.path.basename(fname).split('.')[0]           # Everything before ".osm.pbf" is what we'll use as the region name
        for fname in glob('pbf/regions/*.osm.pbf')      # Loop over all .pbf files we generated from the splitter process
    ]

    for region in regions:
        result = subprocess.run(['bash', 'build_region.sh'], env=dict(CONTINENT=continent, REGION=region, OUTPUT_DIR=output_dir))
        if result.returncode != 0:
            raise Exception("Error building for:", region)

    return continent_boundses

def make_manifest(all_boundses, output_dir):
    # Get regions from generated .tar.gz files, since this is all continents generated.
    # Make it a set to remove dupes. There will be multiple tar.gz per region. But then,
    # sort the result.
    all_regions_with_continent = sorted({
        os.path.basename(fname).split('.')[0]                     # Everything before ".tar.gz" is what we'll use as the region name
        for fname in glob(os.path.join(output_dir, '*.tar.gz.*')) # Loop over all .tar.gz files we generated from the region building process
    })

    # Format is 'continent-region'
    get_continent = lambda region_with_continent: region_with_continent.split('-')[0]
    get_region = lambda region_with_continent: region_with_continent.split('-')[1]

    manifest = {
        region_with_continent: {
            "files" : [
                os.path.basename(path)
                for path
                in sorted(glob(os.path.join(output_dir, region_with_continent + '.tar.gz.[0-9]*')))
            ],
            "bounds" : all_boundses[get_continent(region_with_continent)][get_region(region_with_continent)],
        }
        for region_with_continent in all_regions_with_continent
    }

    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

def make_the_world():
    # Create this once (remember time.time() will change every run), pass into
    # functions that need it
    output_dir = os.path.join("output", str(time.time()))
    os.makedirs(output_dir)

    continents = [
        "africa",
        "antarctica",
        "asia",
        "australia-oceania",
        "central-america",
        "europe",
        "north-america",
        "south-america",
    ]

    all_areas = {}
    for continent in continents:
        all_areas[continent] = make_continent(continent, output_dir)
    make_manifest(all_areas, output_dir)

make_the_world()
