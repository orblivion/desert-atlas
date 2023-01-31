# 2023/01/31 - appVersion 9

* Switch search import format to csv
* Offer 3 entire U.S. states: IL, MA, NH (not just small regions).
  * Caveat 1: To get such big regions, I generate my own tiles now instead of downloading manually from Protomaps' website. However this required a fair amount of playing with how the data is represented. I now deem it *passable* but it could use a lot of improvement. See generate-data/ directory for details.
  * Caveat 2: The search data that I put in the CSV *only includes nodes* (points) for the time being. I have to figure out how to get the data I need out of the ways (lines and areas), which will include buildings and streets.
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
