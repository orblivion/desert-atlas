# Get the index from https://download.geofabrik.de/index-v1.json

# Idea: This process probably has a lot of re-dos. It'll be driven by build-all.py.
# Maybe this service should just get one file. However, the "correct" behavior should probably be to call this "in order", i.e. so that we do all of North America at once, and flush afterwards, so we don't need to extract the US separately for every state. Unless we can actually store all of the countries extracted AND the continents.

def make_tree(index):
    """
    Given the index of files, make a tree of regions and their children.
    """
    # TODO - Also I have my own sub-regions on top of the index. and/or I need to crudely split big ones in half
    # I should call that periodically and define the file and commit it, not automatically every time. Ideally
    # the regions don't move. Or at least we don't define and un-define regions.
    pass

def get_regions(region):
    """
    Yield the smallest regions in the 
    """
    if not region.children:
        yield region
    else:
        for child in region.children:
            yield get_regions(child)

def extract(region):
    """
    Extract the region, retun the
    """
    subprocess.call("omosis"...)

def get_big_regions(timestamp):
    """
    Download the big regions from geofabrik. Delete after? Allow for continue? Hmm.
    """
    pass

def extract_regions():
    for big_region in get_big_regions():
        for region in get_regions(big_region):
            extract(region)

# call this one once or periodically. it'll define regions.
# don't want to dynamically do this or it could create
# chaos. unless I'm ready for it.
def get_custom_splits():
    for region in get_regions(root):
        if region is big:
            split teh region

    return the splits
