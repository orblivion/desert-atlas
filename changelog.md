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
