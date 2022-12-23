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
