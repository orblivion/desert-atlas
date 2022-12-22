// Hackish way to check if the grain is selected. This might break if Sandstorm changes its implementation.
// We want this because map.fitBounds goes haywire if you run it on an open but unselected grain. This can
// happen because we run fitBounds on startup. If the grain is running but not selected, and the user
// reloads the page, the startup sequence will happen while the grain is still unselected.
function isGrainSelected() {
    var body = document.body
    var html = document.documentElement

    return Math.min(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight,
    ) > 0;
}

var data = {bookmarks: {}}

var initlBoundsStarted = false
function initBounds() {
    if (initlBoundsStarted) return
    initlBoundsStarted = true
    initBoundsLoop()
}

var initialBounds = null
function initBoundsLoop() {
    if (!isGrainSelected()) {
        // We don't mind running this 10 times a second, it barely does
        // anything until the grain is selected at which point it stops
        // looping.
        setTimeout(initBoundsLoop, 100)
        return
    }
    if (initialBounds !== null) return

    var [bounds, padding] = getBoundsFromHash() || getBoundsFromBookmarks() || getBoundsZoomedOut()
    if (padding) {
        map.fitBounds(bounds, {padding})
    } else {
        map.fitBounds(bounds)
    }

    initialBounds = bounds
}

// TODO websockets

var renderTimeout = null

const renderLoop = () => {
    // Allow for calling renderLoop on demand without having
    // it run again in less than 5 seconds.
    clearTimeout(renderTimeout)

    // Set a new one right away. This is less than optimal
    // if there are slow response times; ideally we'd only
    // reset the timer after it finishes. However this way
    // makes it easier for us to be able to run renderLoop
    // on demand.
    renderTimeout = setTimeout(renderLoop, 5000)

    fetch('bookmarks', {
        method: 'GET'
    })
    .then(e => {
        e.json().then(updatedBookmarks => {
            // Set the ids before the comparison, since what it'll be
            // comparing against will have the ids
            for (bookmarkId in updatedBookmarks) {
                updatedBookmarks[bookmarkId].id = bookmarkId
            }

            // Don't reload it if it's the same
            if (JSON.stringify(updatedBookmarks) !== JSON.stringify(data.bookmarks)) {
                data.bookmarks = updatedBookmarks

                bookmarksList.render()
                updateBookmarkMarkers()
            }

            // Now that we have bookmarks, we're in a good position to set initial bounds
            initBounds()
        })
    })
    .catch(console.log)
}

renderLoop()

// Text-replace this with the permissions when we render app.js. This of course
// should not be relied on for security, just UI changes to not confuse the
// user.
permissions = PERMISSIONS_REPLACE_ME

const map = L.map('map')

var searchResultBookmark = null

// TODO - don't really do this, it's precarious. only for demo. We could fail to set this and save the wrong bookmark or whatever.
var popupMarkerBookmark = null

// TODO allow show all bookmarks

L.Control.BookmarksList = L.Control.extend({
    onAdd: function(map) {
        this.list = L.DomUtil.create('div');
        this.render()
        return this.list;
    },

    render: function() {
        let listItems = `<div id='bookmarks-export'>Export Bookmarks</div>`
        for (bookmarkId in data.bookmarks) {
            divId = `bookmark-list-${bookmarkId}`
            bookmarkData = JSON.stringify(data.bookmarks[bookmarkId])
            listItems += `
            <div id='${divId}' data-bookmark-id=${bookmarkId} class='bookmark-list-item'>
                ${data.bookmarks[bookmarkId]['name']}
            </div>
            `
        }

        // TODO - This is a hack to keep the scroll the same. Eventually
        // we want to not refresh it entirely on each change. Only
        // refresh/add/remove items etc etc so user events don't get messed up.
        let inner = document.getElementById('bookmark-list')
        let scrollSave = null
        if (inner !== null) scrollSave = inner.scrollTop
        this.list.innerHTML = "<div id='bookmark-list'>" + listItems + "</div>"
        inner = document.getElementById('bookmark-list') // it's a new one now
        if (scrollSave !== null) inner.scrollTop = scrollSave

        setTimeout(() => { // setTimeout, my solution for everything. As written, it can't find bookmarks-export without this.
            document.getElementById('bookmarks-export').addEventListener("click", clickBookmarksExport)
            for (id in data.bookmarks) {
                divId = `bookmark-list-${id}`
                document.getElementById(divId).addEventListener("click", clickBookmarkListItem)
            }
        }, 100)
    },
});

L.control.bookmarksList = function() {
    return new L.Control.BookmarksList({
        position: 'topleft'
    });
}

const bookmarksList = L.control.bookmarksList()
bookmarksList.addTo(map)

const bookmarkPopup = L.popup()
    .setContent(
        `
      <h1>Bookmark</h1>
      <div id="search-marker-submit">
          <input id="bookmark-edit-name">
          <div style="margin-top: 7px">
              <button id="bookmark-edit-save-button">Save</button>
              <button id="bookmark-edit-delete-button" style="display:none;">Delete</button>
          </div>
      </div>
      <div id="search-marker-save-success" style="display:none;">
          <h2><center>Saved</center></h2>
      </div>
      <div id="search-marker-delete-success" style="display:none;">
          <h2><center>Deleted</center></h2>
      </div>
      `
    )
    .on('add', e => {
        document.getElementById("bookmark-edit-name").value = popupMarkerBookmark.name
        document.getElementById("bookmark-edit-name").focus()

        // Remove it first in case it's already there from a previous popup *shrug* not sure the best way to handle this
        document.getElementById('bookmark-edit-save-button').removeEventListener("click", addBookmark)
        document.getElementById('bookmark-edit-delete-button').removeEventListener("click", deleteBookmark)
        document.getElementById('bookmark-edit-name').removeEventListener("keydown", bookmarkKeydown)

        document.getElementById('bookmark-edit-save-button').addEventListener("click", addBookmark)
        document.getElementById('bookmark-edit-name').addEventListener("keydown", bookmarkKeydown)
        document.getElementById('bookmark-edit-delete-button').addEventListener("click", deleteBookmark)

        if (popupMarkerBookmark.id) {
            document.getElementById("bookmark-edit-delete-button").style.display = 'inline';
        }
    })

const searchMarker = L.marker([0, 0], {
        icon: new L.Icon({
            iconUrl: 'assets/images/search-marker.svg',
            iconSize: [75, 75]
        })
    })
    .on('add', () => {
        // TODO - sort of a hack to fix probably. the search feature will move the
        // popup and keep the same open state. which may not leave it with the values we want
        bookmarkPopup
            .remove()

        // TODO - search tooltip is getting stuck on a previous search result sometimes. try searching for a couple different items to trigger this.
        setTimeout(() => { // setTimeout, my solution for everything
            searchMarker
                .bindTooltip(searchResultBookmark.name)
                .openTooltip()
        }, 100)
    })
    .on('click', () => {
        if (permissions.indexOf("bookmarks") === -1) return
        popupMarkerBookmark = searchResultBookmark
        bookmarkPopup
            .setLatLng(L.latLng(searchResultBookmark.latlng))
            .openOn(map)
    })

// TODO - Properly extend other marker classes

const downloadPopup = L.popup()

function downloadMarker(name, tileId, coords) {
        return L.marker([0, 0], {
            icon: new L.Icon({
                iconUrl: 'assets/images/bookmark-marker.svg', // TODO different color
                iconSize: [75, 75]
            }),
            areaName: name
        })
        .on('click', () => {
            if (!(tileId + '.pmtiles' in loaded)) {
                downloadPopup
                .setContent(`<div>
                    Download ${name} to this grain?<br>
                    <button onclick="downloadMap('${tileId}'); downloadPopup.remove()">Ok</button>
                    <button onclick="downloadPopup.remove()">Cancel</button>
                </div>`)
                .setLatLng(L.latLng(coords))
                .addTo(map)
            } else {
                map.fitBounds(areaBoundses[tileId])
            }
        })
        .setLatLng(L.latLng(coords))
        .bindTooltip('', {permanent: true})
        .openTooltip()
}

function downloadMap(tileId) {
    fetch('download-map', {
        method: 'POST',
        body: JSON.stringify({'tile-id': tileId}),
    })
    .catch(console.log)
}

// TODO - grab from manifest
downloadMarkers = {
    psmt: downloadMarker('New Hampshire seacoast', 'psmt', [43.0718, -70.7626]),
    bstn: downloadMarker('Boston area', 'bstn', [42.3551, -71.0657]),
}

if (permissions.indexOf("download") !== -1) {
    for (tileId in downloadMarkers) {
        downloadMarkers[tileId].addTo(map)
    }
}

const bookmarkKeydown = (e => {
    if (e.which === 13) {
        addBookmark()
    }
})

const addBookmark = (() => {
    fetch('bookmark', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById("bookmark-edit-name").value,
                latlng: popupMarkerBookmark.latlng,
                id: popupMarkerBookmark.id, // Undefined for search results
            })
        })
        .then(e => e.json())
        .then(([bookmarkId, bookmark]) => {
            document.getElementById("search-marker-submit").style.display = 'none';
            document.getElementById("search-marker-save-success").style.display = 'block';
            setTimeout(() => {
                bookmarkPopup.remove() // Don't know why close() doesn't work, don't care.

                // Hide the search marker, replace it with the new saved
                // bookmark marker (which has a different style, so it
                // indicates to the user that it's now saved)
                searchMarker.remove()

                // Whether to use renderLoop or updateBookmarkMarkers/bookmarksList.render is debatable.
                // renderLoop is safer since only one place changes data.bookmarks; changing data.bookmarks
                // here and now and updating the visual elements is faster and perhaps less prone to the
                // error of missing the new ID (I think that happened to me once)
                data.bookmarks[bookmarkId] = bookmark
                bookmarksList.render()
                updateBookmarkMarkers()

                selectBookmarkMarker(bookmarkId)
            }, 500)
        })
        .catch(console.log)
})

const deleteBookmark = (() => {
    fetch('bookmark-delete', {
            method: 'POST', // should be DELETE on the same path as POST, but I don't want to figure this out now
            body: JSON.stringify({
                id: popupMarkerBookmark.id,
            })
        })
        .then(() => {
            document.getElementById("search-marker-submit").style.display = 'none';
            document.getElementById("search-marker-delete-success").style.display = 'block';
            setTimeout(() => {
                // Whether to use renderLoop or updateBookmarkMarkers/bookmarksList.render is debatable.
                // renderLoop is safer since only one place changes data.bookmarks; changing data.bookmarks
                // here and now and updating the visual elements is faster and perhaps less prone to the
                // error of using an invalid ID.
                renderLoop()
                bookmarkPopup.remove() // Don't know why close() doesn't work, don't care.
            }, 500)
        })
        .catch(console.log)
})

const clickBookmarksExport = e => {
    // TODO - wtf in local mode firefox keeps opening new tabs
    document.location = '/export.kmz'
}

const clickBookmarkListItem = e => {
    selectBookmarkMarker(e.target.getAttribute('data-bookmark-id'))
}

L.SavedBookmarkMarker = L.Marker.extend({
    options: {
        icon: new L.Icon({
            iconUrl: 'assets/images/bookmark-marker.svg',
            iconSize: [75, 75]
        })
    },
})

var bookmarkMarkers = {} // just for lookup by id.
var bookmarkMarkerFeatureGroup = L.featureGroup()
    .addTo(map)
    .on('click', e => {
        if (permissions.indexOf("bookmarks") === -1) return

        popupMarkerBookmark = data.bookmarks[e.layer.options.bookmarkId]
        if (popupMarkerBookmark) { // timing issues?
            bookmarkPopup
                .setLatLng(L.latLng(popupMarkerBookmark.latlng))
                .openOn(map)
        }
    })

function bookmarkMarkerTooltip(marker) {
    let bookmark = data.bookmarks[marker.options.bookmarkId]
    return bookmark && bookmark.name
}

function updateBookmarkMarkers() {
    for (bookmarkId in data.bookmarks) {
        if (!(bookmarkId in bookmarkMarkers)) {
            let bookmark = data.bookmarks[bookmarkId]
            // Add marker for newly added bookmark
            bookmarkMarkers[bookmarkId] = new L.SavedBookmarkMarker(
                L.latLng(bookmark.latlng), {bookmarkId}
            )

            // If I bindTooltip on the feature group, openTooltip() doesn't work for
            // some reason (though, mouseover tooltip does; maybe it's a bug in
            // the version of leaflet I'm currently on.) So I bindTooltip on each
            // marker individually.
            bookmarkMarkers[bookmarkId].bindTooltip(bookmarkMarkerTooltip)

            bookmarkMarkerFeatureGroup.addLayer(bookmarkMarkers[bookmarkId])
        } else {
            // Update existing bookmark markers
            bookmarkMarkers[bookmarkId]
                .setLatLng(L.latLng(data.bookmarks[bookmarkId].latlng))
        }
    }
    for (bookmarkId in bookmarkMarkers) {
        if (!(bookmarkId in data.bookmarks)) {
            // Remove marker for newly deleted bookmark
            bookmarkMarkerFeatureGroup.removeLayer(bookmarkMarkers[bookmarkId])
            delete bookmarkMarkers[bookmarkId]
        }
    }
}

const selectBookmarkMarker = (bookmarkId) => {
    let bookmark = data.bookmarks[bookmarkId]
    map.setView(L.latLng(bookmark.latlng), 17)

    setTimeout(() => { // setTimeout, my solution for everything
        // Some indication that this thing has been selected
        bookmarkMarkers[bookmarkId].openTooltip()
    }, 100)
}

let loaded = {}

// TODO maybe merge in with loadAvailableAreas. obviously the syncing sucks, we want a websocket, but good enough for demo.
function updateDownloadStatuses() {
    setTimeout(updateDownloadStatuses, 1000)

    return fetch('map-download-status', {
        method: 'GET'
    })
    .then(e => e.json())
    .then(fullStatus => {
        const inProgress = fullStatus['in-progress']
        Object.keys(downloadMarkers).forEach(tileId => {
            const name = downloadMarkers[tileId].options.areaName

            if (map.getZoom() > 7 && (tileId + '.pmtiles') in loaded) {
                downloadMarkers[tileId].remove()
            } else {
                downloadMarkers[tileId].addTo(map)
            }

            if (loaded[tileId + '.pmtiles'] === "done") {
                // We can keep showing the marker after done to let
                // the user find the city if they're zoomed out
                // it'll be hidden when they're zoomed in
                downloadMarkers[tileId].getTooltip().setContent(name)
            } else if (fullStatus.done.includes(tileId) || loaded[tileId + '.pmtiles'] === "started") {
                downloadMarkers[tileId].getTooltip().setContent("Downloaded. Loading on screen...")
            } else if (tileId in inProgress) {
                if (inProgress[tileId].downloadDone !== inProgress[tileId].downloadTotal) {
                    downloadPercentage = Math.round(100 * (inProgress[tileId].downloadDone / inProgress[tileId].downloadTotal))
                    downloadMarkers[tileId].getTooltip().setContent(
                        'Downloading ' + name +
                        `<div style='width:100px;border-style:solid;'>
                            <div style='width:${downloadPercentage}%; background-color:#555'>&nbsp</div>
                        </div>`
                    )
                } else {
                    searchImportPercentage = inProgress[tileId].searchImportTotal ?
                        Math.round(100 * (inProgress[tileId].searchImportDone / inProgress[tileId].searchImportTotal)) : 0
                    downloadMarkers[tileId].getTooltip().setContent(
                        'Importing search data for ' + name +
                        `<div style='width:100px;border-style:solid;'>
                            <div style='width:${searchImportPercentage}%; background-color:#555'>&nbsp</div>
                        </div>`
                    )
                }
            } else if (fullStatus.queued.includes(tileId)) {
                downloadMarkers[tileId].getTooltip().setContent('Queued for download: ' + name)
            } else {
                downloadMarkers[tileId].getTooltip().setContent(name)
            }
        })
    })
}

// TODO - woah, why does portsmouth make Boston disappear if I add it after? it depends on the loading order?!
function loadAvailableAreas() {
    // TODO Maybe don't bother with the retry loop. The status will tell us
    // everything we need to know and that will kick off loadArea.
    setTimeout(loadAvailableAreas, 2000)

    return fetch('list-tiles', {
        method: 'GET'
    })
    .then(e => e.json())
    .then(tileNames => tileNames.forEach(tilesName => {
        loadArea(tilesName)
    }))
}

areaBoundses = {}

// TODO
// Have this check loaded[filename] or whatever. If set, return (take it out of
// loadAvailableAreas). If not set, set it *before* and proceed. Should prevent double
// loading I think. If the load fails, oh well they can reload the page. Later
// we can add a retry loop. Actually maybe just catch failures and unset loaded[filename]
function loadArea(tilesName) {
    if (tilesName in loaded) {
        return
    }

    loaded[tilesName] = "started"
    console.log('adding', tilesName)

    const area = new protomaps.PMTiles(tilesName)
    return area.metadata().then(areaMetadata => {
        let bounds_str
        let bounds

        bounds_str = areaMetadata.bounds.split(',')
        areaBounds = [
            [+bounds_str[1], +bounds_str[0]],
            [+bounds_str[3], +bounds_str[2]]
        ]
        areaLayer = new protomaps.LeafletLayer({
            attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
            url: area,
            bounds: areaBounds
        })
        areaLayer.addTo(map)

        let tnSplit = tilesName.split('.pmtiles')
        if (tnSplit.length != 2 || tnSplit[1] !== "") throw "tilesName not formatted as expected"
        let tileId = tnSplit[0]
        areaBoundses[tileId] = areaBounds
    })
    .then(() => {
        console.log('added', tilesName)
        loaded[tilesName] = "done"
    })
}

function getGeoJson(name) {
    path = `base-map/${name}.geojson`
    return fetch(path, {
        method: 'GET'
    })
    .then(e => {
        return e.json().then(geoJson => {
            // Remove the US since we already have the states. This will avoid the annoying
            // inconsistent double-borders. Still have that problem on the northern and
            // southern borders though.
            geoJson.features = geoJson.features.filter(f => f.properties.ADMIN !== "United States of America")
            const geoJsonLayer = L.geoJson(geoJson, {
                style: {
                    weight: 1,
                    color: '#000',
                    dashArray: '',
                    fillOpacity: 0,
                    opacity: .1,
                }
            }).addTo(map)
            geoJsons[name] = geoJsonLayer
            setGeoJsonOpacity()
            return geoJsonLayer
        })
    })
    .catch(console.log)
}

function setGeoJsonOpacity () {
    opacity = 0.4 / (map.getZoom() + 1)
    for (name in geoJsons) {
        geoJsons[name].setStyle({opacity})
    }
}

geoJsons = {}

// Give a very simple backdrop so people have some idea where on the map they are
// These take up less space than tiles, especially when "simplified".
// TODO - probably actually replace this with dead simple world map tiles if I can.
// It will look better. Also geoJson seems to want to always be on top of tiles so
// it'll always show up at least a little bit.
getGeoJson("countries")
getGeoJson("states")

loadAvailableAreas()
if (permissions.indexOf("download") !== -1) {
    updateDownloadStatuses()
}

const searchControl = new L.Control.Search({
    url: 'search?q={s}',
    textPlaceholder: 'Cafes, streets, parks...',
    position: 'topright',
    marker: searchMarker,
    zoom: 17, // TODO - redundant at some point given the explicit on('add' stuff?
})

searchControl.on('search:locationfound', function(event) {
    searchResultBookmark = {
        latlng: event.latlng,
        name: event.text
    }
});

map.addControl(searchControl);

// TODO - this doesn't work in sandstorm! because of how urls are handled. figure something out...
function getBoundsFromHash() {
    coords = location.hash.split('_').slice(1).map(Number)
    if (coords.length != 4 || coords.includes(undefined) || coords.includes(NaN)) {
        return null // deal with it another way
    }

    [north, east, south, west] = coords

    return [
        L.latLngBounds(
            L.latLng(north, east),
            L.latLng(south, west),
        ),
        null // no padding
    ]
}

function getBoundsFromBookmarks() {
    if (Object.values(bookmarkMarkers).length === 0) {
        return null
    }

    return [
        bookmarkMarkerFeatureGroup.getBounds(),
        // Some padding is nice for keeping markers in view and not on the fringes
        // Horizontal is higher because of the menu on the left
        [200, 50]
    ]
}

// This is the final fallback, it can't return null
function getBoundsZoomedOut() {
    return [
        L.latLngBounds(
            L.latLng(17.476432197195518, -166.99218750000003),
            L.latLng(59.489726035537075, 0.3515625),
        ),
        null // no padding
    ]
}

// TODO - this doesn't work in sandstorm! figure something out...
function setLoc() {
    if (!initialBounds) return // the map is probably not ready for this yet

    // number of significant figures of lat/long that we save in the URL bar
    // so that we return there when we refresh
    REFRESH_PRECISION = 4

    location = (
        "#loc" +
        '_' + map.getBounds().getNorth() +
        '_' + map.getBounds().getEast() +
        '_' + map.getBounds().getSouth() +
        '_' + map.getBounds().getWest()
    )
}

// TODO - this doesn't work in sandstorm! figure something out...
// in case they were set to something invalid before
setLoc()
map.on('zoomend', setLoc)
map.on('moveend', setLoc)
map.on('zoomend', setGeoJsonOpacity)
