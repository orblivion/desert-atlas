# 2023/08/22 - appVersion 25

* Make it so that you can easily double-click zoom on the downloadable regions when they're in view without bringing up the popup.
  * Delays the popup by .4 seconds to make sure you're not doubleclicking
  * Take #16 out of Launch milestone
* Deleting single area, or all areas. #38 done
* "Are you sure you want to delete this bookmark?" #40 done
* Delete old tmp data on startup. Surprised I forgot this. Save a lot of space!

# 2023/08/11 - appVersion 24

* Handle all manner of non-driving paths (walking, cycling, agricultural) differently.
  * Previously was treated as a "minor roads" and appeared driveable
  * Added a new primitive to protomaps.js that shows up as dark red dotted lines
  * Updated map as of Aug 11
  * Addresses part of #19; enough to take it out of the Launch milestone
* Mobile usability - Completing #29
  * Make bookmarks paginated instead of scrolling
    * It was impossible to scroll on mobile; mouse events for Leaflet Controls are hard
  * Deselect search input when clicking on a search result
    * Mobile keyboard was still out after clicking a search result, blocking what I just searched for
* Downloadable region rectangles
  * Fix a bug introduced in appVersion 23 that kept creating more and more rectangle elements
    * Symptoms were 1) green rectangle not disappearing 2) download indicators were screwed up
  * Hide the rectangles immediatly after zooming instead of waiting for the update request loop

# 2023/08/04 - appVersion 23

* Bugfix: Searching for basemap cities as a non-downloader was broken
* Split Bookmark popup:
  * Add Lat/Lng info in case the user wants it.
    * Very basic part of #24. Will add address later; a lot more useful but a lot more work.
  * Add a warning about geo: links. I heard something on Mastodon about it triggering web searches, and I got nervous about privacy.
  * Split into collapsable sections to make room for all of this stuff, especially for small mobile.
  * Error messages for saving and deleting.
* Bookmarks now in sqlite3 databases
  * Stop editing conflicts with a new "version" field. If two people edit the same bookmark, give an error for the second editor telling them to reload first.
  * Generally good for clobber-prevention inherent to just using a file.
  * Legacy bookmarks are auto-migrated, and the old json file kept around just in case.
* Bugfix #21: Fast subsequent edits on new bookmarks were creating more new bookmarks
* Code cleanup #37 - Wanted to remove a global variable but I think I just hid it. Still, code is in a better state.
* Add annoying caveat about data quality to the attribution section.
  * Please let me know if this is unbearable on mobile.

# 2023/07/21 - appVersion 22

Boring stuff

* Exponential backoff (#35) for all requests
* Update attribution with a warning (this could be really ugly on mobile, this is a bit of a test)
* Correct use of `geo:` links. This seems to improve interop with some apps. At least it worked for me on StreetComplete, whereas the old one didn't work there.

# 2023/07/21 - appVersion 21

* The entire planet is now available
  * Point app to this updated data
  * Updated map generation process in the repository
  * Regions can range from 10s of MB to 250 MB - not ideal but it's not straightforward to improve
* Files now serving from S3
  * Powerbox asks for `share-a-map.us-east-1.linodeobjects.com` instead of `danielkrol.com`
  * build process includes uploading to S3

# 2023/06/07 - appVersion 20

* Interactive Tutorial
* Wording tweaks for pkgdef
* Fix permissions bugs
* Add one more attribution, and a warning about map quality in the attribution list

# 2023/06/07 - appVersion 19

* Base map search: Search for countries, US states, and medium to large cities before downloading any regions. Hopefully it makes it easier to jump to the part of the world you want to download.
    * If you search for a city that isn't in a downloaded region, zoom is set to far out so that you can click to download right away
    * If you search for a city that is in a downloaded region, zoom is set to medium, something city-level
    * If you search for a POI, zoom is set to close up, as before
* Gzip geojson data for basemap. Hopefully shrinks app size slightly.
* Trivial things
    * Don't index "name" field for search; we search based on normalized_name
    * Don't have a description of "Description Goes Here" for each bookmark for export-to-app

# 2023/06/02 - appVersion 18

* Better fix for stubborn search bug where tooltip was showing previous search (#5)
* Give notice that map is read-only for bookmark popups (#27)
* Various other style and wording changes (improvements? you decide.) to bookmark popup menu.
* Cut down polling considerably (#25). I won't spend time optimizing this further until I'm ready to switch to websockets.

Data change (for next data export, which won't be for a little while. Not inherent to this app version):

* Add locations with "office" tag.

# 2023/05/28 - appVersion 17

* Small UI wording tweaks
* Fix search relevance and duplication problems (#9)
    * Sort by proximity to the center of the current view
      * Ignore search match ranking for now. It feels fine for now but we'll see about feedback.
      * Easily done right in sqlite query
    * Return nearest option for duplicates
      * Previously, if you searched "Starbucks", the backend would return multiple results and the front end would dedupe it some way; I'm not sure which one it picked among the dupes. Now, I have the backend dedupe it and return specifically the first one, which is now the nearest one since I sorted by proximity.
      * This is the "Good enough" solution; a better solution would be to return address info in the search results and show multiple Starbuckses.

# 2023/05/27 - appVersion 16

* Fix occasional gateway error on startup
* Base map:
    * Add oceans. Probably makes #3 into a post-launch item.
    * Much better colors for visibility. Fixes #31.
* Bookmark menu now fits in more with the zoom controls
* Mobile-only usability changes (address most of #29):
    * Bookmark menu starts collapsed, to save real estate
        * Bookmark menu flashes when you add a bookmark, so the user understands the connection even when collapsed.
    * Keyboard doesn't come up when you click on a bookmark, to save real estate
    * Hide bookmark menu when you click on a bookmark, so you can actually see the bookmark. Again, real estate.

With all this said, I can't actually confirm that the above mobile-only changes work until I release it to the experimental store, so hypothetically that stuff won't work as advertised.

# 2023/05/14 - appVersion 15

* Get downloadable region definitions over the server instead of hard-coding
    regions. This covers part of #16.
  * The definitions are in manifest.json
  * It asks for download permissions on grain creation. This may be confusing,
    so I'll put a note about this in the onboard tutorial (which will be #18)
* On the map data generation side: I was shown a way to _easily_
  programmatically split a large region into smaller regions. This was
  necessary to get more than a few small regions, as we've had so far. The
  _downside_ is that it splits according to a maximum data size per region, not
  according to administrative boundaries. It's just a bunch of rectangles. As
  such, the regions no longer have names. (I'd like to go back to
  administrative boundaries but I'm taking the fast and easy path for now)
    * The code to generate this data hasn't been formalized, I have yet to
      check it into the repo. I wanted to make a release of this as-is ASAP.
* As of this writing, **all of North America** is available. Now that I've
  implemented this, I could add more areas without updating the app. I'll try
  to cover the rest of the world (and as such complete #4) soon.
* Since the boundaries are rather arbitrary from the user's perspective, I
  **swapped the download pins for clickable rectangles** on the map that show
  the actual region. This covers part of #16 as well.
  * Pending user feedback, I think this and the region definitions change above
    take us far enough to at least remove the "launch" label from #16.

# 2023/04/07 - appVersion 14

* Fix UI caveat related to #13 - Give bookmark popups more padding on the top
  to make room for Learn More expansion.

# 2023/04/07 - appVersion 13

* Fix #17 - Made the map 15 pixels shorter to make sure the attribution shows
  up on the bottom (and it's generally better not to have the scroll bar on the
  right)
* Implement #12 - When you click Save or Delete on a bookmark, show "SAVING
  CHANGES..." until the response actually comes back to confirm it. (This is a
  pet peeve of mine)
* (Hopefully) Implement #13 - Give more info about opening a bookmark in an
  external app. Namely that it only works under specific circumstances. Not
  calling #13 fixed until I get some user feedback since it's subjective.

# 2023/03/31 - appVersion 12

* Don't show the bookmark context menu if you're a read-only user

# 2023/03/31 - appVersion 11

* Fix #5 - Searching twice kept the name of the first result on the marker's tooltip
* Implement #11 - Give up downloading a file after 7 or 8 tries.
  * This is particularly useful if the data is wrong.
  * Otherwise you'd need to restart your grain
* Implement #7 - Allow user to add a marker wherever without searching using context menu
  * Also don't zoom to level 17 every time you add a new marker

# 2023/02/03 - appVersion 10

* "Open location in app" button on Markers. A hopefully smoother alternative to "export bookmarks". Probably works on more apps, maybe even Google Maps?

# 2023/01/31 - appVersion 9

* Switch search import format to csv
* Offer 3 entire U.S. states: IL, MA, NH (not just small regions).
  * Caveat 1: To get such big regions, I generate my own tiles now instead of downloading manually from Protomaps' website. However this required a fair amount of playing with how the data is represented. I now deem it *passable* but it could use a lot of improvement. See generate-data/ directory for details.
  * Caveat 2: ~~The search data that I put in the CSV *only includes nodes* (points) for the time being. I have to figure out how to get the data I need out of the ways (lines and areas), which will include buildings and streets.~~ Fixed in the latest data
* Upgrade protomaps.js (necessary for the newly generated tiles) and leaflet (maybe not necessary but nice to have)
* Bugfix for exporting of .kmz file - Set the content type. Chromium on Android was appending .zip.

# 2022/12/22 - appVersion 8

* Fix start-up zoom to fit only one Pin
* Fix start-up zoom to fit Pins on mobile (low width screen)

# 2022/12/22 - appVersion 7

* Permissions for downloading maps and editing bookmarks
* All bookmark pins visible at the same time
* On startup, zoom to nicely fit all bookmarks (if you have any).
  * This will be nice for sharing read-only, since they'll probably only want to see the pins anyway.
* If you download a map and click on the download pin again, it will now to zoom to that map
* Bookmarks list collapsable (will be a relief on the phone)
* Limit 50 for search results (in case a ton get returned from the db)

# 2022/12/14 - appVersion 6

* Progress bar in UI for search import (to sqlite3).

# 2022/12/14 - appVersion 5

* Use sqlite3 and fts5 for much faster search

# 2022/12/3 - appVersion 4

* Fix XML escaping for KML export. It was unnecessarily escaping quotes for XML _elements_, and I was seeing `Crackskull&apos;` in OrganicMaps

# 2022/10/22 - appVersion 3

* Search marker turns into bookmark marker on save
* Mostly fix bug where clicking on existing bookmark right after zoom doesn't get you to the right place
    * If you click while you're still mid-zoom, it will still be broken

# 2022/10/22 - appVersion 2

* Make search marker not disappear so easily
* Allow search for accented characters (searching "caffe nero" will now find "Caffè Nero")
