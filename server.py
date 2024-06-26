#!/usr/bin/env python3
import csv, os, sys, glob, urllib.parse, tempfile, json, uuid, requests, tarfile, time, threading, shutil, sqlite3, zipfile, gzip, random
import csv_format

from pprint import pformat

import query

# TODO - actually fix the ssl warnings from the proxy's cert. For now this makes the console unreadable.
import urllib3
urllib3.disable_warnings()

# Run without Sandstorm. (This might not work so well over time, since I don't
# check that it still works as I make changes).
# TODO - could check sandstorm env instead of using this param
is_local = '--local' in sys.argv[1:]

POWERBOX_CA_CERT_PATH = "/var/powerbox-http-proxy.pem"
powerbox_ready = False

# Seems Sandstorm console only shows stderr
def print_err(*lines):
    sys.stderr.write(" ".join(pformat(line) for line in lines) + "\n")
    sys.stderr.flush()

def get_permissions(headers):
    if is_local:
        # local demo gets all permissions
        return ['bookmarks', 'download']
    else:
        return headers['X-Sandstorm-Permissions'].split(',')

if is_local:
    # Matching the path in the go server. See initLocalServer in server.go.
    basedir = "/tmp/desert-atlas-fe66b63c13a042734a5aee2341fa1240"
    print ("local mode, data is saved to:", basedir)
else:
    basedir = '/var'

big_tmp_dir = os.path.join(basedir, 'big_tmp') # since /tmp/ runs out of space.
tile_dir = os.path.join(basedir, 'tiles')

search_imported_marker_dir = os.path.join(basedir, 'search_imported')
def search_imported_marker_path(tile_id):
    return os.path.join(search_imported_marker_dir, tile_id)

# TODO - eventually it'll organized as map-data/<data-id>/tiles and map-data/<data-id>/search,
# so it's all bundled per map data segment (at least that was the old plan. with a db that may
# not work...)
search_db_path = os.path.join(basedir, 'search.db')

user_data_dir = os.path.join(basedir, 'data')

for data_dir in [big_tmp_dir, tile_dir, search_imported_marker_dir, user_data_dir]:
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

# Clear out old data on startup for bad failures that don't clean up. I'm
# afraid to use shutil.rmtree and I want this quick so for now I'll just delete
# what I know are big files. TODO - delete everything.
for fname_to_delete in glob.glob(os.path.join(big_tmp_dir, '*/*.tar.gz')):
    os.remove(fname_to_delete)

# Separate db file from search data, to make it easier to manage. In case of
# issue, map data (including search) could be blown away and re-downloaded.
bookmarks_db_path = os.path.join(user_data_dir, "bookmarks.db")

# Avoid issues
def copy_bookmark(orig_bookmark):
    bookmark = {
        "name": orig_bookmark["name"],
        "latlng": {
            "lat": orig_bookmark["latlng"]["lat"],
            "lng": orig_bookmark["latlng"]["lng"],
        },
    }

    if "id" in orig_bookmark:
        bookmark["id"] = orig_bookmark["id"]
    if "version" in orig_bookmark:
        bookmark["version"] = orig_bookmark["version"]

    return bookmark

def insert_bookmark(bookmark):
    bookmark_id = str(uuid.uuid1())
    con = sqlite3.connect(bookmarks_db_path)
    cur = con.cursor()
    cur.execute(
        'INSERT INTO bookmarks VALUES (?, ?, ?, ?, ?)',
        (
            bookmark_id,
            0, # version
            bookmark['name'],
            bookmark["latlng"]["lat"],
            bookmark["latlng"]["lng"],
        ),
    )
    con.commit()

    new_bookmark = copy_bookmark(bookmark)
    new_bookmark["id"] = bookmark_id
    new_bookmark["version"] = 0

    return new_bookmark

def update_bookmark(bookmark):
    con = sqlite3.connect(bookmarks_db_path)
    cur = con.cursor()

    new_version = bookmark["version"] + 1

    # Use the version field to prevent race conditions. Make sure users are
    # editing based on the latest version so they don't clobber another
    # person's edit.
    q_results = cur.execute(
        "UPDATE bookmarks SET name=?, version=?, lat=?, lng=? WHERE id=? AND version=?",
        (
            # UPDATE

            bookmark['name'],
            # incremented version to the db to indicate the change was made
            new_version,
            bookmark["latlng"]["lat"],
            bookmark["latlng"]["lng"],

            # WHERE

            bookmark["id"],
            # the version that the person was looking at *before* their change;
            # make sure nobody else changed it first
            bookmark["version"],
        ),
    )
    con.commit()

    # Return only if it succeeded in making the update
    if q_results.rowcount == 1:
        new_bookmark = copy_bookmark(bookmark)
        new_bookmark["version"] = new_version

        return new_bookmark

def delete_bookmark(bookmark_id):
    con = sqlite3.connect(bookmarks_db_path)
    cur = con.cursor()

    cur.execute(
        'DELETE FROM bookmarks WHERE id=?', (bookmark_id,)
    )

    con.commit()

def get_all_bookmarks():
    con = sqlite3.connect(bookmarks_db_path)
    cur = con.cursor()

    q_results = cur.execute(
        "SELECT id, version, name, lat, lng FROM bookmarks",
    )
    return {
        bookmark_id: {
            "version": version,
            "name": name,
            "latlng": {
                "lat": lat,
                "lng": lng,
            },
        }
        for bookmark_id, version, name, lat, lng in q_results
    }

BASEMAP_TILE = "base-map"

def import_basemap_search():
    tile_id = BASEMAP_TILE

    if os.path.exists(search_imported_marker_path(tile_id)):
        # TODO Obviously in the future we'll have updates and stuff. This is for the first release.
        print_err ("Already have " + tile_id)
        return

    print_err("Import basemap places")
    with tempfile.TemporaryDirectory(prefix=big_tmp_dir + "/") as tmp_extract_path:
        with gzip.open(os.path.join("base-map", "places.gz"), 'r') as places_file:
            file_path = os.path.join(tmp_extract_path, 'places.csv')

            # TODO - just pass file object in directly. need to refactor import_search to accept it
            open(file_path, 'wb').write(places_file.read())
            print_err("Extracted")

            import_search(tile_id, file_path, False)

            # For the "already downloaded" check above. We may want a better plan later.
            with open(search_imported_marker_path(tile_id), "w"):
                pass

# TODO - Try to import with sqlite's csv import feature? However:
# * If csv import *allows for appending* to a table, we'd delete where tile_id=xyz
#   as now
# * If csv import *does not allow for appending* to a table, we'd need to either
#   keep around the old csvs to append them all together and re-import, OR
#   delete where tile_id=xyz, export to csv, append the new csv to the export, and re-import.
# TODO - Think about concurrency (This is where Go will make things a lot easier).
#   Ideally we:
# * Copy the db file to a working location (assuming the search function doesn't
#   somehow alter it)
# * Add the new data
# * Stop the connection that the search uses
# * Copy the altered db over the working one
# * Restart the connection that the search uses
def import_search(tile_id, search_import_fname, update_status):
    con = sqlite3.connect(search_db_path)
    cur = con.cursor()
    cur.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS locations USING fts5(
            name UNINDEXED, normalized_name, tile_id UNINDEXED, lat UNINDEXED, lng UNINDEXED
        )
    """)

    print_err ("Putting", tile_id, "into search db")

    # TODO - make a transaction so that on error we roll back the delete and can fall back to previous data
    cur.execute('DELETE from locations where tile_id=?', (tile_id,))
    with open(search_import_fname, 'r') as f:
        if update_status:
            map_update_status[tile_id]['searchImportTotal'] = sum(1 for _ in csv.DictReader(f, fieldnames=csv_format.fieldnames))
            map_update_status[tile_id]['searchImportDone'] = 0

        f.seek(0)
        reader = csv.DictReader(f, fieldnames=csv_format.fieldnames)
        for idx, row in enumerate(reader):
            if update_status:
                map_update_status[tile_id]['searchImportDone'] = idx + 1

            cur.execute(
                'INSERT INTO locations VALUES (?, ?, ?, ?, ?)',
                (
                    row['name'],
                    query.search_normalize_save(row['name']),
                    tile_id,
                    row["lat"],
                    row["lng"],
                ),
            )
            # TODO - Deal with duplicates somehow. There seem to be
            # address points and poi points. I guess we probably want
            # to collect all of that eventually into one entry, though.

            # TODO cur.executemany? I'm afraid that it might OOM. Can it
            # work with a generator though?

            # TODO - There may still be useful things to extract here. amenity=, etc, that are not named.
            # But we should be careful. For instance I found ferry terminals without names. But maybe the
            # associated port POI has a name?
            # That said, something like toilets may be a useful search.
            # Maybe we could have the `name` and a few useful tags (amenities etc) in one table,
            # and fts5 vtable have a foreign key with it

    con.commit()

def delete_search(tile_id):
    con = sqlite3.connect(search_db_path)
    cur = con.cursor()

    print_err ("Deleting", tile_id, "from search db")

    cur.execute('DELETE from locations where tile_id=?', (tile_id,))
    con.commit()

if sys.version_info.major < 3:
    print_err("server.py requires python3 or later: python3 server.py")
    exit(1)
import re
import mmap # this is a system level thing. when converting to Go do the same thing: https://pkg.go.dev/golang.org/x/exp/mmap (unless we can just use Caddy?) except we need to convert the range requests.
import http.server
from socketserver import ThreadingMixIn
from http import HTTPStatus

# Setting to True would check for data inside generate-data/output instead of the S3 bucket over the Internet.
# This is only useful if you want to check the data you just generated with the much much smaller test planet
# data included in this repo. And you'd only do that to test changes to the build pipeline.
LOCAL_DATA = False

# This refers to the version of the generated map data we will be downloading.
# This number is a timestamp for when the build process began.
DL_VERSION = "1700099624.161532"

# Note that with Cloudflare I need to use a custom domain for uncapped egress so I just went back to
#   my domain, albeit with a good subdomain.
# I have to put DL_VERSION twice because I screwed up copying the S3 bucket. Hopefully not next time around.
DL_URL_DIR = f'https://desert-atlas.danielkrol.com/{DL_VERSION}/{DL_VERSION}/'

GO_SERVER = 'http://127.0.0.1:3858/'
INTERNAL_TUTORIAL_URL = f'{GO_SERVER}/_internal/tutorial-mode'

filemaps = None

manifest_path = os.path.join(basedir, 'manifest.' + DL_VERSION + '.json')
manifest = None
manifest_error = False

if os.path.exists(manifest_path):
    manifest = json.load(open(manifest_path))

map_update_status = {} # TODO For now just partial downloads. eventually, let's add completed and queued

def byterange(s):
    m = re.compile(r'bytes=(\d+)-(\d+)?$').match(s)
    return int(m.group(1)), int(m.group(2))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.startswith('/tiles') or self.path.startswith('/fonts'):
            self.send_header('Access-Control-Allow-Origin', '*')
        http.server.SimpleHTTPRequestHandler.end_headers(self)

    def translate_path(self, path):
        return http.server.SimpleHTTPRequestHandler.translate_path(self,'./' + path)

    def log_message(self, fmt, *args):
        print_err(fmt % args)

    def go_internal_get(self, url):
        pass_through_headers = {
            header: self.headers[header]
            for header
            in ['X-Sandstorm-User-Id', 'X-Sandstorm-Permissions']
        }
        return requests.get(url, headers=pass_through_headers)

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        permissions = get_permissions(self.headers)
        if url.path == '/app/bookmark':
            if 'bookmarks' not in permissions:
                self.send_response(HTTPStatus.FORBIDDEN)
                self.end_headers()
                return

            # TODO - validate this input! When I move to Go.
            bookmark = json.loads(self.rfile.read(int(self.headers['Content-Length'])))

            if 'id' in bookmark:
                new_bookmark = update_bookmark(bookmark)
                if new_bookmark is None:
                    # Someone else made an edit at the same time. Let em know
                    self.send_response(HTTPStatus.CONFLICT)
                    self.end_headers()
                    return
            else:
                new_bookmark = insert_bookmark(bookmark)

            bookmark_id = new_bookmark.pop('id')

            self.send_response(HTTPStatus.OK)
            self.end_headers()
            self.wfile.write(bytes(json.dumps([bookmark_id, new_bookmark]), "utf-8"))

        # TODO - should be a DELETE request but I didn't want to figure it out
        if url.path == '/app/bookmark-delete':
            if 'bookmarks' not in permissions:
                self.send_response(HTTPStatus.FORBIDDEN)
                self.end_headers()

            bookmark = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            bookmark_id = bookmark.get('id')
            if bookmark_id is None:
                self.send_response(HTTPStatus.NOT_FOUND)
                self.end_headers()
                return

            delete_bookmark(bookmark_id)

            self.send_response(HTTPStatus.OK)
            self.end_headers()

        if url.path == '/app/map-delete':
            if 'download' not in permissions:
                self.send_response(HTTPStatus.FORBIDDEN)
                self.end_headers()
                return

            self.send_response(HTTPStatus.OK)
            self.end_headers()

            tile_id = json.loads(self.rfile.read(int(self.headers['Content-Length'])))['tile-id']

            if tile_id == "all":
                tile_ids = [fname.split('.pmtiles')[0] for fname in filemaps]
            else:
                tile_ids = [tile_id]

            for tile_id in tile_ids:
                download_queue.add((tile_id, DELETE))

        if url.path == '/app/download-map':
            if 'download' not in permissions:
                self.send_response(HTTPStatus.FORBIDDEN)
                self.end_headers()
                return

            self.send_response(HTTPStatus.OK)
            self.end_headers()

            tile_id = json.loads(self.rfile.read(int(self.headers['Content-Length'])))['tile-id']
            download_queue.add((tile_id, DOWNLOAD))

        if url.path == '/app/download-manifest':
            if 'download' not in permissions:
                self.send_response(HTTPStatus.FORBIDDEN)
                self.end_headers()
                return

            self.send_response(HTTPStatus.OK)
            self.end_headers()

            if manifest is None:
                download_queue.add(DOWNLOAD_MANIFEST)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path.endswith('bookmarks'):
            self.send_response(HTTPStatus.OK)
            self.end_headers()
            self.wfile.write(bytes(json.dumps(get_all_bookmarks()), "utf-8"))
            return

        if url.path == '/app/search':
            # TODO - if the query has & or # I think it messes things up? need encoding.
            qs = urllib.parse.parse_qs(url.query)
            search_query = query.query(query.search_normalize(qs['q'][0]))
            lat_mid = float(qs['lat'][0])
            lng_mid = float(qs['lng'][0])
            results = []

            if search_query:
                con = sqlite3.connect(search_db_path)
                cur = con.cursor()


                # Nearby results, ordered by *distance*. I tried combining rank and distance:
                # ORDER BY rank + (lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)
                # But I don't see any improvement in quality, and the distance aspect is way worse.
                #
                # But I didn't spend a lot of time. Maybe there's a smarter way. And maybe people
                # will see problems in quality here.
                q_results = cur.execute(
                    """
                    SELECT name, lat, lng, tile_id
                    FROM locations
                    WHERE locations MATCH ?

                    -- Distance squared; faster to determine than distance
                    ORDER BY (lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)

                    LIMIT 50
                    """,
                    (search_query, lat_mid, lat_mid, lng_mid, lng_mid),
                )
                PUNCTUATION_SPACE = '\u2008'
                BASEMAP_MARKER = PUNCTUATION_SPACE + PUNCTUATION_SPACE
                for name, lat, lng, tile_id in q_results:
                    if tile_id == BASEMAP_TILE:
                        # Super hack. An invisible marker indicating that this
                        # is a base map location. The front end will treat it a
                        # little differently. Eventually we should figure out
                        # how to pass arbitrary fields. We'll need it for
                        # passing address information etc.
                        name += BASEMAP_MARKER
                    # Ex: [{"loc":[41.57573,13.002411],"title":"Some establishment name"}]
                    results.append({
                        "title": name, "loc": [lat, lng], "tile_id": tile_id,
                    })

                # Temporary solution: dedupe on the server side, so we always
                # pick the first (thus nearest) instance of something.
                # Otherwise, the front end seems to dedupe it by picking
                # something other than the first result. "Starbucks" is an
                # obvious example where this is useful.
                #
                # TODO Change or eliminate the front end deduper, and this
                # deduper. Instead, send address or other qualifier with each
                # result, to distinguish different "Starbucks" or what have
                # you, and display it in the search results.
                deduped_results = []
                used_titles = set()
                for result in results:
                    if result['title'] not in used_titles:
                        used_titles.add(result['title'])
                        deduped_results.append(result)
                results = deduped_results

            self.send_response(HTTPStatus.OK)
            self.end_headers()
            self.wfile.write(bytes(json.dumps(results), "utf-8"))
            return

        if url.path.endswith('map-download-status'):
            self.send_response(HTTPStatus.OK)
            self.end_headers()

            response = self.go_internal_get(INTERNAL_TUTORIAL_URL)
            if response.status_code != 200:
                raise Exception("Error getting tutorial mode", response.status_code)

            tutorial_mode = response.text

            available_areas_status = ""
            if manifest_error:
                available_areas_status = "error"
            elif DOWNLOAD_MANIFEST in download_queue:
                available_areas_status = "started"

            full_status = {
                # This tells the UI that the areas defined in the bounds are available for download
                "available-areas": get_bounds_map(),
                "available-areas-status": available_areas_status,
                "in-progress": map_update_status,
                "queued-for-download": [
                    dl[0] for dl
                    in download_queue
                    if dl != DOWNLOAD_MANIFEST and dl[1] == DOWNLOAD
                ],
                "queued-for-deletion": [
                    dl[0] for dl
                    in download_queue
                    if dl != DOWNLOAD_MANIFEST and dl[1] == DELETE
                ],
                "done": [fname.split('.pmtiles')[0] for fname in filemaps],
                "tutorial-mode": tutorial_mode,
                "permissions": get_permissions(self.headers),
            }
            self.wfile.write(bytes(json.dumps(full_status), "utf-8"))
            return

        # KMZ so that stupid browsers (Safari on iPad) don't try to display the XML text and confuse the user
        if url.path.endswith('export.kmz'):
            with tempfile.TemporaryDirectory(prefix=big_tmp_dir + "/") as tmp_zip_dir:
                kml_path = os.path.join(tmp_zip_dir, "doc.kml")
                kmz_path = os.path.join(tmp_zip_dir, "export.kmz")
                open(kml_path, "wb").write(bytes(kml(), "utf-8"))
                with zipfile.ZipFile(kmz_path, "w") as zf:
                    zf.write(kml_path, "doc.kml")
                self.send_response(HTTPStatus.OK)
                self.send_header('Content-Disposition', 'attachment;filename=export.kmz')
                self.send_header('Content-Type', 'application/vnd.google-earth.kmz')
                self.end_headers()
                self.wfile.write(open(kmz_path, "rb").read())
            return

        # We need to do this via the app only because of the sandstorm range request workaround
        if url.path.endswith('.pmtiles'):
            fname = url.path.split('/')[-1]
            qs = urllib.parse.parse_qs(url.query)
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header('Content-Type','application/pbf')
            # Hack, until we get range headers in Sandstorm
            if 'rangeFirst' in qs:
                first, last = int(qs['rangeFirst'][0]), int(qs['rangeLast'][0])
            else:
                first, last = 0, len(filemaps[fname])
            # In case we want to go back to the original for a second
            #first, last = byterange(self.headers['Range'])
            self.send_header('Content-Length',str(last-first+1))
            self.end_headers()
            self.wfile.write(filemaps[fname][first:last+1])
            return

        # Only do this path for local, use nginx for sandstorm
        if url.path.endswith('.geojson') and is_local:
            fname = url.path.split('/')[-1]
            qs = urllib.parse.parse_qs(url.query)
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header('Content-Type','application/json')

            # TODO If I just set Content-Encoding to gzip instead of
            # decompressing, it works on Firefox. However I don't know if
            # the standard javascript "fetch API" accepts gzip encoding by
            # default on all browsers. Need to investigate.
            with gzip.open(os.path.join("base-map", fname) + '.gz', 'rb') as geojson_file:
                self.end_headers()
                self.wfile.write(geojson_file.read())
            return

        # Only do this path for local, use nginx for sandstorm
        if ('assets' in url.path or 'index.html' in url.path or url.path == '/') and is_local:
            f = self.send_head()
            if f:
                try:
                    self.copyfile(f, self.wfile)
                finally:
                    f.close()

        self.send_response(HTTPStatus.NOT_FOUND)
        self.end_headers()
        return

def kml():
    beginning = '\n'.join([
        """<?xml version="1.0" encoding="UTF-8"?>""",
        """<kml xmlns="http://www.opengis.net/kml/2.2">"""
    ])
    end = "</kml>"

    # Quotes need to be escaped
    def escape_attribute(text):
        return (
            text
            .replace('"', '&quot;')
            .replace('\'', '&apos;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('&', '&amp;')
        )

    # Quotes should not be escaped
    def escape_element_data(text):
        return (
            text
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('&', '&amp;')
        )

    def make_placemark(entry):
        name = escape_element_data(entry['name'])
        lat = entry['latlng']['lat']
        lng = entry['latlng']['lng']

        # TODO - user defined description when we add that field
        # description = escape_element_data(entry['description'])
        description = ""

        return """
  <Placemark>
    <name>{name}</name>
    <description>{description}</description>
    <Point>
      <coordinates>{lng},{lat}</coordinates>
    </Point>
  </Placemark>""".format(name=name, lat=lat, lng=lng, description=description)

    bookmarks = [
        dict(bookmark, id=bookmark_id)
        for bookmark_id, bookmark
        in get_all_bookmarks().items()
    ]

    return beginning + "".join(map(make_placemark, bookmarks)) + "\n" + end

class ThreadingSimpleServer(ThreadingMixIn, http.server.HTTPServer):
    pass

def get_tile_fnames():
    return [os.path.split(fpath)[1] for fpath in glob.glob(os.path.join(tile_dir, '*.pmtiles'))]

def update_filemaps():
    global filemaps

    files = {fname: open(os.path.join(tile_dir, fname), 'r+b') for fname in get_tile_fnames()}
    filemaps = {
        fname: mmap.mmap(f.fileno(), 0)
        for (fname, f)
        in files.items()
    }

class DownloadError(Exception):
    pass

def download_file(fname):
    global powerbox_ready

    if LOCAL_DATA:
        class DummyResponse:
            def __init__(self):
                path = os.path.join(os.path.dirname(__file__), 'generate-data/output/', DL_VERSION, fname)
                print_err("Fake downloading: ", path)
                with open(path, "rb") as f:
                    self.content = f.read()
                    self.status_code = 200

            def json(self):
                return json.loads(self.content)
        return DummyResponse()
    else:
        # Wait for powerbox to start if it hasn't
        while not (powerbox_ready or os.path.exists(POWERBOX_CA_CERT_PATH)):
            print_err ("waiting for powerbox-http-proxy to start")
            time.sleep(0.1)

        # Set it to a global variable so we don't read the filesystem constantly
        powerbox_ready = True

        params = {}
        if not is_local:
            params = {"verify": '/var/powerbox-http-proxy.pem'}

        MAX_TRIES = 7

        for try_num in range(MAX_TRIES):
            response = requests.get(DL_URL_DIR + fname, **params)

            if response.status_code == 200:
                return response

            print_err(f"error downloading {fname}, got {response.status_code}. trying again")
            sleep_time = (
                2 ** try_num *           # Retry less and less often
                random.randint(20, 30) * # Good practice to randomize backoff so clients don't all come crashing in at once
                0.005                    # Scale it back overall. This makes it ~8 seconds for the longest wait.
            )
            time.sleep(sleep_time)

        raise DownloadError(f"Failed {MAX_TRIES} times", response)

def download_manifest():
    global manifest
    manifest = download_file('manifest.json').json()
    json.dump(manifest, open(manifest_path, "w"))

def get_bounds_map(): # {area-key: area_bounds}
    if manifest is None:
        return None

    return {
        tile_id: item['bounds']
        for (tile_id, item)
        in manifest.items()
    }

def download_map(tile_id):
    tiles_out_path = os.path.join(tile_dir, tile_id + '.pmtiles')

    if os.path.exists(search_imported_marker_path(tile_id)):
        # TODO Obviously in the future we'll have updates and stuff. This is for the first release.
        print_err ("Already have " + tile_id)
        return

    print_err("downloading", tile_id)

    # TODO - get range headers working. how does ttrss do it? But for now we split the files and that's pretty convenient. Gives us easy progress updates too.
    # TODO - manifest eventually gets title and coordinates as well, and we put it on the map based on that
    # TODO - make tile_id the thing that's passed around instead of fname (already getting there...)
    files = manifest[tile_id]['files']

    map_update_status[tile_id] = {
        "downloadDone": 0,
        "downloadTotal": len(files),
        "downloadError": False,
    }

    with tempfile.TemporaryDirectory(prefix=big_tmp_dir + "/") as tmp_dl_dir:
        tmp_dl_path = os.path.join(tmp_dl_dir, tile_id + '.tar.gz')
        for num_got, f in enumerate(files, 1):
            try:
                r = download_file(f)
            except DownloadError as de:
                print_err("\n\nDownloader exception for map file part", repr(de), '\n\n')
                raise

            # write as append
            with open(tmp_dl_path, "ab") as f:
                f.write(r.content)

            map_update_status[tile_id]['downloadDone'] = num_got
            print_err("Downloaded map file part", tile_id, num_got)

        # TODO - Put a md5sum in there somewhere for integrity since I'm getting parts. Something could get screwed up.
        print_err("Downloaded", tile_id, "! Now extracting...")

        with tempfile.TemporaryDirectory(prefix=big_tmp_dir + "/") as tmp_extract_path:
            with tarfile.open(tmp_dl_path, 'r|gz') as tar_f:
                tar_f.extractall(tmp_extract_path)
            print_err("Extracted")

            import_search(tile_id, os.path.join(tmp_extract_path, 'pkg', 'search.csv'), True)

            # Do this second, so that it doesn't show up on the map until search is imported.
            #   (especially important in case of error)
            # Also, it needs to be in filemaps for it to work anyway.
            shutil.move(os.path.join(tmp_extract_path, 'pkg', 'tiles.pmtiles'), tiles_out_path)

            # For the "already downloaded" check above. We may want a better plan later.
            with open(search_imported_marker_path(tile_id), "w"):
                pass

    update_filemaps()
    print_err("Downloaded and extracted", tile_id, "to", tiles_out_path, "and search imported to sqlite db")

def delete_map(tile_id):
    print_err("deleting", tile_id)

    tiles_out_path = os.path.join(tile_dir, tile_id + '.pmtiles')

    if not os.path.exists(search_imported_marker_path(tile_id)):
        print_err ("Already deleted, or never had, " + tile_id)
        return

    # Inverse reasoning from downloads; delete the visible map first, so as to
    # not leave the impression that it's there when it's partially deleted (in
    # case of failure). Search results would still return, but we'll consider
    # that less bad.
    if os.path.exists(tiles_out_path):
        os.remove(tiles_out_path)

    delete_search(tile_id)

    # Delete this last (and use it as the "done" marker above) because it stops
    # us from downloading this same file if we're in the middle of deleting it.
    if os.path.exists(search_imported_marker_path(tile_id)):
        os.remove(search_imported_marker_path(tile_id))

    if tile_id in map_update_status:
        # No longer "queued for deletion", it's just gone
        del map_update_status[tile_id]

    update_filemaps()
    print_err("Deleted", tile_id, "from", tiles_out_path, "and search deleted from sqlite db")

# A single download and delete queue to avoid annoying race conditions. Even if
# this comes at the cost of being a little slower in some ways. We'll do it
# better in Go later.

# TODO - save the queue to disk so we can continue after restart
# TODO - handle errors in a nice enough way that we don't mind keeping them in
#        the queue forever. It doesn't need to be retrying forever by default,
#        but the intention to download the given region should be saved so that
#        the user can decide to try it again.
DOWNLOAD_MANIFEST = 'DOWNLOAD_MANIFEST'
DELETE = 'DELETE'
DOWNLOAD = 'DOWNLOAD'
download_queue = set()
DOWNLOAD_TRIES = 7
def downloader():
    global manifest_error

    while True:
        while not download_queue:
            time.sleep(0.1)

        download_item = download_queue.pop()
        if download_item == DOWNLOAD_MANIFEST:
            try:
                download_manifest()
            except DownloadError as de:
                print_err("\n\nDownloader Exception for manifest", repr(de), '\n\n')
                manifest_error = True
        else:
            tile_id, action = download_item
            if action == DOWNLOAD:
                try:
                    download_map(tile_id)
                except DownloadError:
                    map_update_status[tile_id]['downloadError'] = True
            elif action == DELETE:
                # Not gonna bother with delete errors. Less common, extra complication.
                delete_map(tile_id)
            else:
                raise Exception("Unexpected action: " + action)

if __name__ == "__main__":
    print_err("Serving files at http://localhost:3857/ - for development use only")
    httpd = ThreadingSimpleServer(("", 3857), Handler)
    files = {} # in case of error on the first line of the try block!
    try:
        update_filemaps()
        threading.Thread(target=downloader).start()
        import_basemap_search()
        httpd.serve_forever()
    except:
        raise
    finally:
        httpd.server_close()
        [f.close() for f in files.values()]
