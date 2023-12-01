Desert Atlas is a general purpose, fully self-hosted map app for the Sandstorm platform (see [What is Sandstorm?](#what-is-sandstorm) below), based on OpenStreetMap. All map data is stored on your own server; you choose the regions you want. The goal is to provide the basic functionality of Google Maps while respecting privacy.

You can check out a live demo [here](https://apps.sandstorm.io/app/e5eaqnrqfrhgax1awtgw9uqayg42kcen2gkpynjs3j5mww7w3rp0) or install it on your Sandstorm instance.

![Screenshot](.sandstorm/metadata/screenshots/screenshot-1.png)

Desert Atlas allows you to plan trip destinations with friends, store important locations, etc, and export the result to a convenient phone application like OrganicMaps for navigation. Perhaps some day (with some work on the phone app side) there could be a more automatic sync option. If there are other bits of standard functionality you would like to see, please let me know!

Some other self-hosted map apps will still get tile data from external sources on-demand, leaking some amount of your usage patterns to the outside world, and making you dependent on their services. With Desert Atlas, all of the map data is fully self-hosted in your Sandstorm grain, in the same way that OrganicMaps fully holds regions of the map on your phone. The map data needs to come from somewhere of course, so as with OrganicMaps you need to download the regions you need (about the size of a US state) from a map data server, but you only need to do this once per grain (until you want to update the data). Perhaps some day the data could be shared between grains on the same server, reducing the amount of downloads further, increasing privacy. But that's very much a stretch goal.

There are other fully self-hosted OSM solutions, admittedly including at least one that uses docker and is thus probably easy to set up. But thanks to Sandstorm, and Desert Atlas aiming for the "simplest version of everything" in the OSM ecosystem, Desert Atlas is even easier. A "full stack" OSM setup generally includes something like postgres for generating tiles and elasticsearch for search, neither of which play nicely with Sandstorm. Desert Atlas by contrast uses [protomaps](https://protomaps.com) for tiles, and (as of now) sqlite3 with fts5 for search (a home-grown solution, importing search data extracted from raw OSM data using python bindings for the common tool `osmium`). No shade on the other solutions, they have more sophisticated search and nicer map renders, but Desert Atlas is simple enough to be a consumer app.

This is now at a "minimum viable product" status. Search is basic but functional. UI could use some tweaks. But it's usable. Try it out! Let me know what you think. Chime in on the [Sandstorm groups](https://groups.google.com/g/sandstorm-dev), [Github discussions](https://github.com/orblivion/desert-atlas/discussions), or file a [feature request or bug report](https://github.com/orblivion/desert-atlas/issues) on Github. The more feedback I get (positive or negative) the more I know it's worth spending time on this. (If you know something about OSM or UI and think you could make this better, you're likely right. [See here!](https://github.com/orblivion/desert-atlas/wiki/Where-to-help/))

## What is Sandstorm?

Sandstorm is a user friendly platform for self-hosted web applications. Installation of the Sandstorm platform itself is pretty easy, and it updates itself in the background automatically. Once the platform is installed, everything is administered in-browser. Installing individual apps is like using an app store on the phone or desktop. The headaches of maintaning individual web apps are gone.

From a developer's point of view it can be a double-edged sword. Sandstorm has usability and security features built in, taking care of a lot of the overhead, allowing devs to focus on the core features of the app. On the other hand, it comes with a lot of restrictions, which can be especially challenging when porting existing apps. Desert Atlas is a new app, but it reuses some existing components that took a little work to fit into Sandstorm's restrictions.

You can read about Sandstorm's model in some depth [on their website](https://sandstorm.io/how-it-works), but we'll go over it briefly here.

### Users and Grains

Most self-hosted web applications come in a single installation to handle all of its users. A standard word processor web application, for example, might have two users, each owning three documents, all represented in one database.

With Sandstorm's model, a similar word processor app would be designed to be controlled by only one user and have only one document. Those same two users would be able to each have 3 documents by spinning up _three different instances of the app_ on demand, each with its own database. These instances are called "grains".

### Sandbox Environment

Sandstorm apps run in a restrictive, isolated container environment. No grain has access to any other grain without explicit user permission (via a popup in the UI), whether of the same or different apps.

Sandstorm restricts the app's access to the kernel API, which adds security. The environment is also single-user (as in, Unix user), which makes running databases like Postgres very difficult. However sqlite tends to scale just fine on Sandstorm because each grain will rarely have more than a few users interacting with it. Sqlite also starts faster, which is good since grains start and stop often on Sandstorm. The standard "full OpenStreetMap stack" uses Postgres and Elasticsearch, so Desert Atlas uses some stripped-down alternatives.

All of the grain's data ends up in one directory, making grain backups a simple matter of clicking a button in the UI to download a zip file.

### Connections and Access

Each grain's url contains a randomly generated string, making it hard for attackers to guess. A user can share one of their grains with other users (or even non-users) via a share link that contains its own hard-to-guess string. Each share link is revokable, and has a permission level associated. While the permissions UI is built into Sandstorm, the app defines the permission levels and is responsible for implementing them. For instance Desert Atlas has separate permissions for downloading map data and editing bookmarks.

Inbound connections from the browser go through a proxy to handle authentication. It adds special headers to tell the app which Sandstorm user is making the request and what permissions they're supposed to have.

Outbound network connections from the backend require explicit user permission (again via a popup) to prevent a malicious app from "phoning home". Desert Atlas makes use of this as users request to download map data for a given region.

# Running / Developing

First, check out the git submodules:

    git submodule init
    git submodule update dependencies

## Vagrant SPK

Normal stuff; `vagrant-spk vm up`, `vagrant-spk dev`. Just check out the [Sandstorm packaging tutorial](https://docs.sandstorm.io/en/latest/vagrant-spk/packaging-tutorial/) if you're unfamiliar.

## SPK (no virtual machines)

`spk`-only is a bit more advanced. It's only recommended if you have a reason not to use Vagrant (such as developing on QubesOS that isn't as friendly to VirtualBox).

**WARNING** this should be built on an environment you do not mind modifying and risking breaking, etc. This will require installing things on your system and maybe changing things. The main author uses QubesOS and thus has a dedicated VM for this project.

Assumes Debian 11 (Bullseye) and that your current directory is the repository root

    # This is how vagrant-spk likes to work, and it's easier to just follow suit
    sudo mkdir /opt/app
    sudo mount --bind . /opt/app

    sudo .sandstorm/setup.sh
    .sandstorm/build.sh

    cd .sandstorm
    spk dev

# Building / Releasing

At this point it should be possible to run `spk pack` (within the `.sandstorm` directory) / `vagrant-spk pack` without running it first. All of the files should be there.

# Code

Please do not take what you see as being up to my standards. I hacked this out to the point where I could have a minimum viable product. Once released I'd like to clean it up.

Right now the back end is Python and the frontend is JavaScript, Leaflet, some JQuery thrown in. I'd like to rewrite the backend in Go. Maybe the frontend as well (WebAssembly with TinyGo).

The data generation scripts are mostly bash and python. I'd be happy with moving everything to Python.

# Running

## Normal

`spk dev`

## Without Sandstorm

Sometimes useful. I should add some instructions. But it's currently shaky, so not worth documenting since it'll probably change.

But it involves running `./server.py`. This will start a web server on port 3857 and possibly open a browser.

# Generating map data

For generating map tile and search data, [see here](generate-data).

# Licenses/Credit

The original code in this repo is licensed MIT. However, Desert Atlas strings together a lot of different bits of software and data with different licenses, most of which are bundled in the resulting app. With a couple exceptions noted below, these things aren't vendored in this repository. In any case, I am noting the licenses related to third party work here.

In summary, big thanks for:

* **Map Data**: [OpenStreetMap Foundation](https://www.openstreetmap.org/copyright) and all OSM editors, [GeoNames](https://geonames.org), [Natural Earth](https://www.naturalearthdata.com/), [Lexman](https://github.com/lexman), and [Open Knowledge Foundation](https://okfn.org/)
* **Map Tiles**: [mkgmap](https://www.mkgmap.org.uk), [Tilemaker](https://github.com/systemed/tilemaker/), [Protomaps](https://protomaps.com) and [Geofabrik](https://www.geofabrik.de/), 
* **Search**: [SQLite](https://sqlite.org/) and [PyOsmium](https://osmcode.org/pyosmium/)
* **Front end code**: [Leaflet](https://github.com/Leaflet/Leaflet), [Leaflet Search](https://github.com/stefanocudini/leaflet-search), and [JQuery](https://jquery.com/)
* **Sandstorm integation**: [Powerbox Proxy](https://github.com/zenhack/powerbox-http-proxy/)

## Base map

This is data that is built into the app, and is thus available as soon as the user starts a new grain. It includes a "wireframe" world and U.S. map, and the ability to search for cities and large towns.

### Low detail "wireframe" map (GeoJSON)

* US States https://datahub.io/core/geo-admin1-us - [Open Data Commons Public Domain Dedication and License](http://opendatacommons.org/licenses/pddl/1.0/)
* World https://datahub.io/core/geo-countries - [Open Data Commons Public Domain Dedication and License](http://opendatacommons.org/licenses/pddl/1.0/)

### Search data for countries, states, and cities

Note that this is a separate data source than OpenStreetMap (as are the "wireframes"). As I understand, its license makes it incompatible as a source for importing to OSM's database, but I think it's fine to use side by side as we do here. (Let me know if this is wrong, and I can derive this data from OSM data instead)

* http://download.geonames.org/export/dump/ - [CC-BY](https://creativecommons.org/licenses/by/4.0/)

## Downloadable Map Data

This section relates to the periodic process of generating the regions of the world map which users explicitly choose to download _after_ the grain starts. I.e. they are not built into the app (though some form of it is checked into this repository, as seen below).

These attributions are for the data _generation_ tools, not the libraries in the app that use the data.

### Raw Data Source

All downloadable regions data is derived from `planet.osm.pbf` from OpenStreetMap®. I also include a much reduced `planet-test.osm.pbf` in this repository.

* https://planet.osm.org/ - Open Data Commons Open Database License (ODbL) by the OpenStreetMap Foundation (OSMF).

### Splitting

> [!NOTE]
> I believe that these licenses only apply to the splitter, not the app or data itself.

Mkgmap splitter splits the planet into smaller osm.pbf chunks.

* https://www.mkgmap.org.uk/download/splitter.html - GPL3, LGPL3, Apache 2, XPP3 (apache-like license)

### Tiles

> [!NOTE]
> I believe that these licenses only apply to the tilemaker, go-pmtiles, and Shortbread, not the app or data itself.

Tilemaker converts each region from osm.pbf to mbtiles, go-pmtiles converts from mbtiles to pmtiles. I started from the Shortbread schema from Geofabrik, edited it to make into Protomaps schema. See `generate-data` directory.

* https://github.com/systemed/tilemaker/ - [FTWPL](https://github.com/systemed/tilemaker/blob/master/LICENCE.txt)
* https://github.com/protomaps/go-pmtiles/ - BSD 3-Clause
* https://github.com/shortbread-tiles/shortbread-docs - [CC0](https://creativecommons.org/public-domain/cc0/)

### Search

> [!NOTE]
> I believe that this license only applies to pyosmium, not the app or data itself.

Extracting search data from raw OSM data for each region into a csv. See `generate-data` directory.

* https://osmcode.org/pyosmium/ - BSD 2-Clause

## App

### Frontend

* [Leaflet](https://github.com/Leaflet/Leaflet) - Map UI framework - BSD 2-Clause
* Leaflet Search - plugin for search UI - MIT
* [Protomaps JS](https://github.com/protomaps/protomaps-leaflet) (with modifications) - Display pmtiles vector map files - BSD 3-Clause
* [JQuery](https://jquery.org/license/) - MIT
* Powerbox Proxy - Facilitate outbound requests from Sandstorm - Apache 2
    * In this repository: `assets/js/powerbox-helper.js`, which is built using typescript from a file in the Powerbox repository. (I didn't want to require npm for building)

### Backend

Each downloaded map region contains a csv file that is imported into an SQLite database with the [FTS5 plugin](https://sqlite.org/fts5.html) for full-text search.

* SQLite+FTS5 - included in Sandstorm application package via Debian, see below for licensing

## Images

### Application Icons

The Desert Atlas icon (in this repository, licensed via BSD 2-Clause due to the below licenses) was put together from a few pieces of clip art:

Source images:

* https://openclipart.org/detail/336198/home-map-colour-remix - [CC0](https://creativecommons.org/public-domain/cc0/)
* https://openclipart.org/detail/306084/digital-landscape-illustration-2 - [CC0](https://creativecommons.org/public-domain/cc0/)
* https://github.com/Leaflet/Leaflet/blob/0042d0b0ddac8e9159ee4f64742bb25b518b9e0f/src/images/marker.svg - BSD 2-Clause

### search-marker.svg bookmark-marker.svg

In this repository, possibly edited from original, which can be found here: https://github.com/Leaflet/Leaflet/blob/0042d0b0ddac8e9159ee4f64742bb25b518b9e0f/src/images/marker.svg

## Assorted

Various other things from [Debian Bullseye](https://www.debian.org/legal/licenses/) (via QubesOS) when creating the Sandstorm package.
