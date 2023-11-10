Desert Atlas is a general purpose, fully self-hosted map app for the Sandstorm platform (see [What is Sandstorm?](#what-is-sandstorm) below), based on OpenStreetMap. All map data is stored on your own server; you choose the regions you want. The goal is to provide the basic functionality of Google Maps while respecting privacy.

You can check out a live demo [here](https://apps.sandstorm.io/app/e5eaqnrqfrhgax1awtgw9uqayg42kcen2gkpynjs3j5mww7w3rp0?experimental=true) or install it on your Sandstorm instance, but keep in mind that it's still an "experimental" app.

![Screenshot](metadata/screenshots/screenshot-1.png)

Desert Atlas allows you to plan trip destinations with friends, store important locations, etc, and export the result to a convenient phone application like OrganicMaps for navigation. Perhaps some day (with some work on the phone app side) there could be a more automatic sync option. If there are other bits of standard functionality you would like to see, please let me know!

Some other self-hosted map apps will still get tile data from external sources on-demand, leaking some amount of your usage patterns to the outside world, and making you dependent on their services. With Desert Atlas, all of the map data is fully self-hosted in your Sandstorm grain, in the same way that OrganicMaps fully holds regions of the map on your phone. The map data needs to come from somewhere of course, so as with OrganicMaps you need to download the regions you need (about the size of a US state) from a map data server, but you only need to do this once per grain (until you want to update the data). Perhaps some day the data could be shared between grains on the same server, reducing the amount of downloads further, increasing privacy. But that's very much a stretch goal.

There are other fully self-hosted OSM solutions, admittedly including at least one that uses docker and is thus probably easy to set up. But thanks to Sandstorm, and Desert Atlas aiming for the "simplest version of everything" in the OSM ecosystem, Desert Atlas is even easier. A "full stack" OSM setup generally includes something like postgres for generating tiles and elasticsearch for search, neither of which play nicely with Sandstorm. Desert Atlas by contrast uses [protomaps](https://protomaps.com) for tiles, and (as of now) sqlite3 with fts5 for search (a home-grown solution, importing search data extracted from raw OSM data using python bindings for the common tool `osmium`). No shade on the other solutions, they have more sophisticated search and nicer map renders, but Desert Atlas is simple enough to be a consumer app.

This is a work in progress, but it's just about at releaseable "minimum viable product" status. Search is basic but functional. UI could use some tweaks. But it basically works. Try it out! Let me know what you think. Chime in on the Sandstorm groups, my email address, or file an issue. The more feedback I get (positive or negative) the more I know it's worth spending time on this.

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

# Building

`spk` only for now. Have not tested on `vagrant-spk` but I tried to split up the setup scripts with it in mind. Happy to hear feedback or especially fixes for that.

**WARNING** this should be built on an environment you do not mind modifying and risking breaking, etc. This will require installing things on your system and maybe changing things. The main author uses QubesOS and thus has a dedicated VM for this project.

**WARNING** this will run `git submodule update`. Make sure you're not going to lose any work you have on checked out submodules.

Assumes Debian 11 (Bullseye)

    git submodule init
    git submodule update

    sudo ./setup.sh
    ./build.sh

At this point it should be possible to run `spk pack` without running it first. All of the files should be there.

# Code

Please do not take what you see as being up to my standards. I hacked this out to the point where I could have a minimum viable product. Once released I'd like to clean it up.

Right now the back end is Python and the frontend is JavaScript, Leaflet, some JQuery thrown in. I'd like to rewrite the backend in Go. Maybe the frontend as well (WebAssembly with TinyGo).

The data generation scripts are mostly bash and python. I'd be happy with moving everything to Python.

# Running

## Normal

`spk dev`

## Without Sandstorm

Sometimes useful. I should add some instructions. But it's currently shaky, so not worth documenting since it'll probably change.

But it involves running `./demo.py`. This will start a web server on port 3857 and possibly open a browser.

# Generating map data

For generating map tile and search data, [see here](generate-data).

# License/Credit


## Base map

### GeoJSON (the "wireframe" look)

* US States https://datahub.io/core/geo-admin1-us
* World https://datahub.io/core/geo-countries

### Geonames (search data for countries, states, and cities)

Note that this is a separate data source than OpenStreetMap (granted, so are the geojsons). The license makes it incompatible as a source for importing to OSM's database, but I think it's fine to use side by side as we do here.

* https://creativecommons.org/licenses/by/4.0/
* http://download.geonames.org/export/dump/

# Map Data

OpenStreetMap® is open data, licensed under the Open Data Commons Open Database License (ODbL) by the OpenStreetMap Foundation (OSMF).

As of this writing, I get the planet data from planet.osm.org, and I include a much reduced planet-test.osm.pbf in this repository.

## Search Data (derived from Map Data)

I extract search data from the above into an sqlite database that uses the fts5 plugin. See `generate-data` directory.

## Tiles (derived from Map Data)

I extract tile data from the above into a file in the pmtiles format (see [Protomaps](https://protomaps.com)) and Protomaps schema. See `generate-data` directory.

# Images

## Application Icons

Source images:

* https://openclipart.org/detail/336198/home-map-colour-remix - CC0
* https://openclipart.org/detail/306084/digital-landscape-illustration-2 - CC0
* https://github.com/Leaflet/Leaflet/blob/0042d0b0ddac8e9159ee4f64742bb25b518b9e0f/src/images/marker.svg - BSD 2-Clause

## search-marker.svg bookmark-marker.svg

Possibly edited, original from https://github.com/Leaflet/Leaflet/blob/0042d0b0ddac8e9159ee4f64742bb25b518b9e0f/src/images/marker.svg

# Software Licenses

The original code in this repo: MIT

## Dependencies

These things aren't vendored in this repo, but they will be bundled in the resulting app, so I am noting the licenses here.

* [Leaflet](https://github.com/Leaflet/Leaflet) - BSD 2-Clause
* [Leaflet Search](https://github.com/stefanocudini/leaflet-search) - MIT
* Protomaps JS (with modifications) - BSD 3-Clause
* Protomaps demo.py - Not sure! It's not on github, I got it from their website when I first extracted data. But I changed it a lot, so I think it's effectively trivial at this point.
* Powerbox Proxy (for Sandstorm) - Apache 2
    * Including `assets/js/powerbox-helper.js`. It's built using typescript from a file in the Powerbox repo.

