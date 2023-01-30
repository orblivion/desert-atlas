import osmium as o
import string, csv, sys
from pprint import pprint


# TODO - Do this much smarter. Now I understand what Gazetteer is for. Maybe we
# want to get Gazetteer working instead. Though this gives us more power in the
# long run to format search data how we want it.

class SearchIndexer(o.SimpleHandler):
    def __init__(self, csvfile, skipfile):
        fieldnames = ["name", "lat", "lng"]
        self.csv_writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        self.csv_writer.writeheader()

        # Skipping is just for debugging the data
        self.skipfile = skipfile
        super(SearchIndexer, self).__init__()

    def _skip_quietly(self, e):
        # Sure we want to skip, don't bother making a note of it
        return (
            e.deleted
            or not e.visible
            or not "name" in e.tags
            or (  # Some junctions have names, but if the name is just a number, let's skip it
                "junction" in e.tags and set(e.tags["name"]) <= set(string.digits)
            )
            or (  # If the street name is just a number, let's skip it (for now)
                "highway" in e.tags and set(e.tags["name"]) <= set(string.digits)
            )
            or (  # If the name is just the house number
                # TODO - support addresses some day though
                # TODO - also sometimes this might be the
                # name of a restaurant or something. Only skip this for certain tags.
                "addr:housenumber" in e.tags
                and e.tags["name"] == e.tags["addr:housenumber"]
                and set(e.tags["name"]) <= set(string.digits)
            )
        )

    def _skip_loudly(self, e):
        # We want to skip and make note of it for debugging
        return not set(dict(e.tags)).intersection(
            {
                "building",
                "amenity",
                "shop",
                "place",
                "natural",
                "landuse",
                "historic",
                "leisure",
                "waterway",
                "tourism",
                "junction",  # Some of these seem to have useful names so long as we remove the number-only ones
                (  # TODO - Oh boy. We need to deduplicate a ton here. Maybe combine based on
                    # common nodes. Or basic proximity. But also, we need duplicated names to
                    # show up in search results in the first place.
                    "highway"
                ),
            }
        ) and e.tags.get('emergency') != "ambulance_station"

    def _write_row(self, name, lat, lng):
        self.csv_writer.writerow(
            {
                "name": name,
                "lat": lat,
                "lng": lng,
            }
        )

    def node(self, n):
        if self._skip_quietly(n):
            return

        if self._skip_loudly(n):
            pprint(dict(n.tags), skipfile)
            return

        self._write_row(n.tags["name"], n.location.lat, n.location.lon)

    def way(self, w):
        if self._skip_quietly(w):
            return

        if self._skip_loudly(w):
            pprint(dict(w.tags), skipfile)
            return

        if w.is_closed:
            # For closed ways aka areas, the pin should probably be in the center of all of the nodes

            # TODO - shapely or whatever it's called has a center function that's probably better
            x = sum(n.location.x for n in w.nodes) / len(w.nodes)
            y = sum(n.location.y for n in w.nodes) / len(w.nodes)
        else:
            # For open ways, the pin should probably be on one of the nodes. Let's pick one in the middle.

            middle_node = w.nodes[len(w.nodes) / 2]
            x, y = middle_node.location.x, middle_node.location.y

        #if set(w.tags["name"]) <= set(string.digits):
        #    pprint(dict(w.tags))
        self._write_row(w.tags["name"], x, y)


# Empty it once before appending across all regions
with open("/tmp/skipping", "w", newline="") as skipfile:
    pass

in_file_path = sys.argv[1]
out_file_path = sys.argv[2]
with open(out_file_path, "w", newline="") as csvfile:
    with open("/tmp/skipping", "a", newline="") as skipfile:
        handler = SearchIndexer(csvfile, skipfile)
        handler.apply_file(in_file_path)
