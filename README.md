Share-A-Map is a general purpose, fully self-hosted map app for the Sandstorm platform (see [What is Sandstorm?](#what-is-sandstorm) below), based on OpenStreetMap. The goal is to provide the basic functionality of Google Maps while respecting privacy.

You can check out a live demo [here](https://apps.sandstorm.io/app/m3ctajcm6nnpce287r0a4t52ackzv7p7mmffrw88nge64fp0m8yh?experimental=true) or install it on your Sandstorm instance, but keep in mind that it's still an "experimental" app.

![Screenshot](market/screenshots/screenshot-1.png)

Share-A-Map allows you to plan trip destinations with friends, store important locations, etc, and have access to the result on a convenient phone application like OrganicMaps. Use with a phone application currently requires manual export/import of a bookmarks file, but perhaps some day (with some work on the phone app side) there could be a sync option. If there are other bits of standard functionality you would like to see, please let me know!

Some self-hosted map apps will still get tile data from external sources on-demand, leaking some amount of your usage patterns to the outside world, and making you dependent on their services. With this app, all of the map data is fully self-hosted in your Sandstorm grain, in the same way that OrganicMaps fully holds regions of the map. The map data needs to come from somewhere of course, so you need to download it, but you only need to download it once per grain. Perhaps some day the data could be shared between grains on the same server, reducing the amount of downloads further, increasing privacy. But that's very much a stretch goal.

The tech stack is much simpler than other fully self-hosted OSM solutions. The full OSM stack generally includes something like postgres for generating tiles and elasticsearch for search. Neither postgres nor elasticsearch play nicely with Sandstorm, and in any case grain startup would probably be slow. Share-A-Map uses [protomaps](https://protomaps.com) for tiles, and (as of now) sqlite3 with fts5 for search (a home-grown solution, importing search data extracted from raw OSM data using the common tool `osmium`). This likely makes search less sophisticated but hopefully the tradeoff works well for this use case.

This is a work in progress. As of this writing, only a couple areas are supported. Search is basic but functional. UI could use some tweaks. But it basically works. Try it out! Let me know what you think. Chime in on the Sandstorm groups, my email address, or file an issue. The more feedback I get (positive or negative) the more I know it's worth spending time on this.

## What is Sandstorm?

Sandstorm is a user friendly platform for self-hosted web applications. Installation of the Sandstorm platform itself is pretty easy, and it updates itself in the background automatically. Once the platform is installed, everything is administered in-browser. Installing individual apps is like using an app store on the phone or desktop. The headaches of maintaning individual web apps are gone.

From a developer's point of view it can be a double-edged sword. Sandstorm has usability and security features built in, taking care of a lot of the overhead, allowing devs to focus on the core features of the app. On the other hand, it comes with a lot of restrictions, which can be especially challenging when porting existing apps. Share-A-Map is a new app, but it reuses some existing components that took a little work to fit into Sandstorm's restrictions.

You can read about Sandstorm's model in some depth [on their website](https://sandstorm.io/how-it-works), but we'll go over it briefly here.

### Users and Grains

Most self-hosted web applications come in a single installation to handle all of its users. A standard word processor web application, for example, might have two users, each owning three documents, all represented in one database.

With Sandstorm's model, a similar word processor app would be designed to be controlled by only one user and have only one document. Those same two users would be able to each have 3 documents by spinning up _three different instances of the app_ on demand, each with its own database. These instances are called "grains".

### Sandbox Environment

Sandstorm apps run in a restrictive, isolated container environment. No grain has access to any other grain without explicit user permission (via a popup in the UI), whether of the same or different apps.

Sandstorm restricts the app's access to the kernel API, which adds security. The environment is also single-user (as in, Unix user), which makes running databases like Postgres very difficult. However sqlite tends to scale just fine on Sandstorm because each grain will rarely have more than a few users interacting with it. Sqlite also starts faster, which is good since grains start and stop often on Sandstorm. The standard "full OpenStreetMap stack" uses Postgres and Elasticsearch, so Share-A-Map uses some stripped-down alternatives.

All of the grain's data ends up in one directory, making grain backups a simple matter of clicking a button in the UI to download a zip file.

### Connections and Access

Each grain's url contains a randomly generated string, making it hard for attackers to guess. A user can share one of their grains with other users (or even non-users) via a share link that contains its own hard-to-guess string. Each share link is revokable, and has a permission level associated. While the permissions UI is built into Sandstorm, the app defines the permission levels and is responsible for implementing them. For instance Share-A-Map has separate permissions for downloading map data and editing bookmarks.

Inbound connections from the browser go through a proxy to handle authentication. It adds special headers to tell the app which Sandstorm user is making the request and what permissions they're supposed to have.

Outbound network connections from the backend require explicit user permission (again via a popup) to prevent a malicious app from "phoning home". Share-A-Map makes use of this as users request to download map data for a given region.

# Building

`spk` only for now. **WARNING** this should be built on an environment you do not mind modifying and risking breaking, etc. This will require installing things on your system and maybe changing things. The main author uses QubesOS and thus has a dedicated VM for this project.

`build.sh` is a TODO. We can probably get this going on `vagrant-spk`. It would also be useful for auto-installing things in this section.

Git submodules, protomaps.js/setup.sh. All of the symlinks within `assets/` should be pointing to something real. build powerbox-http-proxy.

Debian (probably among other things, TODO make this comprehensive and probably put in `build.sh`): `nginx`, `python3-flask`, `python3-unidecode`, `npm`

And then for nginx:

```
sudo service nginx stop
sudo systemctl disable nginx
```

Unless you actually want to have an nginx server always running on your system.

Also install golang for the powerbox-http-proxy.

Yeah this is a TODO, feel free to fill this in with useful info.

# Running

## Normal

`spk dev`

## Without Sandstorm

Sometimes useful. I should add some instructions. But it's currently shaky, so not worth documenting since it'll probably change.

But it involves running `./demo.py`. This will start a web server on port 3857 and possibly open a browser.

# Generating map data

For generating map tile and search data, [see here](generate-data/README.md).

# License/Credit

## GeoJSON

### Base map (the "wireframe" look)

* US States https://datahub.io/core/geo-admin1-us
* World https://datahub.io/core/geo-countries

### Downloadable region polygons

As of this writing I've defined the region polygons manually on the protomaps extraction website.

# Map Data

OpenStreetMap® is open data, licensed under the Open Data Commons Open Database License (ODbL) by the OpenStreetMap Foundation (OSMF).

## Search Data (derived from Map Data)

As of this writing, I get large regions (US states, etc) data from https://download.geofabrik.de (who derives it from OpenStreetMap) and extract smaller regions for search.

I'm not sure if this is a requirement for attribution but I do not mind shouting them out!

## Tiles (derived from Map Data)

[Protomaps](https://protomaps.com) (who derives it from OpenStreetMap).

# Images

## OSM logo

https://commons.wikimedia.org/wiki/File:Openstreetmap_logo.svg

## search-marker.svg bookmark-marker.svg

Possibly edited, original from https://github.com/Leaflet/Leaflet/blob/main/src/images/marker.svg

# Software Licenses

These things aren't vendored in this repo, but they will be bundled in the resulting app, so I am noting the licenses here.

* [Leaflet](https://github.com/Leaflet/Leaflet) - BSD 2-Clause
* [Leaflet Search](https://github.com/stefanocudini/leaflet-search) - MIT
* Protomaps JS (with modifications) - BSD 3-Clause
* Protomaps demo.py - Not sure! It's not on github, I got it from their website when I first extracted data. But I changed it a lot, and plan to rewrite it in Go.
* Powerbox Proxy (for Sandstorm) - Apache 2

