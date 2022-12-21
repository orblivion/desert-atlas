const map = L.map('map')

var lastPulledBookmarks = {}

var searchResultBookmark = null
var selectedSavedBookmark = null

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
        return fetch('bookmarks', {
                method: 'GET'
            })
            .then(e => {
                e.json().then(bookmarks => {
                    // Don't reload it if it's the same
                    if (JSON.stringify(bookmarks) === JSON.stringify(lastPulledBookmarks)) {
                        return
                    }
                    lastPulledBookmarks = bookmarks

                    let listItems = `<div id='bookmarks-export'>Export Bookmarks</div>`
                    for (id in bookmarks) {
                        divId = `bookmark-list-${id}`
                        bookmarkData = JSON.stringify(bookmarks[id])
                        listItems += `
                        <div id='${divId}' data-bookmark-id=${id} class='bookmark-list-item'>
                            <div class='bookmark-data' style='display:none;'>${bookmarkData}</div>
                            ${bookmarks[id]['name']}
                        </div>
                        `
                    }

                    // TODO - This is a hack to keep the scroll the same. In
                    // reality we want to just not refresh it on a timer really.
                    // Only refresh/add/remove items etc etc so user events don't get messed up.
                    // For now though lastPulledBookmarks does it for us.
                    let inner = document.getElementById('bookmark-list')
                    let scrollSave = null
                    if (inner !== null) scrollSave = inner.scrollTop
                    this.list.innerHTML = "<div id='bookmark-list'>" + listItems + "</div>"
                    inner = document.getElementById('bookmark-list') // it's a new one now
                    if (scrollSave !== null) inner.scrollTop = scrollSave

                    document.getElementById('bookmarks-export').addEventListener("click", clickBookmarksExport)
                    for (id in bookmarks) {
                        divId = `bookmark-list-${id}`
                        document.getElementById(divId).addEventListener("click", clickBookmarkListItem)
                    }
                })
            })
            .catch(console.log)
    }
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
        popupMarkerBookmark = searchResultBookmark
        bookmarkPopup
            .setLatLng(L.latLng(searchResultBookmark.latlng))
            .openOn(map)
    })

const savedBookmarkMarker = L.marker([0, 0], {
        icon: new L.Icon({
            iconUrl: 'assets/images/bookmark-marker.svg',
            iconSize: [75, 75]
        })
    })
    .on('click', () => {
        popupMarkerBookmark = selectedSavedBookmark
        bookmarkPopup
            .setLatLng(L.latLng(selectedSavedBookmark.latlng))
            .openOn(map)
    })

// TODO - Properly extend marker class

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

for (tileId in downloadMarkers) {
    downloadMarkers[tileId].addTo(map)
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
                bookmarksList.render()
                bookmarkPopup.remove() // Don't know why close() doesn't work, don't care.

                // Hide the search marker, replace it with the new saved
                // bookmark marker (which has a different style, so it
                // indicates to the user that it's now saved)
                searchMarker.remove()
                setSavedBookmarkMarker(bookmarkId, bookmark)
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
                bookmarksList.render()
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
    bookmarkId = e.target.getAttribute('data-bookmark-id')
    bookmark = JSON.parse(e.target.getElementsByClassName("bookmark-data")[0].textContent)
    setSavedBookmarkMarker(bookmarkId, bookmark)
}

const setSavedBookmarkMarker = (bookmarkId, bookmark) => {
    selectedSavedBookmark = bookmark
    selectedSavedBookmark.id = bookmarkId

    map.setView(L.latLng(selectedSavedBookmark.latlng), 17)

    savedBookmarkMarker
        .setLatLng(L.latLng(selectedSavedBookmark.latlng))
        .addTo(map)

    // A real hack around the fact that zoom seems to make the tooltip disappear
    setTimeout(() => {
        savedBookmarkMarker
            .bindTooltip(selectedSavedBookmark.name)
            .openTooltip()
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
updateDownloadStatuses()

const searchControl = new L.Control.Search({
    url: 'search?q={s}',
    textPlaceholder: 'Cafes, stores, post offices...',
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

// TODO websockets
const renderLoop = () => {
    bookmarksList.render()
        .then(() => {
            setTimeout(renderLoop, 5000)
        })
}

renderLoop()

// TODO - this doesn't work in sandstorm! figure something out...
function getLocFromHash() {
    coords = location.hash.split('_').slice(1).map(Number)
    if (coords.length != 4 || coords.includes(undefined) || coords.includes(NaN)) {
        return null // deal with it another way
    }

    [north, east, south, west] = coords

    return L.latLngBounds(
        L.latLng(north, east),
        L.latLng(south, west),
    )
}

function getLocFromBookmarks() {
    bookmarks = #BOOKMARKS
    if (!bookmarks) return null

    // Don't know which corners are which cardinal directions, don't care
    let [lat1, lng1, lat2, lng2] = bookmarks

    return L.latLngBounds(
        L.latLng(lat1, lng1),
        L.latLng(lat2, lng2),
    )
}

// TODO - this doesn't work in sandstorm! figure something out...
function setLoc() {
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
initialLoc = getLocFromHash() || getLocFromBookmarks()
if (initialLoc !== null) {
    map.fitBounds(initialLoc)
} else {
    map.fitBounds(
        L.latLngBounds(
            L.latLng(17.476432197195518, -166.99218750000003),
            L.latLng(59.489726035537075, 0.3515625),
        )
    )
}

// TODO - this doesn't work in sandstorm! figure something out...
// in case they were set to something invalid before
setLoc()
map.on('zoomend', setLoc)
map.on('moveend', setLoc)
map.on('zoomend', setGeoJsonOpacity)
