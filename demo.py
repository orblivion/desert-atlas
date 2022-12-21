#!/usr/bin/env python3
import os, sys, glob, urllib.parse, tempfile, gzip, json, uuid, requests, tarfile, time, threading, shutil, sqlite3, zipfile

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

if is_local:
    # Can't mess with var if not in sandstorm
    # TODO - allow param to be set to save it, and a different param for this. require one or the other.
    basedir = tempfile.TemporaryDirectory().name
else:
    basedir = '/var'

big_tmp_dir = os.path.join(basedir, 'big_tmp') # since /tmp/ runs out of space. TODO - empty on startup for bad failures that don't clean up
tile_dir = os.path.join(basedir, 'tiles')

search_imported_marker_dir = os.path.join(basedir, 'search_imported')

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

# TODO - The downloads be a csv with only the data we need. We might even be able
#   to import it with sqlite's csv import feature. However:
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
    map_update_status[tile_id]['searchImportTotal'] = os.path.getsize(search_import_fname)
    map_update_status[tile_id]['searchImportDone'] = 0
    with gzip.open(search_import_fname, 'r') as gzip_f:
        for line in gzip_f:
            map_update_status[tile_id]['searchImportDone'] = gzip_f.fileobj.tell()
            location = json.loads(line.decode('utf-8'))
            if 'name' in location:
                # TODO - Deal with duplicates somehow. There seem to be
                # address points and poi points. I guess we probably want
                # to collect all of that eventually into one entry, though.

                # TODO cur.executemany? I'm afraid that it might OOM. Can it
                # work with a generator though?
                cur.execute(
                    'INSERT INTO locations VALUES (?, ?, ?, ?, ?)',
                    (
                        location['name'],
                        query.search_normalize_save(location['name']),
                        tile_id,
                        location["center_point"]["lat"],
                        location["center_point"]["lon"],
                    ),
                )
            else:
                pass
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
        permissions = self.headers['X-Sandstorm-Permissions'].split(',')
        if url.path == '/bookmark':
            if 'bookmarks' not in permissions:
                self.send_response(HTTPStatus.Forbidden)
                self.end_headers()
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
            download_queue.add(tile_id)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == '/app.js':
            permissions = self.headers['X-Sandstorm-Permissions'].split(',')
            with open(bookmarks_path) as f:
                bookmarks = json.load(f)

            self.send_response(HTTPStatus.OK)
            self.end_headers()

            bounds = "null"
            print_err([b for b in bookmarks])
            if bookmarks:
                bounds = repr([
                    min(b['latlng']['lat'] for b in bookmarks.values()) - .001,
                    min(b['latlng']['lng'] for b in bookmarks.values()) - .001,
                    max(b['latlng']['lat'] for b in bookmarks.values()) + .001,
                    max(b['latlng']['lng'] for b in bookmarks.values()) + .001,
                ])

            with open('app.js') as f:
                content = (
                    f.read()
                    .replace("#BOOKMARKS", bounds)
                    .replace("#PERMISSIONS", repr(permissions))
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
            results = []

            if search_query:
                con = sqlite3.connect(search_db_path)
                cur = con.cursor()
                q_results = cur.execute(
                    "SELECT name,lat,lng from locations WHERE locations MATCH ? ORDER BY rank LIMIT 50",
                    (search_query,),
                )

                for name, lat, lng in q_results:
                    # Ex: [{"loc":[41.57573,13.002411],"title":"Some establishment name"}]
                    results.append({
                        "title": name, "loc": [lat, lng],
                    })

            self.send_response(HTTPStatus.OK)
            self.end_headers()
            self.wfile.write(bytes(json.dumps(results), "utf-8"))
            return

        # TODO - we can probably merge list-tiles and map-download-status

        if url.path.endswith('list-tiles'):
            self.send_response(HTTPStatus.OK)
            self.end_headers()
            self.wfile.write(bytes(json.dumps(list(filemaps.keys())), "utf-8"))
            return

        if url.path.endswith('map-download-status'):
            self.send_response(HTTPStatus.OK)
            self.end_headers()
            full_status = {
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
                self.send_header('Content-Disposition', 'attachment; filename=export.kmz')
                self.end_headers()
                self.wfile.write(open(kmz_path, "rb").read())
            return

        # TODO - only do this path for local. we should use nginx for sandstorm
        if url.path.endswith('.pmtiles'):
            fname = url.path.split('/')[-1]
            qs = urllib.parse.parse_qs(url.query)
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header('Content-type','application/pbf')
            first, last = int(qs['rangeFirst'][0]), int(qs['rangeLast'][0])
            # Hack, until we get range headers in Sandstorm
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
            self.send_header('Content-type','application/json')
            self.end_headers()
            self.wfile.write(open(os.path.join("base-map", fname), 'rb').read())
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

# TODO - map + search "index" in one file
def download_map(tile_id):
    tiles_out_path = os.path.join(tile_dir, tile_id + '.pmtiles')
    search_imported_marker_path = os.path.join(search_imported_marker_dir, tile_id)

    dl_url_dir = 'https://danielkrol.com/assets/tiles-demo/'

    if os.path.exists(tiles_out_path) and os.path.exists(search_imported_marker_path):
        # TODO Obviously in the future we'll have updates and stuff. This is for the demo.
        print_err ("Already have " + tile_id)
        return

    print_err("downloading", tile_id)

    params = {}
    if not is_local:
        params = {"verify": '/var/powerbox-http-proxy.pem'}

    # TODO - get range headers working. how does ttrss do it? But for now we split the files and that's pretty convenient. Gives us easy progress updates too.
    # TODO - manifest eventually gets title and coordinates as well, and we put it on the map based on that
    # TODO - make tile_id the thing that's passed around instead of fname (already getting there...)
    files = requests.get('https://danielkrol.com/assets/tiles-demo/manifest.json', **params).json()[tile_id]['files']

    map_update_status[tile_id] = {
        "downloadDone": 0,
        "downloadTotal": len(files),
    }

    with tempfile.TemporaryDirectory(prefix=big_tmp_dir + "/") as tmp_dl_dir:
        tmp_dl_path = os.path.join(tmp_dl_dir, tile_id + '.tar.gz')
        for num_got, f in enumerate(files, 1):
            dl_url = dl_url_dir + f
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

            # The tar we will download has the tile_id as a dir in its tree
            # TODO - Reflect progress on this in the download status somehow.
            #   Right now it takes a couple seconds with no UI feedback.
            import_search(tile_id, os.path.join(tmp_extract_path, tile_id, 'search'))

            # Do this second, so that it doesn't show up on the map until search is imported.
            #   (especially important in case of error)
            # Also, it needs to be in filemaps for it to work anyway.
            shutil.move(os.path.join(tmp_extract_path, tile_id, 'tiles'), tiles_out_path)

            # For the "already downloaded" check above. We may want a better plan later.
            with open(search_imported_marker_path, "w"):
                pass

    update_filemaps()
    print_err("Downloaded and extracted", tile_id, "to", tiles_out_path, "and search imported to sqlite db")

# TODO - save the queue to disk so we can continue after restart
download_queue = set()
def downloader():
    while True:
        while not download_queue:
            time.sleep(0.1)
        tile_id = download_queue.pop()
        try:
            download_map(tile_id)
        except Exception as e:
            # Probably could do this smarter
            print_err("\n\nDownloader Exception", repr(e), '\n\n')
            download_queue.add(tile_id)
            time.sleep(1)

threading.Thread(target=downloader).start()

if __name__ == "__main__":
    print_err("Serving files at http://localhost:3857/ - for development use only")
    httpd = ThreadingSimpleServer(("", 3857), Handler)
    files = {} # in case of error on the first line of the try block!
    try:
        update_filemaps()
        httpd.serve_forever()
    except:
        raise
    finally:
        httpd.server_close()
        [f.close() for f in files.values()]
