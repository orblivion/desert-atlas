#!/bin/python3

import subprocess, os, json
from glob import glob

import parse_areas

def areas_list_path(output_dir, continent):
    # NOTE - This needs to match with the same path in get_continent.sh
    return os.path.join(output_dir, 'areas.' + continent + '.list')

def continent_done_path(output_dir, continent):
    # NOTE - This needs to match with the same path in cleanup_continent.sh
    return os.path.join(output_dir, continent + '.done')

def make_continent(continent, output_dir):
    """
    We have generated all of the pbf files for all of the regions.
    """

    # If we already built the continent we can skip all of this
    if os.path.exists(continent_done_path(output_dir, continent)):
        return

    # If we already have the areas.list we can skip this part
    if not os.path.exists(areas_list_path(output_dir, continent)):
        result = subprocess.run(['bash', 'get_continent.sh'], env=dict(CONTINENT=continent, OUTPUT_DIR=output_dir))
        if result.returncode != 0:
            raise Exception("Error with get_continent.sh")

    result = subprocess.run(['bash', 'init_continent_output.sh'], env=dict(CONTINENT=continent, OUTPUT_DIR=output_dir))
    if result.returncode != 0:
        raise Exception("Error with init_continent_output.sh")

    regions_dir = os.path.join('pbf', continent, 'regions')

    # I think glob wasn't being perfectly sorted by default
    regions = sorted(
        os.path.basename(fname).split('.')[0]                      # Everything before ".osm.pbf" in the filename is what we'll use as the region name
        for fname in glob(os.path.join(regions_dir, '*.osm.pbf'))  # Loop over all .pbf files we generated from the splitter process
    )

    for region in regions:
        result = subprocess.run(['bash', 'build_region.sh'], env=dict(CONTINENT=continent, REGION=region, OUTPUT_DIR=output_dir))
        if result.returncode != 0:
            raise Exception("Error building for:", region)

    result = subprocess.run(['bash', 'cleanup_continent.sh'], env=dict(CONTINENT=continent))
    if result.returncode != 0:
        raise Exception("Error with cleanup_continent.sh")

def make_manifest(continents, output_dir):
    # Get regions from generated .tar.gz files, since this is all continents generated.
    # Make it a set to remove dupes. There will be multiple tar.gz per region. But then,
    # sort the result.
    all_regions_with_continent = sorted({
        os.path.basename(fname).split('.')[0]                     # Everything before ".tar.gz" in the filename is what we'll use as the region name
        for fname in glob(os.path.join(output_dir, '*.tar.gz.*')) # Loop over all .tar.gz files we generated from the region building process
    })

    # Format is 'continent---region'
    get_continent = lambda region_with_continent: region_with_continent.split('---')[0]
    get_region = lambda region_with_continent: region_with_continent.split('---')[1]

    all_boundses = {
        continent: parse_areas.parse_areas(areas_list_path(output_dir, continent))
        for continent in continents
    }

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

    # TODO - gzip, it'll probably get kind of big
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

def s3_sync(output_dir, s3_bucket_name, timestamp):
    result = subprocess.run(['s3cmd', 'sync', '--delete-removed', output_dir + '/', f's3://{s3_bucket_name}/{timestamp}/', '-P'])
    if result.returncode != 0:
        raise Exception("Error with s3cmd sync")

# Mainly to test that the credentials and bucket name are set up correctly
def s3_ls(s3_bucket_name):
    result = subprocess.run(['s3cmd', 'ls', f's3://{s3_bucket_name}/'])
    if result.returncode != 0:
        raise Exception("Error with s3cmd ls. Did you set up ~/.s3cmd ?")

def make_the_world():
    # fail this right away if we don't have our credentials setup
    s3_bucket_name = os.environ['S3BUCKET']
    s3_ls(s3_bucket_name)

    # Get the build name from a file so we can re-run the same build after errors.
    # We don't generate it here because we want to be deliberate about when we start a new build. set_build_name.py is for that.
    try:
        timestamp = open("build_name").read()
    except FileNotFoundError:
        raise Exception("Need a build_name. Run set_build_name.py.")

    # Create this once (remember time.time() will change every run), pass into
    # functions that need it
    output_dir = os.path.join("output", timestamp)
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

    for continent in continents:
        make_continent(continent, output_dir)
    make_manifest(continents, output_dir)

    s3_sync(output_dir, s3_bucket_name, timestamp)

make_the_world()
