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
    .then(res => {
        res.json().then(updatedBookmarks => {
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

LOADED_DONE = "done"
LOADED_STARTED = "started"
LOADED_DOWNLOADING = "downloading"
let loaded = {}

// This variable should be derivable from `loaded` but we don't treat queued
// areas in `loaded` consistently (See definition of `downloadArea`). But, I
// don't want to fix that so close to launch.
let showPerformanceWarning = false;

function loadedStatus(tileId) {
    return loaded[tileId] && loaded[tileId].status
}

function loadedNumDone() {
    return Object.entries(loaded).filter(([k,{status}]) => status === LOADED_DONE).length
}

L.Control.AreasMenu = L.Control.extend({
    onAdd: function(map) {
        this.menu = L.DomUtil.create('div');
        this.expanded = false
        this.render()
        return this.menu
    },

    render: function() {
        const HIDE_AREAS_MENU = '<span style="float:left;">\u{2B05}</span><center>Downloaded Areas</center>'
        const SHOW_AREAS_MENU = '\u{1F5FA}\u{FE0F}'

        const numAreas = loadedNumDone()

        const pluralizedAreas = numAreas === 1 ? "area" : "areas"

        if (numAreas === 0 || permissions.indexOf("download") === -1) {
            // Hide the menu if there are no areas. It doesn't matter yet,
            // don't distract the user. Or if the user can't download anyway,
            // of course.
            this.menu.innerHTML = `
            `
        } else {
            if (this.expanded) {
                expandedDisplayStyle = ''
                collapsedDisplayStyle = 'display:none;'
            } else {
                expandedDisplayStyle = 'display:none;'
                collapsedDisplayStyle = ''
            }
            this.menu.innerHTML = `
                <div id='areas-menu-container' class="leaflet-bar">
                    <div style="background-color: #f4aa88;" class="leaflet-interactive">  <!-- For the flashing animation -->
                        <a class='areas-menu-show' style='${collapsedDisplayStyle}'>${SHOW_AREAS_MENU}</a>
                    </div>
                    <a class='areas-menu-hide leaflet-interactive da-control-header' style='width:auto; min-width:10em;${expandedDisplayStyle};'>${HIDE_AREAS_MENU}</a>

                    <div id='areas-menu-collapsable' style='${expandedDisplayStyle}'>
                        <div id="areas-menu-delete" style="padding: 5px">
                            You have downloaded ${numAreas} ${pluralizedAreas} of the world map (not counting any that may be in-progress or queued). If you want to clear out the map, you can delete all downloaded map areas.
                            <br>
                            <br>
                            <b>Note</b>:
                            <ul>
                              <li>Any in-progress or queued downloads will <i>not be canceled</i>. You can restart your grain to cancel them, or else wait until they finish before they can be deleted.</li>
                              <li>This will <i>not</i> delete any of your bookmarks</li>
                            </ul>
                            <center>
                                <button id="areas-menu-delete-button" class="da-button" style="width:98%">Delete All Downloaded Map Areas</button>
                            </center>
                        </div>
                        <div id="areas-menu-delete-confirm" style="display:none; background-color: #ecc; padding: 5px;">
                            <b>Are you sure you want to delete all downloaded map data from this grain?</b>
                            <br>
                            <button id="areas-menu-delete-confirm-button" class="da-button" style="width:48%">Confirm</button>
                            <button id="areas-menu-delete-cancel-button" class="da-button" style="width:48%"">Cancel</button>
                        </div>
                        <div id="areas-menu-delete-done" style="display:none; padding: 5px;">
                            All areas are queued up for deletion. You may need to wait for some downloads to finish first.
                        </div>
                    </div>
                </div>
            `
        }

        let thisControl = this
        setTimeout(() => { // setTimeout, my solution for everything. I needed it for bookmarks menu, I'll just do the same here.
            let thisControl = this
            $('.areas-menu-show').off("click")
            $('.areas-menu-hide').off("click")
            $('.areas-menu-hide').on("click", () => {
                thisControl.expanded = false
                $('#areas-menu-collapsable').slideUp(400, () =>{
                    // Change the button only after slide up completes. Looks nicer.
                    $('.areas-menu-show').show()
                    $('.areas-menu-hide').hide()

                    // Reset the delete confirmation
                    $('#areas-menu-delete-confirm').hide()
                    $('#areas-menu-delete-done').hide()
                    $('#areas-menu-delete').show()

                    if (numAreas === 0) {
                        // Hide the whole menu again
                        thisControl.render()
                    }
                })
            })
            $('.areas-menu-show').on("click", () => {
                // Change the button before the slidedown. Looks nice.
                thisControl.expanded = true
                $('.areas-menu-show').hide()
                $('.areas-menu-hide').show()
                $('#areas-menu-collapsable').slideDown()
            })


            $('#areas-menu-delete-button').off("click")
            $('#areas-menu-delete-cancel-button').off("click")
            $('#areas-menu-delete-confirm-button').off("click")
            $('#areas-menu-delete-button').on("click", () => {
                $('#areas-menu-delete').slideUp()
                $('#areas-menu-delete-confirm').slideDown()
            })
            $('#areas-menu-delete-cancel-button').on("click", () => {
                $('#areas-menu-delete-confirm').slideUp()
                $('#areas-menu-delete').slideDown()
            })
            $('#areas-menu-delete-confirm-button').on("click", () => {
                deleteArea('all')
            })
        }, 100)
    },

    flash: function() {
        if (!this.expanded) {
            $('.areas-menu-show').fadeOut(100).fadeIn(1000)
        }
    },
});

L.control.areasMenu = function() {
    return new L.Control.AreasMenu({
        position: 'topleft'
    });
}

const areasMenu = L.control.areasMenu()
areasMenu.addTo(map)

// tileId === "all" to delete all areas
const deleteArea = (tileId => {
    fetch('map-delete', {
            method: 'POST', // should be DELETE on the same path as POST, but I don't want to figure this out now
            body: JSON.stringify({'tile-id': tileId}),
    })
    .then(res => {
        if (res.status === 200) {
            $('#areas-menu-delete-confirm').slideUp()
            $('#areas-menu-delete-done').slideDown()

            // It takes a while for the stuff to disappear otherwise, and a
            // delete feels like it should be fast. So let's mark things as
            // "deleting" and then call updateDownloadStatuses to bring on
            // the fast update loop until everything is deleted.
            if (tileId === "all") {
                for (tId in loaded) {
                    loaded[tId].deleting = true
                }
            } else {
                loaded[tileId].deleting = true
            }

            updateDownloadStatuses()
        }
    })
    .catch(console.error)
})

L.Control.BookmarksList = L.Control.extend({
    onAdd: function(map) {
        // Mobile doesn't have that much real estate. But on desktop it might
        // be nice to still see bookmarks as they're being added. On mobile
        // they'll more likely see the flash.
        this.expanded = !L.Browser.mobile

        this.list = L.DomUtil.create('div');
        this.curPage = 0
        this.render()
        return this.list;
    },

    render: function() {
        let listItems = `
            <div id='bookmarks-export'>Export To App</div>
        `

        const PAGE_SIZE = 7;
        bookmarkIds = Object.keys(data.bookmarks)

        this.numPages = Math.max(
            // Enough pages to cover the existing bookmarks. That means we want to round up.
            Math.ceil(bookmarkIds.length / PAGE_SIZE),

            // If there are no bookmarks, we still want one empty page
            1,
        )

        // Let say there is more than one page, we are on the last page, it
        // only has one bookmark, and it gets deleted. The number of pages goes
        // down by one, and we'd be past the last page. In this case, make sure
        // we're on the new last page instead.
        this.curPage = Math.min(this.curPage, this.numPages - 1)

        for (page=0; page<this.numPages; page++) {
            // Hide all but the current page
            if (this.curPage === page) {
                listItems += `<div id='bookmark-list-page-${page}'>`
            } else {
                listItems += `<div id='bookmark-list-page-${page}' style="display:none;">`
            }

            let bookmarksForPage = bookmarkIds.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE)
            for (bookmarkId of bookmarksForPage) {
                divId = `bookmark-list-${bookmarkId}`
                bookmarkData = JSON.stringify(data.bookmarks[bookmarkId])
                listItems += `
                <div id='${divId}' data-bookmark-id=${bookmarkId} class='bookmark-list-item'>
                    ${data.bookmarks[bookmarkId]['name']}
                </div>
                `
            }
            listItems += `</div>`
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

        let prevButtonClass = nextButtonClass = '';

        if (this.curPage <= 0) {
            prevButtonClass = "disabled"
        }
        if (this.curPage >= this.numPages - 1) {
            nextButtonClass = "disabled"
        }


        this.list.innerHTML = `
        <div id='bookmark-list-container' class="leaflet-bar">
            <div style="background-color: #f4aa88;" class="leaflet-interactive">  <!-- For the flashing animation -->
                <a class='bookmark-list-show' style='${collapsedDisplayStyle}'>${SHOW_BOOKMARK_MENU}</a>
            </div>
            <a class='bookmark-list-hide leaflet-interactive da-control-header' style='width:auto; min-width:10em;${expandedDisplayStyle}'>${HIDE_BOOKMARK_MENU}</a>
            <div id='bookmark-list-collapsable' style='${expandedDisplayStyle}'>
                <div id='bookmark-list'>
                    ${listItems}
                </div>

                <center>
                    <span id='bookmarks-prev-page' style="float:left;" class="${prevButtonClass}">\u{2B05} Previous&nbsp</span>
                    <span id='bookmarks-next-page' style="float:right;" class="${nextButtonClass}">&nbspNext \u{27A1}</span>
                    <b id='bookmarks-page-number'>(${this.curPage + 1}/${this.numPages})</b>
                </center>
            </div>
        </div>
        `

        setTimeout(() => { // setTimeout, my solution for everything. As written, it can't find bookmarks-export without this.
            $('#bookmarks-export').off("click")
            $('#bookmarks-export').on("click", clickBookmarksExport)


            $('#bookmarks-next-page').off("click")
            $('#bookmarks-next-page').on("click", clickBookmarksNextPage)
            $('#bookmarks-prev-page').off("click")
            $('#bookmarks-prev-page').on("click", clickBookmarksPrevPage)

            let thisControl = this
            $('.bookmark-list-show').off("click")
            $('.bookmark-list-hide').off("click")
            $('.bookmark-list-hide').on("click", () => {
                thisControl.expanded = false
                $('#bookmark-list-collapsable').slideUp(400, () =>{
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
                $('#bookmark-list-collapsable').slideDown()
            })
            for (id in data.bookmarks) {
                divId = `bookmark-list-${id}`
                $('#' + divId).off("click")
                $('#' + divId).on("click", clickBookmarkListItem)
            }
        }, 100)
    },

    flash: function() {
        if (!this.expanded) {
            $('.bookmark-list-show').fadeOut(100).fadeIn(1000)
        }
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
      <div id="bookmark-edit-section-edit" class="${bookmarkEditClass}">
          <div id="bookmark-edit-name-display" class="bookmark-edit-name"></div>
          <center><span style="margin-top: 7px; text-align: center;" class="for-read-only" id="bookmark-readonly-notice"></span></center>
          <div style="margin-top: 7px" class="for-editor">
              <center id="edit-and-delete-buttons">
                  <!-- Text of the button is variable, see below -->
                  <button id="bookmark-edit-begin-button" class="da-button" style="width:48%"></button>

                  <button id="bookmark-edit-delete-button" class="da-button" style="display:none;width:48%">Delete</button>
              </center>
              <center id="edit-bookmark-title-form" style="display:none;">
                  <input id="bookmark-edit-name" class="for-editor bookmark-edit-name" style="width:96%">
                  <button id="bookmark-edit-save-button" class="da-button" style="width:48%">Save Bookmark</button>
                  <button id="bookmark-edit-cancel-button" class="da-button" style="width:48%">Cancel</button>
              </center>
              <center id="editor-delete-are-you-sure" style="display:none; background-color: #ecc; padding: 5px;">
                  <b>Are you sure you want to delete this bookmark?</b>
                  <br>
                  <button id="bookmark-edit-delete-confirm-button" class="da-button" style="width:48%">Confirm</button>
                  <button id="bookmark-edit-delete-cancel-button" class="da-button" style="width:48%"">Cancel</button>
              </center>
              <span id="bookmark-edit-loading" style="display:none">SAVING CHANGES...</span>
          </div>
          <p><b>Latitude/Longitude</b>:<br><span id="bookmark-latlng"></span></p>
          <button id="bookmark-edit-show-geo-section-button" class="da-button" style="width:100%">
              <span class="emoji">\u{2B07}</span>&nbsp Open In External App
          </button>
      </div>
      <div id="bookmark-edit-section-geo" style="display:none; background-color: #eee; padding: .5em; margin-top: 7px">
          <h2 style="margin:0px; padding:0px;">Open location in external app</h2>
          <div id="bookmark-edit-geo-button-main">
              <p style="margin:2px; padding:2px;"><b>NOTE</b>: Depends on your setup. Click "Learn More" for details.</p>
              <p style="margin:2px; padding:2px;"><b><font color="red">WARNING</font></b>: If you don't have an external map app installed, this might (by some accounts) cause your browser to do a web search of this location, which would compromise privacy.</p>
              <br>
          </div>
          <center>
              <button id="bookmark-edit-geo-button" class="da-button" style="width:25%">
                  <span class="emoji">&#x23CF;&#xFE0F;</span>&nbsp Open
              </button>
              <button id="bookmark-edit-geo-button-learn-more-button" class="da-button" style="width:40%">
                  <span class="emoji">&#x2139;</span>&nbsp Learn More
              </button>
              <button id="bookmark-edit-show-edit-section-button" class="da-button" style="width:25%">
                  <span class="emoji">\u{2B06}</span>&nbsp Back
              </button>
          </center>
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
      <div id="search-marker-save-success" style="display:none;">
          <h2><center>Saved</center></h2>
      </div>
      <div id="search-marker-delete-success" style="display:none;">
          <h2><center>Deleted</center></h2>
      </div>
      <div id="search-marker-save-conflict" style="display:none;">
          <h2><center>Error saving your bookmark: Someone else must be editing this bookmark at the same time. Reopen it to see their edit and try again.</center></h2>
      </div>
      <div id="search-marker-save-error" style="display:none;">
          <h2><center>Error saving your bookmark: Something unexpected happened.</center></h2>
      </div>
      <div id="search-marker-delete-error" style="display:none;">
          <h2><center>Error deleting your bookmark: Something unexpected happened.</center></h2>
      </div>
      `
    )
    .on('add', e => {
        document.getElementById("bookmark-edit-name-display").innerText = bookmarkPopup.options.bookmark.name
        document.getElementById("bookmark-edit-name").value = bookmarkPopup.options.bookmark.name
        document.getElementById("bookmark-latlng").innerHTML = (
            bookmarkPopup.options.bookmark.latlng.lat + ',' + bookmarkPopup.options.bookmark.latlng.lng
        )

        addAndRemoveClickHandler = (eId, func) => {
            // Remove it first in case it's already there from a previous popup *shrug* not sure the best way to handle this
            document.getElementById(eId).removeEventListener('click', func)

            document.getElementById(eId).addEventListener('click', func)
        }

        addAndRemoveKeydownHandler = (eId, func) => {
            // Remove it first in case it's already there from a previous popup *shrug* not sure the best way to handle this
            document.getElementById(eId).removeEventListener('keydown', func)

            document.getElementById(eId).addEventListener('keydown', func)
        }

        addAndRemoveClickHandler('bookmark-edit-begin-button', editBookmarkStart)
        addAndRemoveClickHandler('bookmark-edit-cancel-button', editBookmarkCancel)

        addAndRemoveClickHandler('bookmark-edit-save-button', addBookmark)
        addAndRemoveClickHandler('bookmark-edit-delete-button', deleteBookmarkAreYouSure)
        addAndRemoveClickHandler('bookmark-edit-delete-cancel-button', deleteBookmarkCancel)
        addAndRemoveClickHandler('bookmark-edit-delete-confirm-button', deleteBookmark)

        addAndRemoveKeydownHandler('bookmark-edit-name', bookmarkKeydown)
        addAndRemoveClickHandler('bookmark-edit-geo-button', openBookmarkInApp)
        addAndRemoveClickHandler('bookmark-edit-geo-button-learn-more-button', toggleGeoButtonLearnMore)

        addAndRemoveClickHandler('bookmark-edit-show-geo-section-button', toggleBookmarkPopupSections)
        addAndRemoveClickHandler('bookmark-edit-show-edit-section-button', toggleBookmarkPopupSections)

        if (bookmarkPopup.options.bookmark.id) {
            document.getElementById("bookmark-edit-delete-button").style.display = 'inline';
            document.getElementById('bookmark-readonly-notice').textContent = "(You cannot currently edit bookmarks)"
        } else {
            document.getElementById('bookmark-readonly-notice').textContent = "(You cannot currently save bookmarks)"
        }

        if (bookmarkPopup.options.bookmarkEditType === "existing") {
            document.getElementById('bookmark-header').textContent = "Bookmark"
            document.getElementById('bookmark-edit-begin-button').textContent = "Edit"
        } else if (bookmarkPopup.options.bookmarkEditType === "arbitrary") {
            document.getElementById('bookmark-header').textContent = "Location"
            // Just because the blank space is awkward for read-only otherwise
            document.getElementById('bookmark-edit-name-display').style.display = 'none'

            // There's no text to be overflowing so we may as well drop right into
            // the editing interface
            document.getElementById('edit-and-delete-buttons').style.display = 'none'
            document.getElementById('edit-bookmark-title-form').style.display = 'inline'

            // In case they hit "cancel", have it be sensible text
            document.getElementById('bookmark-edit-begin-button').textContent = "Add As Bookmark"

            if (!L.Browser.mobile) { // Annoying on mobile to bring up the keyboard right away
                document.getElementById("bookmark-edit-name").focus()
            }
        } else if (bookmarkPopup.options.bookmarkEditType === "search") {
            document.getElementById('bookmark-header').textContent = "Search Result"
            document.getElementById('bookmark-edit-begin-button').textContent = "Add As Bookmark"
        }
    })

// could make it a method on bookmarkPopup but I'm lazy
function setBookmarkPopup(bookmark, editType) {
        bookmarkPopup.options.bookmarkEditType = editType

        // safe copy
        bookmarkPopup.options.bookmark = {
          name: bookmark.name,
          latlng: L.latLng(bookmark.latlng),

          // Undefined for new bookmarks
          id: bookmark.id,
          version: bookmark.version,
        }

        bookmarkPopup
          .setLatLng(L.latLng(bookmark.latlng))
          .openOn(map)
}

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
        setBookmarkPopup(searchMarker.options.bookmark, "search")
    })

let areaBoundses = {}
let downloadRects = {}

function updateAreaBoundses(newAreaBoundses) {
    const newBoundsAvailable = !!newAreaBoundses
    const boundsAlreadySet = !!Object.keys(areaBoundses).length

    if (!newBoundsAvailable || boundsAlreadySet) {
        return
    }

    areaBoundses = newAreaBoundses
}

// TODO - Non-downloaders should get this, but only see the green areas.
// TODO - And/or we should zoom in around the green areas on page load if we have no bookmarks. Or zoom in on *something*. Unless you're a downloader?
function tryMakeDownloadRects() {
    const boundsAvailable = !!areaBoundses
    const rectsAlreadySet = !!Object.keys(downloadRects).length

    if (!boundsAvailable || rectsAlreadySet) {
        return
    }

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

    let doubleClickTimeout = null

    // To give the user some sort of feedback while they're waiting for the delayed popup
    var feedbackTooltip = L.tooltip(L.latLng(center), {content: '<img src="assets/images/loader.gif">'})

    return L.rectangle(bounds, uiStyle.downloadRect.normal)
    .on('click', e => {

        if (doubleClickTimeout !== null) {
            // We probably double-clicked

            // Cancel the single-click action
            clearTimeout(doubleClickTimeout);
            doubleClickTimeout = null;
            feedbackTooltip.remove()

            return
        }

        feedbackTooltip.addTo(map)
        setTimeout(() => {
            feedbackTooltip.remove()
        }, 400)

        doubleClickTimeout = setTimeout(() => {
            doubleClickTimeout = null;

            if (!(tileId in loaded)) {
                let performanceWarning = ""

                if (showPerformanceWarning) {
                    performanceWarning = `
                    <br>
                    <div>
                        <div>
                            <b><font color="red">WARNING</font>: You're downloading a lot of areas!</b>
                            <br>
                            <br>
                            Just a heads up: this app is not yet optimized for having a ton of areas in a single grain. If you add a lot more areas, things may start to get sluggish.
                        </div>
                    </div>
                `
                }

                downloadPopup
                .setContent(`
                    <div>
                        <h1 id="area-download-header">Downloadable Area</h1>
                        <div>
                            <b>Download this area to this grain?</b>
                            <br>
                            <br>
                            <button class="da-button" onclick="downloadArea('${tileId}'); downloadPopup.remove()">Ok</button>
                            <button class="da-button" onclick="downloadPopup.remove()">Cancel</button>
                        </div>
                    </div>
                ` + performanceWarning)
                .setLatLng(L.latLng(center))
                .addTo(map)
            } else if (loadedStatus(tileId) === LOADED_DONE) {
                // If it's downloaded and you click on it, it zooms and pans
                // you to the area, unless you're already zoomed in as far as
                // or further than it would take you to.

                let zoomToArea = ``;
                if (map.getBoundsZoom(areaBoundses[tileId]) > map.getZoom()) {
                    zoomToArea = `
                        <button class="da-button" onclick="map.fitBounds(areaBoundses['${tileId}']); downloadPopup.remove()">Zoom to area</button>
                    `
                }

                content = `
                    <div>
                        <h1 id="area-download-header">Downloaded Area</h1>
                        <div id='downloaded-area-main'>
                            <button class="da-button" onclick="$('#downloaded-area-main').slideUp();$('#area-delete-are-you-sure').slideDown();">Delete area</button>
                            ${zoomToArea}
                            <button class="da-button" onclick="downloadPopup.remove()">Cancel</button>
                        </div>
                        <div id='area-delete-are-you-sure' style='display:none; background-color: #ecc; padding: 5px;'>
                            <b>Are you sure you want to delete this downloaded area from this grain?</b>
                            <br>
                            <br>
                            <button class="da-button" onclick="deleteArea('${tileId}'); downloadPopup.remove()">Confirm Delete</button>
                            <button class="da-button" onclick="downloadPopup.remove()">Cancel</button>
                        </div>
                    </div>
                `

                downloadPopup
                .setContent(content)
                .setLatLng(L.latLng(center))
                .addTo(map)
            }
        }, 400)
    })
    .on('mouseover', e => {
        if (loadedStatus(tileId) !== LOADED_DONE) {
            e.target.setStyle(uiStyle.downloadRect.highlighted)
        }
    })
    .on('mouseout', e => {
        if (loadedStatus(tileId) !== LOADED_DONE) {
            e.target.setStyle(uiStyle.downloadRect.normal)
        }
    })
}

function downloadArea(tileId) {
    // TODO This one has some inconsistency. It does not persist after page reload.
    // Either 1) we shouldn't set this here or 2) we should set this (from `fullStatus`) after page reload.
    // But I don't want to change this before launch because it'll likely introduce a bug.
    // But this has become a precarious part of the code and it should be cleaned up! (including obsoleting `showPerformanceWarning`)
    loaded[tileId] = {status: LOADED_DOWNLOADING}

    // force it to start the faster update loop right away, since this user initiated the
    // download. otherwise it has to wait to finish a slower loop before it even knows to go fast.
    updateDownloadStatuses()

    fetch('download-map', {
        method: 'POST',
        body: JSON.stringify({'tile-id': tileId}),
    })
    .catch(console.log)
}

const toggleGeoButtonLearnMore = (() => {
    // Slide in opposite directions. Surprisingly looks good!
    $('#bookmark-edit-geo-button-learn-more').slideToggle()
    $('#bookmark-edit-geo-button-main').slideToggle()
})

const toggleBookmarkPopupSections = (() => {
    // Slide in opposite directions. Surprisingly looks good!
    $('#bookmark-edit-section-geo').slideToggle()
    $('#bookmark-edit-section-edit').slideToggle()
})

const openBookmarkInApp = (() => {
    const {lat, lng} = bookmarkPopup.options.bookmark.latlng
    window.open(`geo:${lat},${lng}`, "_blank")
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
                latlng: bookmarkPopup.options.bookmark.latlng,

                // Undefined for new bookmarks
                id: bookmarkPopup.options.bookmark.id,
                version: bookmarkPopup.options.bookmark.version,
            })
        })
        .then(res => {
            // Conflict gets a special error message
            if (res.status === 409) {
                $('#bookmark-edit-section-edit').slideUp()
                $('#search-marker-save-conflict').slideDown()
                return
            }

            // Any other errors will show up as a generic message below
            return res.json()
            .then(([bookmarkId, bookmark]) => {
                $('#bookmark-edit-section-edit').slideUp()
                $('#search-marker-save-success').slideDown()
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
                    data.bookmarks[bookmarkId].id = bookmarkId
                    bookmarksList.render()
                    updateBookmarkMarkers()

                    selectBookmarkMarker(bookmarkId, false)
                    // flash the menu button
                    bookmarksList.flash()
                }, 500)
            })
            .catch(e => {
                $('#bookmark-edit-section-edit').slideUp()
                $('#search-marker-save-error').slideDown()

                console.error(e)
            })
        })
})

const deleteBookmarkAreYouSure = (() => {
    $('#edit-and-delete-buttons').slideUp()
    $('#editor-delete-are-you-sure').slideDown()
})

const deleteBookmarkCancel = (() => {
    $('#edit-and-delete-buttons').slideDown()
    $('#editor-delete-are-you-sure').slideUp()
})

const editBookmarkStart = (() => {
    $('#edit-and-delete-buttons').slideUp()
    $('#edit-bookmark-title-form').slideDown()
    $('#bookmark-edit-name-display').slideUp()

    // This will bring up the keyboard on mobile, but that's okay because the user
    // deliberately clicked on the edit button at this point
    document.getElementById("bookmark-edit-name").focus()
})

const editBookmarkCancel = (() => {
    $('#edit-and-delete-buttons').slideDown()
    $('#edit-bookmark-title-form').slideUp()
    $('#bookmark-edit-name-display').slideDown()
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
                id: bookmarkPopup.options.bookmark.id,
            })
        })
        .then(res => {
            if (res.status >= 400) {
                $('#bookmark-edit-section-edit').slideUp()
                $('#search-marker-delete-error').slideDown()
                return
            }

            $('#bookmark-edit-section-edit').slideUp()
            $('#search-marker-delete-success').slideDown()
            setTimeout(() => {
                // Whether to use renderLoop or updateBookmarkMarkers/bookmarksList.render is debatable.
                // renderLoop is safer since only one place changes data.bookmarks; changing data.bookmarks
                // here and now and updating the visual elements is faster and perhaps less prone to the
                // error of using an invalid ID.
                renderLoop()
                bookmarkPopup.remove() // Don't know why close() doesn't work, don't care.
            }, 500)
        })
        .catch(console.error)
})

const clickBookmarksExport = e => {
    // TODO - wtf in local mode firefox keeps opening new tabs
    document.location = '/export.kmz'
}

const clickBookmarksNextPage = e => {
    if (bookmarksList.curPage < bookmarksList.numPages - 1) {
        bookmarksList.curPage++
        bookmarksList.render()
    }
}

const clickBookmarksPrevPage = e => {
    if (bookmarksList.curPage > 0) {
        bookmarksList.curPage--
        bookmarksList.render()
    }
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
        let bookmark = data.bookmarks[e.layer.options.bookmarkId]
        if (bookmark) { // timing issues?
            setBookmarkPopup(bookmark, "existing")
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

let updateDownloadStatusesTimeout = null
let updateDownloadStatusesFirstRun = true
function updateDownloadStatuses() {
    let uniqueLoadedStatuses = new Set(Object.values(loaded).map(({status: s}) => s))

    // Kind of a hack. Somewhat redundant with queued-for-deletion except it's
    // client side only, specifically on the client that triggered the
    // deletions, for the sake of being "snappy" for the one doing the
    // deleting. I guess we could make it "snappy" for other clients like we do
    // for downloading, but I don't care that much about that now. And besides,
    // once we have websockets, it'll be easily snappy for everyone: we can
    // just use queued-for-deletion instead of this variable anyway.
    let anyLocallyTriggeredDeletions = Object.values(loaded).filter(({deleting}) => deleting).length > 0

    // In case this is called additional to the setTimeout
    clearTimeout(updateDownloadStatusesTimeout)

    if (
        // IF we already have the manifest OR we're a non-downloader (and thus
        // don't care about the manifest)
        (!!Object.keys(areaBoundses).length || permissions.indexOf("download") === -1) &&

        // AND we don't have any active downloads (either no downloads at all,
        // or LOADED_DONE is the only status for any area in `loaded`)
        (
            uniqueLoadedStatuses.size === 0 ||
            (uniqueLoadedStatuses.size === 1 && uniqueLoadedStatuses.has(LOADED_DONE))
        ) &&

        // AND there are no (locally triggered) deletions coming up
        !anyLocallyTriggeredDeletions

        // ... THEN, we have nothing we care about updating fast. We can run
        // the update loop slowly.
    ){
        // (To expand on the above...)
        //
        // If every `loaded` status is LOADED_DONE, we can wait another 5 seconds to
        // check on map download status. There should only be any new downloads after those 5
        // seconds if another user/share started a download, or the downloading user refreshed
        // the page mid-download. In these cases we don't care that much if it got a delayed
        // start. After it starts, it'll soon kick into a faster update loop.
        //
        // The first exception is if we're a downloader and we don't even have our manifest
        // loaded. Thus if "areaBoundses" is empty and we're a downloader, we still
        // want to load every second so we get it faster. This is particularly useful
        // to make the tutorial snappy.
        //
        // The second exception is if we just asked to delete something. I want deletion to be
        // "snappy". In this case, I don't really care if it's "snappy" for the other users,
        // just for the one who ordered the deletion. So I'm only checking the local client.

        // Slower update loop
        updateDownloadStatusesTimeout = setTimeout(updateDownloadStatuses, 5000)
    } else {

        // Faster update loop
        updateDownloadStatusesTimeout = setTimeout(updateDownloadStatuses, 1000)
    }

    return fetch('map-download-status', {
        method: 'GET'
    })
    .then(res => res.json())
    .then(fullStatus => {
        const inProgress = fullStatus['in-progress']

        // If another user/share started the download and we see it here, or
        // the downloading user reloaded the window mid-download, set it in the
        // "loaded" field so that this grain does the faster update loop
        // and sees the download progress bar faster. It may take a second to
        // kick into the faster loop but it's okay. It's less important since
        // this user/share didn't start the download.
        for (tileId in inProgress) {
            if (!(tileId in loaded)) {
                loaded[tileId] = {status: LOADED_DOWNLOADING}
            }
        }

        let newLoadedOrDeleted = false
        fullStatus.done.forEach(tileId => {
            newLoadedOrDeleted = loadArea(tileId, updateDownloadStatusesFirstRun) || newLoadedOrDeleted
        })

        // Unload anything recently deleted
        for (tileId in loaded) {
            if (!fullStatus.done.includes(tileId)) {
                newLoadedOrDeleted = unloadArea(tileId) || newLoadedOrDeleted

                if (downloadRects[tileId]) {
                    // If the rectangles have been loaded (which they probably
                    // have, but we have the if statement just in case), make
                    // the new one "normal" color instead of "downloaded" color,
                    // since it's no longer downloaded.
                    downloadRects[tileId].setStyle(uiStyle.downloadRect.normal)
                }
            }
        }

        if (newLoadedOrDeleted) {
            areasMenu.render()
            // Don't flash on the very initial loadAreases since that's
            // probably not based on a recent download.
            if (!updateDownloadStatusesFirstRun) {
                areasMenu.flash()
            }
        }

        showPerformanceWarning = loadedNumDone() + fullStatus['queued-for-download'].length > 9

        // Update the tutorial based on the status
        tutorial.setFromMapStatus(fullStatus)

        // If we have POIS to search for, update the search placeholder text accordingly
        if(fullStatus.done.length) {
            setPlaceholderText(POIS_SEARCH_TEXT_PLACEHOLDER)
        }

        // even non-downloaders want areaBoundses for some things
        updateAreaBoundses(fullStatus['available-areas'])

        // Don't care about the rest for anyone who can't download regions
        if (permissions.indexOf("download") === -1) {
            return
        }

        tryMakeDownloadRects()
        setDownloadRectVisibility()

        Object.keys(downloadRects).forEach(tileId => {
            tooltipContent = null

            if (loadedStatus(tileId) === LOADED_DONE) {
                // Greenish means downloaded
                downloadRects[tileId].setStyle(uiStyle.downloadRect.downloaded)
                if (fullStatus['queued-for-deletion'].includes(tileId)) {
                    tooltipContent = 'Queued for deletion'
                }
            } else if (fullStatus.done.includes(tileId) || loadedStatus(tileId) === LOADED_STARTED) {
                tooltipContent = "Downloaded. Loading on screen..."
            } else if (tileId in inProgress) {
                if (inProgress[tileId].downloadError) {
                    tooltipContent = (
                        'Error downloading this area. Try restarting the grain and downloading again?'
                    )
                } else if (inProgress[tileId].downloadDone !== inProgress[tileId].downloadTotal) {
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
            } else if (fullStatus['queued-for-download'].includes(tileId)) {
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
        updateDownloadStatusesFirstRun = false
    })
}

function loadArea(tileId) {
    if (loadedStatus(tileId) === LOADED_STARTED || loadedStatus(tileId) === LOADED_DONE) {
        return false
    }

    // TODO - wait, LOADED_STARTED doesn't even take effect anywhere, this isn't
    // threaded. right? we set it to LOADED_DONE right below, not after a callback
    // or anything. The "Loading on screen..." message does show up, but it's
    // based on another clause in the if statement. I think!
    loaded[tileId] = {status: LOADED_STARTED}
    console.log('adding', tileId)

    const tilesFname = tileId + ".pmtiles"
    areaLayer = protomaps.leafletLayer({
        attribution: (
            '<a href="https://protomaps.com">Protomaps</a> © ' +
            '<a href="https://openstreetmap.org/copyright">OpenStreetMap</a> ' +
            'Map data is a work-in-progress. Double-check for anything super important.'
        ),
        url: tilesFname,
    })
    areaLayer.addTo(map)

    console.log('added', tileId)
    loaded[tileId] = {
        status: LOADED_DONE,
        layer: areaLayer,
    }

    return true
}

function unloadArea(tileId) {
    if (loadedStatus(tileId) !== LOADED_DONE) {
        // Must be a mistake
        return false
    }

    console.log('removing', tileId)

    loaded[tileId].layer.remove()

    console.log('removed', tileId)
    delete loaded[tileId]

    return true
}

function getGeoJson(name) {
    path = `base-map/${name}.geojson`
    return fetch(path, {
        method: 'GET'
    })
    .then(res => {
        return res.json().then(geoJson => {
            // Remove the US since we already have the states. This will avoid the annoying
            // inconsistent double-borders. Still have that problem on the northern and
            // southern borders though.
            geoJson.features = geoJson.features.filter(f => f.properties.ADMIN !== "United States of America")
            const geoJsonLayer = L.geoJson(geoJson, {
                attribution: (
                    '<a href="https://www.naturalearthdata.com/">Natural Earth</a>, ' +
                    '<a href="https://github.com/lexman">Lexman</a>, ' +
                    '<a href="https://okfn.org/">Open Knowledge Foundation</a>, ' +
                    '<a href="https://geonames.org/">GeoNames</a>'
                ),
                // Public domain but they said they'd appreciate attribution
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

const PLACES_SEARCH_TEXT_PLACEHOLDER = "Cities, States, or Countries"
const POIS_SEARCH_TEXT_PLACEHOLDER = "Nearby cafes, streets, parks..."

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
    textPlaceholder: PLACES_SEARCH_TEXT_PLACEHOLDER,
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
            for (tileId in loaded) {
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

function setPlaceholderText(newText) {
    if (searchControl.options.textPlaceholder !== newText) {
        // May be glitchy, but this is the only way I know of to change
        // the text placeholder for now. Hopefully we do this rarely.
        searchControl.options.textPlaceholder = newText
        searchControl.remove()
        map.addControl(searchControl);
    }
}

searchControl.on('search:locationfound', function(event) {
    // BASEMAP_MARKER is a super hack. It's there to treat basemap city search
    // results differently. But we don't want it to actually show up in the
    // marker text, and especially not if we save it as a bookmark.
    if (event.text.slice(-2) == BASEMAP_MARKER) {
        name = event.text.slice(0, -2)
    } else {
        name = event.text
    }

    searchMarker.options.bookmark = {
        name,
        latlng: event.latlng,
    }
    searchMarker
        .bindTooltip(searchMarker.options.bookmark.name)
        .openTooltip()

    // This is particularly useful for mobile, because it will (hopefully) hide
    // the input keyboard.
    $('.search-input').blur()
});

map.addControl(searchControl);

// Defined in tutorial.js
tutorial.addTo(map)

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
map.on('zoomend', setDownloadRectVisibility)

function setDownloadRectVisibility() {
    if (map.getZoom() > DOWNLOAD_RECT_MAX_ZOOM) {
        Object.keys(downloadRects).forEach(tileId => {
            downloadRects[tileId].remove()
        })
    } else {
        Object.keys(downloadRects).forEach(tileId => {
            downloadRects[tileId].addTo(map)
        })
    }
}

// Right-click to add a marker at an arbitrary location
map.on('contextmenu', function (event) {
    // Close the popup before opening it again, to trigger the "on add" event.
    // For some reason, closing is not necessary when clicking between multiple
    // existing markers.
    // TODO - investigate this phenomenon more, perhaps
    bookmarkPopup.close()

    bookmark = {
        latlng: event.latlng,
        name: ''
    }
    setBookmarkPopup(bookmark, "arbitrary")
})
