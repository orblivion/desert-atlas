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

function screenWidth() {
    var body = document.body
    var html = document.documentElement

    return Math.min(
        body.scrollWidth,
        body.offsetWidth,
        html.clientWidth,
        html.scrollWidth,
        html.offsetWidth,
    );
}

var data = {bookmarks: {}}

var initlBoundsStarted = false
function initBounds() {
    if (initlBoundsStarted) return
    initlBoundsStarted = true
    initBoundsLoop()
}

const DOWNLOAD_RECT_MAX_ZOOM = 6
const POI_FRIENDLY_ZOOM = 17
const CITY_FRIENDLY_ZOOM = 13

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

    MIN_DISTANCE = 0.0005
    if (
        Math.abs(bounds.getNorth() - bounds.getSouth()) < MIN_DISTANCE &&
        Math.abs(bounds.getEast() - bounds.getWest()) < MIN_DISTANCE
    ) {
        // Probably just one marker
        map.setView(L.latLng(bounds.getNorthWest()), POI_FRIENDLY_ZOOM)
    } else if (padding) {
        map.fitBounds(bounds, {padding})
    } else {
        map.fitBounds(bounds)
    }

    initialBounds = bounds
}

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
// Probably best to bind the bookmarkId to the popup as we render it. I think that'd keep it in sync? More in sync at least?
var popupMarkerBookmark = null

L.Control.BookmarksList = L.Control.extend({
    onAdd: function(map) {
        // Mobile doesn't have that much real estate. But on desktop it might
        // be nice to still see bookmarks as they're being added. On mobile
        // they'll more likely see the flash.
        this.expanded = !L.Browser.mobile

        this.list = L.DomUtil.create('div');
        this.render()
        return this.list;
    },

    render: function() {
        let listItems = `
            <div id='bookmarks-export'>Export To App</div>
        `
        for (bookmarkId in data.bookmarks) {
            divId = `bookmark-list-${bookmarkId}`
            bookmarkData = JSON.stringify(data.bookmarks[bookmarkId])
            listItems += `
            <div id='${divId}' data-bookmark-id=${bookmarkId} class='bookmark-list-item'>
                ${data.bookmarks[bookmarkId]['name']}
            </div>
            `
        }

        const HIDE_BOOKMARK_MENU = '<span style="float:left;">\u{2B05}</span><center>Bookmarks</center>'
        const SHOW_BOOKMARK_MENU = '\u{1F516}'

        if (this.expanded) {
            expandedDisplayStyle = ''
            collapsedDisplayStyle = 'display:none;'
        } else {
            expandedDisplayStyle = 'display:none;'
            collapsedDisplayStyle = ''
        }
        newHtml = `
        <div id='bookmark-list-container' class="leaflet-interactive leaflet-bar">
            <div style="background-color: #f4aa88;">  <!-- For the flashing animation -->
                <a class='bookmark-list-show' style='${collapsedDisplayStyle}'>${SHOW_BOOKMARK_MENU}</a>
            </div>
            <a class='bookmark-list-hide' style='width:auto; min-width:10em;${expandedDisplayStyle}'>${HIDE_BOOKMARK_MENU}</a>
            <div id='bookmark-list' style='${expandedDisplayStyle}'>
                ${listItems}
            </div>
        </div>
        `

        // TODO - This is a hack to keep the scroll the same. Eventually
        // we want to not refresh it entirely on each change. Only
        // refresh/add/remove items etc etc so user events don't get messed up.
        let inner = document.getElementById('bookmark-list')
        let scrollSave = null
        if (inner !== null) scrollSave = inner.scrollTop
        this.list.innerHTML = newHtml
        inner = document.getElementById('bookmark-list') // it's a new one now
        if (scrollSave !== null) inner.scrollTop = scrollSave

        setTimeout(() => { // setTimeout, my solution for everything. As written, it can't find bookmarks-export without this.
            $('#bookmarks-export').off("click")
            $('#bookmarks-export').on("click", clickBookmarksExport)
            let thisControl = this
            $('.bookmark-list-show').off("click")
            $('.bookmark-list-hide').off("click")
            $('.bookmark-list-hide').on("click", () => {
                thisControl.expanded = false
                $('#bookmark-list').slideUp(400, () =>{
                    // Change the button only after slide up completes. Looks nicer.
                    $('.bookmark-list-show').show()
                    $('.bookmark-list-hide').hide()
                })
            })
            $('.bookmark-list-show').on("click", () => {
                thisControl.expanded = true
                // Change the button before the slidedown. Looks nice.
                $('.bookmark-list-show').hide()
                $('.bookmark-list-hide').show()
                $('#bookmark-list').slideDown()
            })
            for (id in data.bookmarks) {
                divId = `bookmark-list-${id}`
                $('#' + divId).off("click")
                $('#' + divId).on("click", clickBookmarkListItem)
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

if (permissions.indexOf("bookmarks") === -1) {
    bookmarkEditClass = "is-read-only"
} else {
    bookmarkEditClass = "is-editor"
}

const bookmarkPopup = L.popup()
    .setContent(
        `
      <h1 id="bookmark-header"></h1>
      <div id="search-marker-submit" class="${bookmarkEditClass}">
          <input id="bookmark-edit-name" class="for-editor bookmark-edit-name">
          <input id="bookmark-edit-name-readonly" class="for-read-only bookmark-edit-name" readonly>
          <center><span style="margin-top: 7px; text-align: center;" class="for-read-only" id="bookmark-readonly-notice"></span></center>
          <div style="margin-top: 7px" class="for-editor">
              <button id="bookmark-edit-save-button" class="bookmark-edit-button">Save Bookmark</button>
              <button id="bookmark-edit-delete-button" class="bookmark-edit-button" style="display:none;">Delete</button>
              <span id="bookmark-edit-loading" style="display:none">SAVING CHANGES...</span>
          </div>
          <hr>
          <div style="background-color: #eee; padding: .5em; margin-top: 7px">
              <h2 style="margin:0px; padding:0px;">Open location in external app</h2>
              <center style="margin:0px; padding:0px;">(Depends on your setup)</center>
              <br>
              <button id="bookmark-edit-geo-button" class="bookmark-edit-button">
                  <span class="emoji">&#x23CF;&#xFE0F;</span>&nbsp Open
              </button>
              <button id="bookmark-edit-geo-button-learn-more-button" class="bookmark-edit-button">
                  <span class="emoji">&#x2139;</span>&nbsp Learn More
              </button>
              <br>
              <br>
              <div id="bookmark-edit-geo-button-learn-more">
              <div>
                  This will work on limited systems. It's known to work for:
                  <ul>
                      <li>OrganicMaps on iOS and Android</li>
                      <li>OsmAnd on Android</li>
                      <li>Gnome Maps on Linux Desktop</li>
                  </ul>
              </div>
              </div>
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
        document.getElementById("bookmark-edit-name-readonly").value = popupMarkerBookmark.name
        document.getElementById("bookmark-edit-name").value = popupMarkerBookmark.name

        if (!L.Browser.mobile) { // Annoying on mobile to bring up the keyboard right away
            document.getElementById("bookmark-edit-name").focus()
        }

        // Remove it first in case it's already there from a previous popup *shrug* not sure the best way to handle this
        document.getElementById('bookmark-edit-save-button').removeEventListener("click", addBookmark)
        document.getElementById('bookmark-edit-delete-button').removeEventListener("click", deleteBookmark)
        document.getElementById('bookmark-edit-name').removeEventListener("keydown", bookmarkKeydown)
        document.getElementById('bookmark-edit-geo-button').removeEventListener("click", openBookmarkInApp)
        document.getElementById('bookmark-edit-geo-button-learn-more-button').removeEventListener("click", showGeoButtonLearnMore)

        document.getElementById('bookmark-edit-save-button').addEventListener("click", addBookmark)
        document.getElementById('bookmark-edit-name').addEventListener("keydown", bookmarkKeydown)
        document.getElementById('bookmark-edit-delete-button').addEventListener("click", deleteBookmark)
        document.getElementById('bookmark-edit-geo-button').addEventListener("click", openBookmarkInApp)

        if (popupMarkerBookmark.id) {
            document.getElementById("bookmark-edit-delete-button").style.display = 'inline';
            document.getElementById('bookmark-readonly-notice').textContent = "(You cannot currently edit bookmarks)"
        } else {
            document.getElementById('bookmark-readonly-notice').textContent = "(You cannot currently save bookmarks)"
        }

        if (bookmarkPopup.options.bookmarkEditType === "existing") {
            document.getElementById('bookmark-header').textContent = "Bookmark"
        } else if (bookmarkPopup.options.bookmarkEditType === "arbitrary") {
            document.getElementById('bookmark-header').textContent = "Location"
            // Just because the blank space is awkward for read-only otherwise
            document.getElementById('bookmark-edit-name-readonly').style.display = 'none'
        } else if (bookmarkPopup.options.bookmarkEditType === "search") {
            document.getElementById('bookmark-header').textContent = "Search Result"
        }

        document.getElementById('bookmark-edit-geo-button-learn-more-button').addEventListener("click", showGeoButtonLearnMore)
    })

L.Util.setOptions(bookmarkPopup, {autoPanPadding: [0, 180]})

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
    })
    .on('click', () => {
        popupMarkerBookmark = searchResultBookmark
        bookmarkPopup.options.bookmarkEditType = "search"
        bookmarkPopup
            .setLatLng(L.latLng(searchResultBookmark.latlng))
            .openOn(map)
    })

let areaBoundses = {}
downloadRects = {}

function tryMakeDownloadRects(newAreaBoundses) {
    const boundsAvailable = !!newAreaBoundses
    const boundsAlreadySet = !!Object.keys(areaBoundses).length

    if (!boundsAvailable || boundsAlreadySet) {
        return
    }

    areaBoundses = newAreaBoundses
    for (key in areaBoundses) {
        // Later, if/when we have administrative regions again, we'll again
        // have set a useful name to label the region with.
        downloadRects[key] = downloadRect(key)
    }
}

const uiStyle = {
    downloadRect: {
        normal: {
            color: '#ff7800',
            opacity: 0.1,
            fillOpacity: 0,
            weight: 1,
        },
        highlighted: {
            color: '#ffdd00',
            opacity: 0.4,
            fillOpacity: 0.4,
            weight: 1,
        },
        downloaded: {
            color: '#23ff00',
            fillOpacity: 0.2,
        },
    },
    borders: {
        weight: 2,
        color: '#000000',
        fillColor: '#fff',
        opacity: 1,
        fillOpacity: 1,
    },
    background: {
        water: {
            color: '#b7dff2',
        },
        zoomedIn: {
            color: '#fff',
        },
    },
}

// TODO - Properly extend other marker classes

const downloadPopup = L.popup()

function downloadRect(tileId) {
        let bounds = areaBoundses[tileId]
        let center = [
            (bounds[1][0] + bounds[0][0]) / 2,
            (bounds[1][1] + bounds[0][1]) / 2,
        ]
        return L.rectangle(bounds, uiStyle.downloadRect.normal)
        .on('click', () => {
            if (!(tileId + '.pmtiles' in loaded)) {
                downloadPopup
                .setContent(`<div>
                    Download this area to this grain?<br>
                    <button onclick="downloadMap('${tileId}'); downloadPopup.remove()">Ok</button>
                    <button onclick="downloadPopup.remove()">Cancel</button>
                </div>`)
                .setLatLng(L.latLng(center))
                .addTo(map)
            } else {
                // If it's downloaded and you click on it, it zooms and pans
                // you to the area, unless you're already zoomed in as far as
                // or further than it would take you to.
                if (map.getBoundsZoom(areaBoundses[tileId]) > map.getZoom()) {
                    map.fitBounds(areaBoundses[tileId])
                }
            }
        })
        .on('mouseover', e => {
            if (loaded[tileId + '.pmtiles'] !== "done") {
                e.target.setStyle(uiStyle.downloadRect.highlighted)
            }
        })
        .on('mouseout', e => {
            if (loaded[tileId + '.pmtiles'] !== "done") {
                e.target.setStyle(uiStyle.downloadRect.normal)
            }
        })
}

function downloadMap(tileId) {
    loaded[tileId + '.pmtiles'] = "downloading"
    // force it to start the faster update loop right away, since this user initiated the
    // download. otherwise it has to wait to finish a slower loop before it even knows to go fast.
    updateDownloadStatuses()

    fetch('download-map', {
        method: 'POST',
        body: JSON.stringify({'tile-id': tileId}),
    })
    .catch(console.log)
}

const showGeoButtonLearnMore = (() => {
    $('#bookmark-edit-geo-button-learn-more').slideDown()
})

const openBookmarkInApp = (() => {
    const {lat, lng} = popupMarkerBookmark.latlng
    window.open(`geo://${lat},${lng}`, "_blank")
})

const bookmarkKeydown = (e => {
    if (e.which === 13) {
        addBookmark()
    }
})

const addBookmark = (() => {
    // The popup is generated anew each time so we don't need to worry about
    // undoing these changes
    $('#bookmark-edit-loading').show()
    $('#bookmark-edit-save-button').hide()
    $('#bookmark-edit-delete-button').hide()

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

                selectBookmarkMarker(bookmarkId, false)
                // flash the menu button
                if (!bookmarksList.expanded) {
                    $('.bookmark-list-show').fadeOut(100).fadeIn(1000)
                }
            }, 500)
        })
        .catch(console.log)
})

const deleteBookmark = (() => {
    // The popup is generated anew each time so we don't need to worry about
    // undoing these changes
    $('#bookmark-edit-loading').show()
    $('#bookmark-edit-save-button').hide()
    $('#bookmark-edit-delete-button').hide()

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
    selectBookmarkMarker(e.target.getAttribute('data-bookmark-id'), true)

    if (L.Browser.mobile) { // Otherwise there's not really enough room to see what you just clicked on
        $('.bookmark-list-hide').click()
    }
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
        popupMarkerBookmark = data.bookmarks[e.layer.options.bookmarkId]
        if (popupMarkerBookmark) { // timing issues?
            bookmarkPopup.options.bookmarkEditType = "existing"
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

const selectBookmarkMarker = (bookmarkId, doZoom) => {
    let bookmark = data.bookmarks[bookmarkId]
    if (doZoom) {
        map.setView(L.latLng(bookmark.latlng), POI_FRIENDLY_ZOOM)
    } else {
        map.setView(L.latLng(bookmark.latlng))
    }

    setTimeout(() => { // setTimeout, my solution for everything
        // Some indication that this thing has been selected
        bookmarkMarkers[bookmarkId].openTooltip()
    }, 100)
}

// TODO - key this by `tileId` instead of `tileId + '.pmtiles'`
let loaded = {}

let updateDownloadStatusesTimeout = null
function updateDownloadStatuses() {
    loadedStatuses = new Set(Object.values(loaded))

    clearTimeout(updateDownloadStatusesTimeout)
    if (loadedStatuses.size === 0 || (loadedStatuses.size === 1 && loadedStatuses.has("done"))) {
        // If every `loaded` status is "done", we can wait another 5 seconds to
        // check on map download status. There should only be any new downloads after those 5
        // seconds if another user/share started a download, or the downloading user refreshed
        // the page mid-download. In these cases we don't care that much if it got a delayed
        // start. After it starts, it'll soon kick into a faster update loop.

        // Slower update loop
        updateDownloadStatusesTimeout = setTimeout(updateDownloadStatuses, 5000)
    } else {

        // Faster update loop
        updateDownloadStatusesTimeout = setTimeout(updateDownloadStatuses, 1000)
    }

    return fetch('map-download-status', {
        method: 'GET'
    })
    .then(e => e.json())
    .then(fullStatus => {
        const inProgress = fullStatus['in-progress']

        // If another user/share started the download and we see it here, or
        // the downloading user reloaded the window mid-download, set it in the
        // "loaded" field so that this grain does the faster update loop
        // and sees the download progress bar faster. It may take a second to
        // kick into the faster loop but it's okay. It's less important since
        // this user/share didn't start the download.
        for (tileId in inProgress) {
            if (!((tileId + '.pmtiles') in loaded)) {
                loaded[tileId + '.pmtiles'] = "downloading"
            }
        }

        fullStatus.done.forEach(tileId => {
            loadArea(tileId)
        })

        // Don't care about the rest for anyone who can't download regions
        if (permissions.indexOf("download") === -1) {
            return
        }

        tryMakeDownloadRects(fullStatus['available-areas'])
        Object.keys(downloadRects).forEach(tileId => {
            if (map.getZoom() > DOWNLOAD_RECT_MAX_ZOOM) {
                downloadRects[tileId].remove()
            } else {
                downloadRects[tileId].addTo(map)
            }

            tooltipContent = null

            if (loaded[tileId + '.pmtiles'] === "done") {
                // Greenish means downloaded
                downloadRects[tileId].setStyle(uiStyle.downloadRect.downloaded)
            } else if (fullStatus.done.includes(tileId) || loaded[tileId + '.pmtiles'] === "started") {
                tooltipContent = "Downloaded. Loading on screen..."
            } else if (tileId in inProgress) {
                if (inProgress[tileId].downloadDone !== inProgress[tileId].downloadTotal) {
                    downloadPercentage = Math.round(100 * (inProgress[tileId].downloadDone / inProgress[tileId].downloadTotal))
                    tooltipContent = (
                        'Downloading this area' +
                        `<div style='width:100px;border-style:solid;'>
                            <div style='width:${downloadPercentage}%; background-color:#555'>&nbsp</div>
                        </div>`
                    )
                } else {
                    searchImportPercentage = inProgress[tileId].searchImportTotal ?
                        Math.round(100 * (inProgress[tileId].searchImportDone / inProgress[tileId].searchImportTotal)) : 0
                    tooltipContent = (
                        'Importing search data for this area' +
                        `<div style='width:100px;border-style:solid;'>
                            <div style='width:${searchImportPercentage}%; background-color:#555'>&nbsp</div>
                        </div>`
                    )
                }
            } else if (fullStatus.queued.includes(tileId)) {
                tooltipContent = 'Queued for download'
            } else {
                tooltipContent = null
            }

            let tooltip = downloadRects[tileId].getTooltip()
            if (tooltipContent) {
                if (tooltip) {
                    tooltip.setContent(tooltipContent)
                } else {
                    downloadRects[tileId].bindTooltip(tooltipContent, {permanent: true})
                }
            } else {
                if (tooltip) {
                    downloadRects[tileId].unbindTooltip()
                }
            }
        })
    })
}

function loadArea(tileId) {
    const tilesName = tileId + ".pmtiles"
    if (loaded[tilesName] === "started" || loaded[tilesName] === "done") {
        return
    }

    // TODO - wait, "started" doesn't even take effect anywhere, this isn't
    // threaded. right? we set it to "done" right below, not after a callback
    // or anything.
    loaded[tilesName] = "started"
    console.log('adding', tilesName)

    areaLayer = protomaps.leafletLayer({
        attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        url: tilesName,
    })
    areaLayer.addTo(map)

    console.log('added', tilesName)
    loaded[tilesName] = "done"
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
                // Public domain but they said they'd appreciate attribution
                attribution: (
                    '<a href="https://www.naturalearthdata.com/">Natural Earth</a>, ' +
                    '<a href="https://github.com/lexman">Lexman</a>, ' +
                    '<a href="https://okfn.org/">Open Knowledge Foundation</a>'
                    '<a href="https://geonames.org/">GeoNames</a>'
                ),
                style:
                {
                    ...uiStyle.borders,
                    interactive: false,
                }
            }).addTo(map)
            geoJsons[name] = geoJsonLayer
            setGeoJsonOpacityAndBackground()
            return geoJsonLayer
        })
    })
    .catch(console.log)
}

function setGeoJsonOpacityAndBackground () {
    if (map.getZoom() > 6) {
        $('.leaflet-container').css({background: uiStyle.background.zoomedIn.color})
    } else {
        $('.leaflet-container').css({background: uiStyle.background.water.color})
    }
    for (name in geoJsons) {
        let opacity, fillOpacity

        if (map.getZoom() > 9) {
            geoJsons[name].remove()
        } else if (map.getZoom() > 6) {
            opacity = fillOpacity = 1 / ((map.getZoom() - 5) * (map.getZoom() - 5))
            geoJsons[name].addTo(map)
        } else {
            opacity = fillOpacity = 1
            geoJsons[name].addTo(map)
        }

        geoJsons[name].bringToBack()
        geoJsons[name].setStyle({opacity, fillOpacity})
    }
}

geoJsons = {}

// Give a very simple backdrop so people have some idea where on the map they are
// These take up less space than tiles, especially when "simplified".
// TODO - probably actually replace this with dead simple world map tiles if I can.
// It will look better. Also geoJson seems to want to always be on top of tiles so
// it'll always show up at least a little bit.
getGeoJson("countries")
getGeoJson("usa-states")

updateDownloadStatuses()

const searchControl = new L.Control.Search({
    url: () => {
        const lat = (
            map.getBounds().getNorth() +
            map.getBounds().getSouth()
        ) / 2
        const lng = (
            map.getBounds().getEast() +
            map.getBounds().getWest()
        ) / 2
        return 'search?q={s}&lat=' + lat + '&lng=' + lng
    },
    textPlaceholder: 'Nearby cafes, streets, parks...',
    position: 'topright',
    marker: searchMarker,
    moveToLocation: (latlng, title) => {
        PUNCTUATION_SPACE = '\u2008'
        BASEMAP_MARKER = PUNCTUATION_SPACE + PUNCTUATION_SPACE
        // Super hack. See "BASEMAP_MARKER" in server code.
        if (title.slice(-2) == BASEMAP_MARKER) {
            // If we're looking at a "place" (state, country, city) loaded from
            // the basemap, we want to be zoomed out enough to be able to
            // download the regions.
            //
            // On the other hand, if it's in an already downloaded region, it's
            // gonna be kind of annoying to be zoomed out when you just want to
            // go to a city. So in that case don't zoom out quite so much, but
            // more so than if you're looking at a POI.
            for (key in loaded) {
                // key is in format <tileId>.pmtiles
                let [tileId] = key.split('.')
                let bounds = L.latLngBounds(areaBoundses[tileId])
                if (bounds.contains(latlng)) {
                    map.setView(latlng, CITY_FRIENDLY_ZOOM);
                    return
                }
            }
            map.setView(latlng, DOWNLOAD_RECT_MAX_ZOOM);
        } else {
            map.setView(latlng, POI_FRIENDLY_ZOOM);
        }
    },
})

searchControl.on('search:locationfound', function(event) {
    searchResultBookmark = {
        latlng: event.latlng,
        name: event.text
    }
    searchMarker
        .bindTooltip(searchResultBookmark.name)
        .openTooltip()
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

    if (screenWidth() > 400) {
        // Some padding is nice for keeping markers in view and not on the fringes
        // Horizontal is higher because of the menu on the left
        padding = [200, 50]
    } else {
        // If we're on mobile or something, padding will break, so forget it.
        padding = null
    }

    return [
        bookmarkMarkerFeatureGroup.getBounds(), padding
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
    REFRESH_PRECISION = 4 // TODO wait I didn't use this. I think I wanted to reduce the sigfigs to not have such a long URL.

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
map.on('zoomend', setGeoJsonOpacityAndBackground)

map.on('contextmenu', function (event) {
    popupMarkerBookmark = {
        latlng: event.latlng,
        name: ''
    }

    // Close the popup before opening it again, to trigger the "on add" event.
    // For some reason, closing is not necessary when clicking between multiple
    // existing markers.
    // TODO - investigate this phenomenon more, perhaps
    bookmarkPopup.close()

    bookmarkPopup.options.bookmarkEditType = "arbitrary"
    bookmarkPopup
        .setLatLng(L.latLng(popupMarkerBookmark.latlng))
        .openOn(map)
})
