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
