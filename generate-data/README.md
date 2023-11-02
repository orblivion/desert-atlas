(TODO - finish this stuff. It's WIP, a bit out of order, things changed along the way, etc.)

# Instructions

## Get `tilemaker`, `go-pmtiles`, and mkgmap `splitter`

### Build-from-source option: Build them in the respective submodules inside this directory.

Since they have dependencies I'll give some specific instructions on how to get them. These should work on the specific versions referred to by git submodules.

Note that I may not build everything here from source. While I would ideally like to, I don't place as much value on this than building the actual application that users run.

#### mkgmap splitter

As of now, I don't know how to build this one from source. Skip down to the release downloading option below.

The source code has no README. If you're familiar with building Java applications, please let me know. I'd ideally prefer to build from source, and then maybe check the source into this repo since it's in an SVN repo on their own website:

http://svn.mkgmap.org.uk/splitter/trunk

More documentation:

https://www.mkgmap.org.uk/doc/splitter.html

#### tilemaker

_(let me know if I left something out!)_

I think this works on Debian 11. Install build dependencies:

```
apt install build-essential libboost-dev libboost-filesystem-dev libboost-iostreams-dev libboost-program-options-dev libboost-system-dev liblua5.1-0-dev libprotobuf-dev libshp-dev libsqlite3-dev protobuf-compiler rapidjson-dev
```

In the `tilemaker` directory, just run `make`. The executable will end up in the right place (don't worry about `make install`).

#### go-pmtiles

[Install golang](https://go.dev/doc/install) if you haven't already. In the `go-pmtiles` directory, just run `go build`. The executable will end up in the right place.

### ~~Lazy~~ Pragmatic and efficient option:

#### mkgmap splitter

Get the latest zip, extract the contents into the "splitter" directory. I made a handy script in this directory:

./get-mkgmap-splitter.sh

#### tilemaker and go-pmtiles

Get the release that corresponds to the tag currently checked out in the submodule:

* https://github.com/systemed/tilemaker/releases/
* https://github.com/protomaps/go-pmtiles/releases

## Install `pyosmium`

Available via pip, though you can get it on Debian as `python3-pyosmium`.

## Install `s3cmd`

Necessary to upload the result to an s3 bucket (Amazon, Linode, etc)

Available via pip, though you can get it on Debian as `s3cmd`.

## Build the world

(TODO - s3 credentials on real version)

(TODO - explain planet-test.osm.pbf. It's for testing the build process with a very very small planet file. It won't deal with data issues or resource limitations but it'll see if you're probably running the correct commands. Created (hopefully) with `osmium tags-filter planet.osm.pbf n/place=city -o planet-test.osm.pbf` and then with pyosmium filtering out lower population cities to make it even smaller. EDIT: akshually we want the bigger one probably so that we have at least 2 regions per super region.)

Real version: Run `./build_all.py` and it will build the world for you using the latest weekly `planet.osm.pbf`. The results will be in the `output/` directory, and will also be uploaded to S3. As of this writing this will take about 2 and a half days on a shared Linode VPS with 16 GB of memory.

Test version: Run `./build_all.py` and it will build a super reduced set of the world for you using `planet-test.osm.pbf`. The results will be in the `output/` directory, and will also be uploaded to S3. This will probably take just a few minutes. This is useful for testing changes to the build pipeline. It will skip upload to S3.

# What this will do

For each region, it builds tiles, builds a search index, and packages them in a way that a Sandstorm grain can download.

## Building tiles

In short: It downloads raw OSM data (`planet.osm.pbf`), splits it (twice) into smaller segments (`*.pbf`), converts them to `*.mbtiles` with `tilemaker` in a Protomaps-friendly schema, and uses `go-pmtiles` to convert them to `.pmtiles` so that Protomaps can render it.

So first, this will first download the planet using bittorrent (and seed for a half hour to be nice).

Then it will first use `tilemaker` to convert the raw OSM data into the `.mbtiles` format. One interesting part of this that may not be obvious is that the `.mbtiles` format is open ended and requires you to choose a _schema_. The schema produced by `tilemaker` in this script is defined by `config-protomaps.json` and `process-protomaps.lua`. If you want to learn more about how these files work, [see here](https://github.com/systemed/tilemaker/blob/master/docs/CONFIGURATION.md).

Probably the most popular schema is called OpenMapTiles and was created by MapTiler, and that's what `tilemaker` comes with by default. Apparently there's a weird touchy licensing question around this particular schema. As a result of this, Protomaps created their own schema to be used in `protomaps.js`. (`protomaps.js` is the library that ultimately renders the tiles in a browser). So I needed to change the config and processing files to generate the protomaps schema.

It seemed like a lot of work to do it from scratch, but I also didn't want to simply alter the OpenMapTiles files because I wanted to steer clear of the licensing issues. Thankfully there's another schema called [Shortbread](https://shortbread.geofabrik.de/schema/) created by GeoFabrik with a very permissive license. It has [its own config and process files](https://github.com/geofabrik/shortbread-tilemaker/) for tilemaker. So I started with those, and altered them to work for protomaps.js.

The result? As of now it's in a _passable_ state. You will find that there's still a lot to do (and if, unlike me, you have any idea what you're doing - I would appreciate contributions here, with the caveat at the end of this paragraph). Lots of ways the map doesn't show up so great, and lots of code in there that can probably be deleted. The first version of this took the minimal amount of work for me to make it passable. ALL THAT SAID - we may not need this Shortbread fork forever. Brandon of Protomaps is apparently contributing to something called `planetiler` that will output pmtiles in the protomaps schema. This would replace `tilemaker` for the purposes of Desert Atlas. We'll probably switch to that once it's ready, so keep that in mind if you want to take the time to contribute to the `tilemaker` config and process files.

Finally, it will use `go-pmtiles` to convert the `.mbtiles` file to the final `.pmtiles` format that is readable by protomaps.js

## Extracting Search Data

... TODO

## Bundling the results

Now that we have a `.pmtiles` file for tiles and a `.csv` file for search for the given region, we need to package it for the grain to download. First they will be combined together into a `tar.gz`. Then it will be _split_ into multiple small files. The main reason for this is that Sandstorm doesn't have range requests, and as such large downloads don't work. Secondarily, though, having multiple files to download is convenient for displaying download progress.

Finally, the file names are added to the manifest file so that the requesting grain can figure out what to download.

## TODO - properly roll the following (out of date) stuff into the above

This takes the directories containing data for a region, and packs and then splits them into the format that the app downloads. It's split so that we can sidestep the lack of range requests / max download size in Sandstorm, though it also gives us easy progress info. Oh, and make sure you have a manifest json, I should probably write instructions for that, or a script that generates it.

See the script to see which region codes (bstn, etc) we have.

Setup:

in/<region_code>/tiles - .pmtiles file
in/<region_code>/search - .json.gz gazetteer output

(for each region)

TODO - make sure this works
