Desert Atlas is a general purpose fully self-hosted map app for Sandstorm based on OpenStreetMap. It provides the basic functionality of sites like Google Maps while respecting privacy. You can plan trips with friends, store important locations, and export your destinations to a convenient phone application like OrganicMaps for navigation.

Some self-hosted OpenStreetMap apps for the web will get underlying map data from external sources on-demand. This is a tradeoff: it offloads a lot of development work, and the maps are high quality, but it will leak a small amount of usage patterns to the providers of those maps, and will make you dependent on their services. With Desert Atlas, all of the map data is *fully self-hosted* in your Sandstorm grain, in the same way that OrganicMaps fully holds regions of the map on your phone. The map data needs to come from somewhere of course, but you download it in bulk, which is a much smaller concession to privacy. You only need to download the regions you need (each about the size of a US state) once to set up each grain and periodically after that to keep your map data up-to-date.

# Warnings and Limitations

## Performance and Disk space

With this app, you download areas of the map to the grain. Because of the tools currently used to prepare this data, the size of the data on your grain can get quite large. Individual areas might range from 10s of megs to almost 250 megs. In the future we will hopefully be able to divide the areas in a more reasonable way.

The size on disk will not neatly correlate with the geographical size of the area downloaded. For instance, major cities tend to take up more space.

This also translates to a fair amount of virtual memory usage on the server, though it seems to be reasonably well behaved as far as RAM. However performance in the browser does start to get worse with a lot of downloaded areas.

In all, it's recommended for the time being to be mindful of how many areas are downloaded in a single grain.

## Searching addresses

Full addresses are not yet searchable. Street names are searchable, however.

## Searching non-latin

As far as I can tell, searching in non-latin characters is not yet supported.

# Thanks

How is all this pulled off? In short, it uses the "simplest version of everything". Many thanks to creators of the many tools that are strung together to make this happen:

* [Protomaps](https://protomaps.com) (vector based rendering in browser, converting mbtiles to pmtiles)
* [Sqlite FTS5](https://www.sqlite.org/fts5.html) (full text search)
* [Osmium / PyOsmium](https://osmcode.org/pyosmium/) (Extracting search data from raw OSM data)
* [Tilemaker](https://github.com/systemed/tilemaker/) (Converting raw OSM data to mbtiles)
* [Leaflet](https://leafletjs.com/) (UI framework)
* [MKGMap](https://www.mkgmap.org.uk/download/splitter.html) (Splitting the planet into sizeable chunks)
* [Geofabrik](https://shortbread.geofabrik.de/schema/) (Legally permissive schema that I modify to work with Protomaps)
* Whoever is invloved in generating the raw OSM data, I don't even know where to begin with all of that.

I may have even missed one or two, apologies if so!

# Feedback

This is still a very basic version of what the app could become. There's a lot of ways this could be made more useful. Try it out and feel free to chime in with what doesn't work well for you, or what feature you might like to see. You can post on the Sandstorm groups, my email address, or file a feature request or bug report on Github. The more feedback I get (positive or negative) the more I know it's worth spending time on this!
