Desert Atlas is a general purpose fully self-hosted map app for Sandstorm based on OpenStreetMap. It provides the basic functionality of sites like Google Maps while respecting privacy. You can plan trips with friends, store important locations, and export your destinations to a convenient phone application like Organic Maps for navigation.

Some OpenStreetMap web apps that are self-hosted will still use third party services such as openstreetmap.org *on-demand* to display the underlying map and perform searches. Those maps are high quality, but this leaks some of your usage patterns to their servers and will generally make you dependent on their services. With Desert Atlas, all of the map and search data is *fully self-hosted* in your Sandstorm grain, in the same way that Organic Maps fully holds regions of the map on your phone.

The map data needs to come from somewhere, of course. Desert Atlas has a map data service (built on an S3-compatible service). Just like with Organic Maps, Desert Atlas lets you download the regions of the map that you need. The regions are saved to your grain. Each region is about the size of a small country, and you only need to do it on occasion to set up a new grain or stay up-to-date. This gives the map data server much less information about what you're doing than a third-party service that is called on-demand.

# Warnings and Limitations

## Performance and Disk space

At the moment, the file size of some the regions available for download to your grain can get quite large. Individual areas might range from 10s of megs to almost 250 megs. In the future we will hopefully be able to divide the areas in a more reasonable way.

The size on disk will not neatly correlate with the geographical size of the area downloaded. For instance, major cities tend to take up more space.

This also translates to a fair amount of virtual memory usage on the server, though it seems to be reasonably well behaved as far as RAM. However performance in the browser does start to get worse with a lot of downloaded areas.

In all, it's recommended for the time being to be mindful of how many areas are downloaded in a single grain.

## Searching addresses

Full addresses are not yet searchable. Street names are searchable, however.

## Searching non-Latin

As far as I can tell, searching in non-Latin characters is not yet supported.

# Thanks

How is all this pulled off? In short, while openstreetmap can get complicated, Desert Atlas uses the "simplest version of everything". Many thanks to the creators of the many tools that are strung together to make this happen. [See here](https://github.com/orblivion/desert-atlas/#licensescredit) for the details. If you're familiar with some of these components and would like to help, [see here](https://github.com/orblivion/desert-atlas/wiki/Where-to-help).

# Feedback

This is still a very basic version of what the app could become. There are a lot of ways this could be made more useful. Try it out and feel free to chime in with what doesn't work well for you, or what feature you might like to see. You can post on the [Sandstorm groups](https://groups.google.com/g/sandstorm-dev), [Github discussions](https://github.com/orblivion/desert-atlas/discussions), or file a [feature request or bug report](https://github.com/orblivion/desert-atlas/issues) on Github. The more feedback I get (positive or negative) the more I know it's worth spending time on this!
