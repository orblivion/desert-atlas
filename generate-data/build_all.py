#!/bin/python3

from collections import defaultdict
import subprocess, os, json, sys, shutil
from glob import glob

import parse_areas

# Skipping tons of __file__ path concatenations. Just move us to the correct path.
os.chdir(os.path.dirname(__file__))

TESTING = '--test' in sys.argv
# * Use small test planet file instead of downloading the giant real thing
# * Correspondingly small regions generated by the splitter, so we get regions on par with the real thing
# * Don't upload the result to s3

PBF_DIR_PATH = os.path.abspath('pbf')
PBF_SUPER_REGIONS_DIR_PATH = os.path.join(PBF_DIR_PATH, 'super_regions')
PBF_PLANET_PATH = os.path.join(PBF_DIR_PATH, 'planet.osm.pbf')

def get_qualified_region(super_region, region):
    return super_region + '_' + region

def get_pbf_super_region_file_path(super_region):
    return os.path.join(PBF_SUPER_REGIONS_DIR_PATH, super_region + '.osm.pbf')

def get_pbf_regions_dir_path(super_region):
    return os.path.join(PBF_DIR_PATH, 'regions', super_region)

def get_pbf_region_file_path(super_region, region):
    return os.path.join(get_pbf_regions_dir_path(super_region), region + '.osm.pbf')

def get_pbf_sub_regions_dir_path(super_region, region):
    return os.path.join(PBF_DIR_PATH, 'sub_regions', get_qualified_region(super_region, region))

def get_pbf_sub_region_file_path(super_region, region, sub_region):
    return os.path.join(get_pbf_sub_regions_dir_path(super_region, region), sub_region + '.osm.pbf')

def get_output_dir_path(timestamp):
    return os.path.join("output", timestamp)

# Remember that the bounds file from the planet contains the super regions.
# The bounds file from a super region contains the regions
# The bounds file from a region contains the sub-regions

def get_planet_bounds_path(output_dir):
    return os.path.abspath(os.path.join(output_dir, 'planet.bounds'))

def get_super_region_bounds_path(output_dir, super_region):
    return os.path.abspath(os.path.join(output_dir, 'super_region.' + super_region + '.bounds'))

def get_region_bounds_path(output_dir, super_region, region):
    return os.path.abspath(os.path.join(output_dir, 'region.' + get_qualified_region(super_region, region) + '.bounds'))

TEST_PBF_PLANET_PATH = os.path.abspath('planet-test.osm.pbf')

def get_planet():
    if os.path.exists(PBF_PLANET_PATH):
        return

    result = subprocess.run([
        "aria2c",
        "https://planet.osm.org/pbf/planet-latest.osm.pbf.torrent",

        # seed for a half hour. this whole thing will take a while anyway, may
        # as well pay back some.
        "--seed-time",
        "30",
    ])
    if result.returncode != 0:
        raise Exception("Error with getting planet.osm.pbf torrent")

    # For simplicity we're just going to end the seeding above (as opposed to
    # doing it in parallel with the map building), so we'll rename the file to
    # something normalized.
    [planet_glob_path] = glob("planet-[0-9]*.osm.pbf")
    shutil.move(planet_glob_path, PBF_PLANET_PATH)

def get_test_planet():
    shutil.copyfile(TEST_PBF_PLANET_PATH, PBF_PLANET_PATH)

def areas_to_bounds(from_path, to_path):
    json.dump(parse_areas.parse_areas(from_path), open(to_path, "w"))

def get_super_regions(output_dir):
    path = get_planet_bounds_path(output_dir)
    if os.path.exists(path):
        contents = open(path).read()
        try:
            # If it fails to parse, it's no good. In that case, we'll catch the
            # exception and return None as an indication that the super regions
            # aren't done. This way, if the file is created but isn't written
            # properly, we redo the super regions.
            return json.loads(contents)
        except:
            pass

def get_regions(output_dir, super_region):
    return json.load(open(get_super_region_bounds_path(output_dir, super_region)))

def get_sub_regions(output_dir, super_region, region):
    return json.load(open(get_region_bounds_path(output_dir, super_region, region)))

def is_big_region(output_dir, super_region, region):
    if TESTING:
        # Testing data won't so surely have both big and small regions. Let's
        # just make sure we test both options.
        return int(region) % 2

    bounds_1, bounds_2 = get_regions(output_dir, super_region)[region]
    area = abs(bounds_1[0] - bounds_2[0]) * abs(bounds_1[1] - bounds_2[1])

    return area >= 200

def split_region_if_large(super_region, region, output_dir, max_nodes_per_region, splitter_memory):
    # The splitter tool is concerned with limiting *data size* of the resulting
    # smaller areas. Thus, if one of these smaller areas is low data density
    # (no major metropolitan areas), it may still end up with a very large land
    # mass. However, when we convert these low data size large land mass areas
    # to our usable format, we end up with large file sizes. I assume that this
    # is because the protomaps file size scales with the size of land mass more
    # than the splitter tool does.
    #
    # So, thus far we've split the planet into super regions, and super regions
    # into regions. If a given region is too large (land-mass), our solution
    # here is to split it yet again into "sub-regions", with fewer nodes per
    # region (smaller data size) than our target for regions, and hope it comes
    # out to a reasonable land mass and thus reasonable file size in our usable
    # format.
    #
    # By the end of this, we want:
    #
    # * Sub-regions generated from this region to appear in the sub-regions dir
    #   OR if it's small enough (usually the case), for the region to simply be
    #   copied to the sub-regions dir.
    #
    # * The appropriate bounds data is saved to the output folder. If splitting
    #   the region, then whatever we get out of that split. If just copying
    #   this region, then whatever portion of the super region split applies to
    #   this region.

    bounds_destination_path = get_region_bounds_path(output_dir, super_region, region)

    if os.path.exists(bounds_destination_path):
        # Already did this
        return

    if not is_big_region(output_dir, super_region, region):
        # The region is small enough to be a sub-region, don't bother splitting
        # it. Just copy it over, this region has one sub-region, itself.
        # We copy instead of move so that it can be idempotent until the areas
        # file exists.

        sub_region = "nosplit"

        regions_dir_path = get_pbf_sub_regions_dir_path(super_region, region)
        if not os.path.exists(regions_dir_path):
            os.makedirs(regions_dir_path)

        shutil.copyfile(
            get_pbf_region_file_path(super_region, region),
            get_pbf_sub_region_file_path(super_region, region, sub_region),
        )

        # We need bounds data for this one-sub-region region. There is no
        # areas.list with just this data to turn into a bounds file, so we need
        # to take the part of the super region bounds that refers to this
        # region, and output it by itself.
        json.dump(
            {
                sub_region: get_regions(output_dir, super_region)[region],
            },
            open(bounds_destination_path, "w"),
        )
    else:
        # The region is too big to be a sub-region, let's split it into ~5 pieces

        # Only define these for "big region" since we won't be splitting and
        # generating new pbfs for small ones.
        pbf_output_path = get_pbf_sub_regions_dir_path(super_region, region)
        areas_list_generated_path = os.path.join(pbf_output_path, 'areas.list')

        if TESTING:
            max_nodes_per_sub_region = max_nodes_per_region
        else:
            max_nodes_per_sub_region = int(max_nodes_per_region / 5)

        result = subprocess.run(
            ['bash', 'split_pbf.sh'],
            env={
                'PBF_OUTPUT_DIR': pbf_output_path,
                'PBF_INPUT_FILE': get_pbf_region_file_path(super_region, region),
                'MAX_NODES': str(max_nodes_per_sub_region),
                'MAX_MEMORY': str(splitter_memory),
            }
        )
        if result.returncode != 0:
            raise Exception("Error with split_pbf.sh for oversized region")

        areas_to_bounds(areas_list_generated_path, bounds_destination_path)

    # Remove the original region to save file size
    #
    # Note: for small regions, we'd rather copy and delete than simply move
    # the file, so that we can use the bounds file as an unambiguous marker for
    # completing this step. The order of events is:
    #
    # 1) Copy region to sub-region
    # 2) Create bounds
    # 3) Delete region
    #
    # If there's an error at step 1 or 2, we can always retry it. This wouldn't
    # work if we moved the file instead of deleting. If there's an error at
    # step 3, we waste a little space, no big deal.
    os.remove(get_pbf_region_file_path(super_region, region))

    return

def make_super_region(super_region, output_dir, max_nodes_per_region, splitter_memory):
    # If we already built the super_region we can skip all of this
    SUPER_REGION_DONE_PATH = os.path.join(output_dir, super_region + '.done')
    if os.path.exists(SUPER_REGION_DONE_PATH):
        return

    pbf_output_path = get_pbf_regions_dir_path(super_region)
    areas_list_generated_path = os.path.join(pbf_output_path, 'areas.list')
    bounds_destination_path = get_super_region_bounds_path(output_dir, super_region)

    # If we already have the bounds file we can skip this part
    if not os.path.exists(bounds_destination_path):
        result = subprocess.run(
            ['bash', 'split_pbf.sh'],
            env={
                'PBF_OUTPUT_DIR': pbf_output_path,
                'PBF_INPUT_FILE': get_pbf_super_region_file_path(super_region),
                'MAX_NODES': str(max_nodes_per_region),
                'MAX_MEMORY': str(splitter_memory),
            }
        )
        if result.returncode != 0:
            raise Exception("Error with split_pbf.sh for super_region " + super_region)

        areas_to_bounds(areas_list_generated_path, bounds_destination_path)

    regions = get_regions(output_dir, super_region)

    # This is probably confusing coding. I should probably just have
    # "split planet", "split super regions", "optionally split regions",
    # and then "make output". But, this is how it is and I'm gonna avoid
    # big changes for now.
    for region in regions:
        split_region_if_large(super_region, region, output_dir, max_nodes_per_region, splitter_memory)

    result = subprocess.run(
        ['bash', 'init_super_region_output.sh'],
        env={
            'SUPER_REGION': super_region,
            'OUTPUT_DIR': output_dir,
        }
    )
    if result.returncode != 0:
        raise Exception("Error with init_super_region_output.sh")

    for region in regions:
        sub_regions = get_sub_regions(output_dir, super_region, region)

        for sub_region in sub_regions:
            result = subprocess.run(
                ['bash', 'build_sub_region.sh'],
                env={
                    'SUPER_REGION': super_region,
                    'REGION': region,
                    'SUB_REGION': sub_region,
                    'OUTPUT_DIR': output_dir,
                    'SUB_REGION_PBF_FILE': get_pbf_sub_region_file_path(super_region, region, sub_region),
                }
            )
            if result.returncode != 0:
                raise Exception("Error building for:", super_region, region, sub_region)

    # Mark that the super region as done
    open(SUPER_REGION_DONE_PATH, 'w').close()

    # Save some space. We don't need the region or super region or sub-region
    # pbf files anymore, and we're going to keep taking up space by generating
    # tar.gz packages as we build the next regions (unless this is the last one).
    os.remove(get_pbf_super_region_file_path(super_region))
    shutil.rmtree(get_pbf_regions_dir_path(super_region))
    for region in regions:
        shutil.rmtree(get_pbf_sub_regions_dir_path(super_region, region))

def split_planet_into_super_regions(output_dir, max_nodes_per_super_region, splitter_memory):
    pbf_output_path = PBF_SUPER_REGIONS_DIR_PATH
    areas_list_generated_path = os.path.join(pbf_output_path, 'areas.list')
    bounds_destination_path = get_planet_bounds_path(output_dir)

    # Test whether the planet was already split
    if get_super_regions(output_dir):
        return

    result = subprocess.run(
        ['bash', 'split_pbf.sh'],
        env={
            'PBF_OUTPUT_DIR': pbf_output_path,
            'PBF_INPUT_FILE': PBF_PLANET_PATH,
            'MAX_NODES': str(max_nodes_per_super_region),
            'MAX_MEMORY': str(splitter_memory),
        }
    )
    if result.returncode != 0:
        raise Exception("Error with split_pbf.sh for planet")

    # Mark that the planet was split, and give us the ability to list super
    # regions
    areas_to_bounds(areas_list_generated_path, bounds_destination_path)

    return

def make_manifest(super_regions, output_dir):
    # Get sub-regions from generated .tar.gz files. There will be multiple
    # tar.gz per sub-region, so we remove dupes by making it a set. But then,
    # sort the result back into a list.
    regions_taxonomy = sorted({
        tuple(os.path.basename(fname).split('.')[0].split('-'))   # Everything before ".tar.gz" in the filename is what we'll use as the sub-region name
        for fname in glob(os.path.join(output_dir, '*.tar.gz.*')) # Loop over all .tar.gz files we generated from the region building process
    })
    simpler_regions_taxonomy = {
        (super_region, region) for (super_region, region, _) in regions_taxonomy
    }

    all_boundses = defaultdict(dict)
    for (super_region, region) in simpler_regions_taxonomy:
        all_boundses[super_region][region] = get_sub_regions(output_dir, super_region, region)

    manifest = {
        "-".join((super_region, region, sub_region)): {
            "files" : [
                # get just the file name, don't want the full path
                os.path.basename(path)
                for path

                # glob all of the files for this sub-region
                in sorted(glob(os.path.join(output_dir, "-".join((super_region, region, sub_region)) + '.tar.gz.[0-9]*')))
            ],
            "bounds" : all_boundses[super_region][region][sub_region],
        }
        for (super_region, region, sub_region) in regions_taxonomy
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
    if not TESTING:
        # fail this right away if we don't have our credentials setup
        s3_bucket_name = os.environ['S3BUCKET']
        s3_ls(s3_bucket_name)

    # Get the build name from a file so we can re-run the same build after errors.
    # We don't generate it here because we want to be deliberate about when we start a new build. set_build_name.py is for that.
    # TODO - wait, what does this do for us anyway? what are we restarting? why?
    # it's going to be the same planet anyway, probably. We're not waiting weeks.
    # We should probably just run this automatically once. if anything, restarting
    # should be the weird command. At which point we should delete the pbfs as well
    # if we're serious about it.
    try:
        timestamp = open(os.path.join("output", "build_name")).read()
    except FileNotFoundError:
        raise Exception("Need a build_name. Run set_build_name.py.")

    # Create this once (remember time.time() will change every run), pass into
    # functions that need it
    output_dir = get_output_dir_path(timestamp)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    if TESTING:
        get_test_planet()
    else:
        get_planet()

    if TESTING:
        max_nodes_per_region = 10000
        max_nodes_per_super_region = max_nodes_per_region * 10
        splitter_memory = 1000
    else:
        max_nodes_per_region = 20000000
        max_nodes_per_super_region = max_nodes_per_region * 10
        splitter_memory = 16000

    split_planet_into_super_regions(output_dir, max_nodes_per_super_region, splitter_memory)

    super_regions = get_super_regions(output_dir)

    for super_region in super_regions:
        make_super_region(super_region, output_dir, max_nodes_per_region, splitter_memory)
    make_manifest(super_regions, output_dir)

    if not TESTING:
        s3_sync(output_dir, s3_bucket_name, timestamp)

    print ('Built the world! Set the new DL_VERSION in server.py to:', timestamp)

make_the_world()
