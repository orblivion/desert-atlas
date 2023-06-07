#!/usr/bin/env python3
import csv, os, sys, glob, urllib.parse, tempfile, json, uuid, requests, tarfile, time, threading, shutil, sqlite3, zipfile, gzip
import csv_format

import query

# TODO - actually fix the ssl warnings from the proxy's cert. For now this makes the console unreadable.
import urllib3
urllib3.disable_warnings()

# /var hack. I guess becaues it needs to be writable???
bookmarks_fname = "bookmarks.json"

is_local = len(sys.argv) >= 2 and sys.argv[1] == 'local' # TODO - could check sandstorm env

# Seems Sandstorm console only shows stderr
def print_err(*lines):
    sys.stderr.write(" ".join(str(line) for line in lines) + "\n")
    sys.stderr.flush()

def get_permissions(headers):
    if is_local:
        # local demo gets all permissions
        return ['bookmarks', 'download']
    else:
        return headers['X-Sandstorm-Permissions'].split(',')

if is_local:
    # Can't mess with var if not in sandstorm
    # TODO - allow param to be set to save it, and a different param for this. require one or the other.
    basedir = tempfile.TemporaryDirectory().name
else:
    basedir = '/var'

big_tmp_dir = os.path.join(basedir, 'big_tmp') # since /tmp/ runs out of space. TODO - empty on startup for bad failures that don't clean up
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

bookmarks_path = os.path.join(user_data_dir, bookmarks_fname)

if not os.path.exists(bookmarks_path):
    with open(bookmarks_path, 'w') as f:
        f.write("{}")

BASEMAP_TILE = "base-map"

def import_basemap_search():
    tile_id = BASEMAP_TILE

    # Setting this as a hack so that import_search() doesn't complain.
    # "base-map" should complete before javascript loads anyway.
    # Maybe we can change import_search to not need this later.
    map_update_status[tile_id] = {}

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

            import_search(tile_id, file_path)

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
def import_search(tile_id, search_import_fname):
    con = sqlite3.connect(search_db_path)
    cur = con.cursor()
    cur.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS locations USING fts5(
            name, normalized_name, tile_id UNINDEXED, lat UNINDEXED, lng UNINDEXED
        )
    """)

    print_err ("Putting", tile_id, "into search db")

    # TODO - make a transaction so that on error we roll back the delete and can fall back to previous data
    cur.execute('DELETE from locations where tile_id=?', (tile_id,))
    with open(search_import_fname, 'r') as f:
        map_update_status[tile_id]['searchImportTotal'] = sum(1 for _ in csv.DictReader(f, fieldnames=csv_format.fieldnames))
        map_update_status[tile_id]['searchImportDone'] = 0

        f.seek(0)
        reader = csv.DictReader(f, fieldnames=csv_format.fieldnames)
        for idx, row in enumerate(reader):
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

if sys.version_info.major < 3:
    print_err("demo.py requires python3 or later: python3 demo.py")
    exit(1)
import re
import mmap
import http.server
from socketserver import ThreadingMixIn
from http import HTTPStatus

filemaps = None
bounds_map = None # {area-key: area_bounds}.
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

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        permissions = get_permissions(self.headers)
        if url.path == '/bookmark':
            if 'bookmarks' not in permissions:
                self.send_response(HTTPStatus.Forbidden)
                self.end_headers()
            # TODO - validate this input! When I move to Go.
            bookmark = json.loads(self.rfile.read(int(self.headers['Content-Length'])))

            bookmarkId = bookmark.get('id', str(uuid.uuid1()))
            if 'id' in bookmark:
                del bookmark['id']

            with open(bookmarks_path) as f:
                bookmarks = json.load(f)

            bookmarks[bookmarkId] = bookmark

            with open(bookmarks_path, 'w') as f:
                json.dump(bookmarks, f)

            self.send_response(HTTPStatus.OK)
            self.end_headers()
            self.wfile.write(bytes(json.dumps([bookmarkId, bookmark]), "utf-8"))

        # TODO - should be a DELETE request but I didn't want to figure it out
        if url.path == '/bookmark-delete':
            if 'bookmarks' not in permissions:
                self.send_response(HTTPStatus.Forbidden)
                self.end_headers()
            bookmark = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            bookmarkId = bookmark.get('id', str(uuid.uuid1()))

            with open(bookmarks_path) as f:
                bookmarks = json.load(f)

            del bookmarks[bookmarkId]

            with open(bookmarks_path, 'w') as f:
                json.dump(bookmarks, f)

            self.send_response(HTTPStatus.OK)
            self.end_headers()

        if url.path == '/download-map':
            if 'download' not in permissions:
                self.send_response(HTTPStatus.Forbidden)
                self.end_headers()
            self.send_response(HTTPStatus.OK)
            self.end_headers()

            tile_id = json.loads(self.rfile.read(int(self.headers['Content-Length'])))['tile-id']
            download_queue[tile_id] = DOWNLOAD_TRIES

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == '/app.js':
            permissions = get_permissions(self.headers)

            self.send_response(HTTPStatus.OK)
            self.end_headers()

            with open('app.js') as f:
                content = (
                    f.read()
                    .replace("PERMISSIONS_REPLACE_ME", repr(permissions))
                )
                self.wfile.write(bytes(content, "utf-8"))
            return
        if url.path.endswith('bookmarks'):
            self.send_response(HTTPStatus.OK)
            self.end_headers()
            with open(bookmarks_path) as f:
                self.wfile.write(bytes(f.read(), "utf-8"))
            return

        if url.path == '/search':
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
                #
                # TODO - fix search proximity at the minimum/maximum of lat/lng, where it wraps
                # from -180 to 180 or whatever. Probably need some basic modulo math
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
            full_status = {
                # This tells the UI that the areas defined in the bounds are available for download
                "available-areas": bounds_map,

                "in-progress": map_update_status,
                "queued": list(download_queue),
                "done": [fname.split('.pmtiles')[0] for fname in filemaps],
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

        # TODO - only do this path for local. we should use nginx for sandstorm
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

        # TODO - only do this path for local. we should use nginx for sandstorm
        if url.path.endswith('.geojson'):
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

        f = self.send_head()
        if f:
            try:
                self.copyfile(f, self.wfile)
            finally:
                f.close()

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

        # TODO - user defined description
        description = escape_element_data("Description Goes Here")

        return """
  <Placemark>
    <name>{name}</name>
    <description>{description}</description>
    <Point>
      <coordinates>{lng},{lat}</coordinates>
    </Point>
  </Placemark>""".format(name=name, lat=lat, lng=lng, description=description)

    with open(bookmarks_path, 'r') as f:
        bookmarks = json.load(f).values()

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

DL_URL_DIR = 'https://danielkrol.com/assets/tiles-demo/3/'

# TODO - map + search "index" in one file
def download_bounds_map():
    global bounds_map

    params = {}
    if not is_local:
        params = {"verify": '/var/powerbox-http-proxy.pem'}

    bounds_map = {
        tile_id: item['bounds']
        for (tile_id, item)
        in requests.get(DL_URL_DIR + 'manifest.json', **params).json().items()
    }

def download_map(tile_id):
    tiles_out_path = os.path.join(tile_dir, tile_id + '.pmtiles')

    # TODO - why bother checking for tiles_out_path, that should be implicit
    if os.path.exists(tiles_out_path) and os.path.exists(search_imported_marker_path(tile_id)):
        # TODO Obviously in the future we'll have updates and stuff. This is for the first release.
        print_err ("Already have " + tile_id)
        return

    print_err("downloading", tile_id)

    params = {}
    if not is_local:
        params = {"verify": '/var/powerbox-http-proxy.pem'}

    # TODO - get range headers working. how does ttrss do it? But for now we split the files and that's pretty convenient. Gives us easy progress updates too.
    # TODO - manifest eventually gets title and coordinates as well, and we put it on the map based on that
    # TODO - make tile_id the thing that's passed around instead of fname (already getting there...)
    files = requests.get(DL_URL_DIR + 'manifest.json', **params).json()[tile_id]['files']

    map_update_status[tile_id] = {
        "downloadDone": 0,
        "downloadTotal": len(files),
    }

    with tempfile.TemporaryDirectory(prefix=big_tmp_dir + "/") as tmp_dl_dir:
        tmp_dl_path = os.path.join(tmp_dl_dir, tile_id + '.tar.gz')
        for num_got, f in enumerate(files, 1):
            dl_url = DL_URL_DIR + f
            r = requests.get(dl_url, **params)
            print_err("Downloading part:", r.status_code)
            if r.status_code != 200:
                print_err("error downloading. trying again")
                time.sleep(1) # TODO exponential decay yada yada
                continue

            # write as append
            with open(tmp_dl_path, "ab") as f:
                f.write(r.content)

            map_update_status[tile_id]['downloadDone'] = num_got

        # TODO - Put a md5sum in there somewhere for integrity since I'm getting parts. Something could get screwed up.
        print_err("Downloaded", tile_id, "! Now extracting...")

        with tempfile.TemporaryDirectory(prefix=big_tmp_dir + "/") as tmp_extract_path:
            with tarfile.open(tmp_dl_path, 'r|gz') as tar_f:
                tar_f.extractall(tmp_extract_path)
            print_err("Extracted")

            # TODO - Reflect progress on this in the download status somehow.
            #   Right now it takes a couple seconds with no UI feedback.
            import_search(tile_id, os.path.join(tmp_extract_path, 'pkg', 'search.csv'))

            # Do this second, so that it doesn't show up on the map until search is imported.
            #   (especially important in case of error)
            # Also, it needs to be in filemaps for it to work anyway.
            shutil.move(os.path.join(tmp_extract_path, 'pkg', 'tiles.pmtiles'), tiles_out_path)

            # For the "already downloaded" check above. We may want a better plan later.
            with open(search_imported_marker_path(tile_id), "w"):
                pass

    update_filemaps()
    print_err("Downloaded and extracted", tile_id, "to", tiles_out_path, "and search imported to sqlite db")

# TODO - save the queue to disk so we can continue after restart
# TODO - handle errors in a nice enough way that we don't mind keeping them in
#        the queue forever. It doesn't need to be retrying forever by default,
#        but the intention to download the given region should be saved so that
#        the user can decide to try it again.
download_queue = {}
DOWNLOAD_TRIES = 7
def downloader():
    download_bounds_map()

    while True:
        while not download_queue:
            time.sleep(0.1)
        tile_id = list(download_queue.keys())[0]
        tries_left = download_queue.pop(tile_id)
        if tries_left > 0:
            try:
                download_map(tile_id)
            except Exception as e:
                # Probably could do this smarter
                print_err("\n\nDownloader Exception", repr(e), '\n\n')
                download_queue[tile_id] = tries_left - 1
                time.sleep(1)
        else:
            if tile_id in map_update_status:
                del map_update_status[tile_id]


threading.Thread(target=downloader).start()

if __name__ == "__main__":
    print_err("Serving files at http://localhost:3857/ - for development use only")
    httpd = ThreadingSimpleServer(("", 3857), Handler)
    files = {} # in case of error on the first line of the try block!
    try:
        update_filemaps()
        import_basemap_search()
        httpd.serve_forever()
    except:
        raise
    finally:
        httpd.server_close()
        [f.close() for f in files.values()]
