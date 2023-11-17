// This is all big and complicated. I'm sorry that I didn't have time to make
// it small and simple. You know that whole anecdote.

const TUTORIAL_INTRO = "TUTORIAL_INTRO" // show the intro page first, regardless of the map download status
const TUTORIAL_STARTED = "TUTORIAL_STARTED" // "normal"
const TUTORIAL_DONE = "TUTORIAL_DONE" // don't uncollapse or flash the tutorial control, per the user's request

L.Control.Tutorial = L.Control.extend({
    curState: null, // basically which page we're on
    mode: null, // TUTORIAL_INTRO, TUTORIAL_STARTED, TUTORIAL_DONE
    flashNow: false, // are we flashing?

    flashLoopTimeout: null,

    flashLoop: function() {
        clearTimeout(this.flashLoopTimeout)
        if (this.flashNow && L.Browser.mobile && this.mode !== TUTORIAL_DONE) {
            $('.tutorial-do-uncollapse').fadeOut(100).fadeIn(1000)
        }
        this.flashLoopTimeout = setTimeout(() => this.flashLoop(), 2000)
    },

    setState: function(state) {
        if (!this.states.includes(state)) {
            throw "Invalid tutorial state: " + state
        }
        if (this.curState === state) {
            // Don't bother setting again, more importantly don't bother
            // uncollapsing or restarting flashing again
            return
        }
        stateCls = 'tutorial-state-' + state
        this.wrapper.classList.forEach(cls => {
            if (cls !== stateCls && cls.startsWith('tutorial-state-')) {
                this.wrapper.classList.remove(cls)
            }
            this.wrapper.classList.add(stateCls)
        })
        this.curState = state
        this.uncollapse()
    },

    // The actual CSS changes for collapsing
    _collapse: function() {
        if (L.Browser.mobile) {
            // If we previously uncollapsed, we hid it to make extra space at
            // the top of the screen for mobile.
            $('.leaflet-control-zoom').show()
            $('#bookmark-list-container').show()
        }
        this.wrapper.classList.remove('tutorial-collapsed-no')
        this.wrapper.classList.add('tutorial-collapsed-yes')
    },

    // The actual CSS changes for uncollapsing
    _uncollapse: function() {
        if (L.Browser.mobile) {
            // Make extra space at the top of the screen for mobile
            $('.leaflet-control-zoom').hide()
            $('#bookmark-list-container').hide()
        }
        this.wrapper.classList.remove('tutorial-collapsed-yes')
        this.wrapper.classList.add('tutorial-collapsed-no')
    },

    collapse: function() {
        this._collapse()

        // This is user initiated. This was previously uncollapsed. The user
        // already saw the message, so for mobile we don't want to flash
        // anymore until something new comes.
        this.flashNow = false

        // supposedly stops animations. occasionally I see a stray flashing
        // animation finishing when it shouldn't be, and it may be confusing.
        // See if this helps.
        $('.tutorial-do-uncollapse').stop(true, true)
    },

    uncollapse: function() {
        // Not if we don't even have a state yet
        if (this.curState === null) return

        // Not if the user asked us to stop
        if (this.mode === TUTORIAL_DONE) return

        if (!L.Browser.mobile) {
            this._uncollapse()
        }
        this.flashNow = true // For mobile, we're not uncollapsing, so flash instead

        // Restart the flash cycle to make it more snappy
        this.flashLoop()
    },

    forceUncollapse: function(collapsed) {
        // Not if we don't even have a state yet
        if (this.curState === null) return

        this._uncollapse()

        // For mobile we're actually uncollapsing in this case, so no need to flash
        this.flashNow = false
    },

    onAdd: function(map) {
        this.wrapper = L.DomUtil.create('div');
        this.wrapper.id = 'tutorial'
        this.wrapper.classList.add("leaflet-bar")

        const HIDE_TUTORIAL = '<span style="float:left;">\u{2B05}</span><center>Help</center>'
        const SHOW_TUTORIAL = '\u{2753}'

        const collapsedContent = `
            <div style="background-color: #f4aa88;" class="leaflet-interactive">  <!-- For the flashing animation -->
                <a class='tutorial-do-uncollapse'>${SHOW_TUTORIAL}</a>
            </div>
        `

        const stateContent = {
            'downloader-intro': `

                <h3>Welcome to Desert Atlas</h3>

                <p>
                    A fully self-hosted map for Sandstorm, based on OpenStreetMap data. <i>(Map data is a work-in-progress; doublecheck other sources for anything super important.)</i>
                </p>

                <ul>
                    <li>Download map regions to your Sandstorm grain.</li>
                    <li>Search for locations in your downloaded regions.</li>
                    <li>Plan trips with friends privately (assuming you trust this server!)</li>
                    <li>Export destinations to navigation app.</li>
                </ul>

                <button class="da-button tutorial-do-post-download-intro tutorial-do-continue">Continue Tutorial</button>
                <button class="da-button tutorial-do-post-download-instructions tutorial-do-skip">No Thanks I Got This</button>
            `,

            'downloader-instructions': `
                <h3>Download data to this grain</h3>

                <p>
                    To begin, let's download one or more regions of the map to this grain. You will need to do this in order to see or search for details in that area of the map.
                </p>

                <p>
                    When you continue, you will be asked to grant permission to this grain to access the map data server.
                </p>
                <button class="da-button tutorial-do-post-download-instructions tutorial-do-continue">Continue</button>
            `,

            'wait-powerbox-request': `
                Waiting for permission to be granted, and map region metadata to download...
            `,

            'please-wait-for-maps': `
                <h3>\u{26A0}&nbspPlease Wait</h3>
                <p>
                    There are no map regions available yet on this grain. Check back a little later.
                </p>
            `,

            'retry-powerbox': `
                <h3>\u{26A0}&nbspOops</h3>
                <p>
                    This grain couldn't access the network to download metadata about the available map regions. Maybe you didn't grant it permission to do so?
                </p>
                <p>
                    Try restarting this grain (using the Sandstorm controls), or tell the grain's owner to do so if you are not the owner.
                </p>
            `,

            'search-and-download-maps': `
                <h3>Download map regions</h3>

                Now that this grain is connected to the map data server, you can download regions from there to this grain.

                <ol>
                    <li>Find your desired region. If you want, you can search for a city, state, or country to get you there.</li>
                    <li>Click on the region(s) you want, and confirm download.</li>
                    <li>Wait for your region(s) to finish downloading and turn green.</li>
                </ol>

                <button class="da-button tutorial-do-collapse tutorial-do-continue">Continue</button>
            `,

            'downloader-search-and-bookmark': `
                <h3>You're ready to use the map!</h3>

                <p>
                    Here are some things you can do:
                </p>

                <ul>
                    <li>Search for and bookmark destinations within the downloaded regions.</li>
                    <li>Right-click (or long-press on mobile) to bookmark any spot on the map.</li>
                    <li>Share this map (using Sandstrom controls) with others to collaborate or just view (you choose the permissions).</li>
                    <li>Export your bookmarks to your OpenStreetMap phone app (such as OrganicMaps).</li>
                </ul>

                <button class="da-button tutorial-do-collapse tutorial-do-skip">Okay</button>
                <button class="da-button tutorial-see-downloader-intro-again tutorial-do-restart">See Introduction Again</button>
            `,

            'editor-intro': `
                <h3>Welcome to Desert Atlas</h3>

                <p>
                    A fully self-hosted map for Sandstorm, based on OpenStreetMap data. <i>(Map data is a work-in-progress; doublecheck other sources for anything super important.)</i>
                </p>

                <p>
                    Plan trips with friends privately (assuming you trust this server!)
                </p>

                <button class="da-button tutorial-see-editor-instructions tutorial-do-continue">Continue Tutorial</button>
                <button class="da-button tutorial-do-skip tutorial-do-collapse">No Thanks I Got This</button>
            `,

            'editor-instructions': `
                <h3>Using the map</h3>

                <p>
                    Here are some things you can do:
                </p>

                <ul>
                    <li>Search for and bookmark destinations within the map regions currently available on this grain.</li>
                    <li>Right-click (or long-press on mobile) to bookmark any spot on the map.</li>
                    <li>Export your bookmarks to your OpenStreetMap phone app (such as OrganicMaps)</li>
                </ul>

                <button class="da-button tutorial-do-collapse tutorial-do-skip">Done</button>
                <button class="da-button tutorial-see-editor-intro-again tutorial-do-restart">See Introduction Again</button>
            `,

            'viewer-intro': `
                <h3>Welcome to Desert Atlas</h3>

                <p>
                    A fully self-hosted map for Sandstorm, based on OpenStreetMap data. <i>(Map data is a work-in-progress; doublecheck other sources for anything super important.)</i>
                </p>

                <p>
                    You are a viewer of this map. You can:
                </p>

                <ul>
                    <li>Search for locations within the map regions currently available on this grain.</li>
                    <li>Export any bookmarks (added by others) to your OpenStreetMap phone app (such as OrganicMaps)</li>
                </ul>

                <button class="da-button tutorial-do-collapse tutorial-do-skip">Done</button>
            `,

        }

        this.states = Object.keys(stateContent)

        header = `<a class='tutorial-do-collapse leaflet-interactive da-control-header' style='width:auto; min-width:10em'>${HIDE_TUTORIAL}</a>`
        this.states.forEach(state => {
            stateContent[state] = (
                header + `<div class="tutorial-content">` + stateContent[state] + `</div>`
            )
        })

        // Autogenerate the css necessary to easily show/hide this stuff.
        hidingStyles = "<style>"

        let collapsedDiv = L.DomUtil.create('div');
        collapsedDiv.id = "tutorial-collapsed-square"
        collapsedDiv.innerHTML = collapsedContent
        this.wrapper.appendChild(collapsedDiv)
        hidingStyles += `
            .tutorial-collapsed-no #tutorial-collapsed-square {
                display: none;
            }
        `

        this.states.forEach(state => {
            let stateDiv = L.DomUtil.create('div');
            stateDiv.id = "tutorial-page-" + state
            stateDiv.classList.add("tutorial-page")
            stateDiv.innerHTML = stateContent[state]
            this.wrapper.appendChild(stateDiv)
            hidingStyles += `
                .tutorial-collapsed-no.tutorial-state-${state} #tutorial-page-${state} {
                    display: block;
                }
            `
        })
        hidingStyles += "</style>"
        document.querySelector("head").insertAdjacentHTML('beforeend', hidingStyles)

        this.flashLoop()

        setTimeout(() => { // setTimeout, my solution for everything.
            // Do all the 'off' first because it seems to turn off click
            // handlers on the same element even if tied to different classes
            $('.tutorial-do-post-download-intro').off('click')
            $('.tutorial-do-collapse').off('click')
            $('.tutorial-do-uncollapse').off('click')
            $('.tutorial-do-continue').off('click')
            $('.tutorial-do-skip').off('click')
            $('.tutorial-do-restart').off('click')
            $('.tutorial-see-downloader-intro-again').off('click')
            $('.tutorial-see-editor-intro-again').off('click')
            $('.tutorial-see-editor-instructions').off('click')
            $('.tutorial-do-post-download-instructions').off('click')

            $('.tutorial-do-post-download-intro').on('click', e => {
                tutorial.setState('downloader-instructions')
            })

            $('.tutorial-see-downloader-intro-again').on('click', e => {
                tutorial.setState('downloader-intro')
            })

            $('.tutorial-see-editor-intro-again').on('click', e => {
                tutorial.setState('editor-intro')
            })

            $('.tutorial-see-editor-instructions').on('click', e => {
                tutorial.setState('editor-instructions')
            })

            $('.tutorial-do-post-download-instructions').on('click', e => {
                // Tell the backend to try the manifest download
                fetch('/app/download-manifest', {
                    method: 'POST'
                }).catch(console.log)
                tutorial.setState('wait-powerbox-request')
                tutorial.collapse()
            })

            $('.tutorial-do-collapse').on('click', e => {
                tutorial.collapse()
            })

            $('.tutorial-do-uncollapse').on('click', () => {
                // User initiated, so we ignore tutorial skip
                tutorial.forceUncollapse()
            })

            $('.tutorial-do-skip').on('click', () => {
                fetch('/app/tutorial-mode', {
                        // NOTE: This will have no effect for anon users. They will always start with TUTORIAL_INTRO on page reload.
                        method: 'POST',
                        body: JSON.stringify({
                            'tutorial-mode': TUTORIAL_DONE
                        }),
                    })
                    .catch(console.log)

                tutorial.mode = TUTORIAL_DONE;
                updateDownloadStatuses() // update sooner to be more snappy
            })

            $('.tutorial-do-continue').on('click', () => {
                fetch('/app/tutorial-mode', {
                    // NOTE: This will have no effect for anon users. They will always start with TUTORIAL_INTRO on page reload.
                    method: 'POST',
                    body: JSON.stringify({
                        'tutorial-mode': TUTORIAL_STARTED
                    }),
                })

                tutorial.mode = TUTORIAL_STARTED;
                updateDownloadStatuses() // update sooner to be more snappy
            })

            $('.tutorial-do-restart').on('click', () => {
                // In case they want to see the intro info again
                fetch('/app/tutorial-mode', {
                    // NOTE: This will have no effect for anon users. They will always start with TUTORIAL_INTRO on page reload.
                    method: 'POST',
                    body: JSON.stringify({
                        'tutorial-mode': TUTORIAL_INTRO
                    }),
                })
                tutorial.mode = TUTORIAL_INTRO;
                updateDownloadStatuses() // update sooner to be more snappy
            })
        })

        return this.wrapper;
    },

    setFromMapStatus: function(fullStatus) {
        // Mode is different from state; mode is user-specific.
        // If the mode is TUTORIAL_DONE, we might still be in a "state" as
        // defined below. It just means it's collapsed by default.
        // If the mode is TUTORIAL_INTRO, we want to start with the intro page despite what the "state" is.
        //
        // Only set the mode from backend once. Otherwise anon users would get sent to the intro on a loop,
        // since the backend can't track the mode for them.
        if (this.mode === null) {
            this.mode = fullStatus['tutorial-mode']
        }

        const permissions = fullStatus['permissions']
        if (permissions.indexOf("download") === -1) {
            // Non-download users tutorial logic is simple and different from
            // downloader users. Let's get it out of the way first.

            if (fullStatus.done.length === 0) {
                // There are no downloaded maps, and this user isn't a downloader. Sharing
                // an unready map with a non-downloader would be a rare case. Tell them to
                // stand by.
                this.setState('please-wait-for-maps')

                // Override "skip tutorial", they need to see the error message.
                this.forceUncollapse()
            } else {
                // As long as there are downloaded maps, we are past any errors.
                if (permissions.indexOf("bookmarks") !== -1) {
                    // Editor users have two non-error tutorial screens. We don't want to
                    // keep sending back to intro on a loop, so only set this if we haven't
                    // set any state yet.
                    if (this.curState === null) {
                        this.setState('editor-intro')
                    }
                } else {
                    // Viewer users only have one non-error tutorial screen so we can just
                    // as well send them to intro on a loop.
                    this.setState('viewer-intro')
                }
            }
        } else if (fullStatus['available-areas-status'] === 'error') {
            // Error downloading the manifest. Tell them there was a problem.
            this.setState('retry-powerbox')

            // Override "skip tutorial", they need to see the error message.
            this.forceUncollapse()
        } else if (this.mode === TUTORIAL_INTRO) {
            // Regardless of state other than the above error, show the intro
            // to new downloaders. They should see the important things on the
            // intro screen. After the intro they can see the necessary
            // status-based helper message.
            this.setState('downloader-intro')
        } else if (fullStatus.done.length) {
            // At least one map downloaded. This map is "ready".
            // Instructions for searching and adding bookmarks (similar to the intro for bookmarker users)
            this.setState('downloader-search-and-bookmark')
        } else if (fullStatus['available-areas']) {
            // We have the manifest, but we haven't downloaded any maps yet
            this.setState('search-and-download-maps')
        } else if (fullStatus['available-areas-status'] === 'started') {
            // We told the server we're ready to start the powerbox request,
            // so we can kick it into the "waiting" state.
            this.setState('wait-powerbox-request')
        } else {
            // We haven't even tried downloading the manifest yet

            if (this.mode !== TUTORIAL_DONE) {
                if (this.curState === null) {
                    // If we haven't skipped the tutorial, give the downloader
                    // instructions before downloading the manifest, even if
                    // they're not in the "intro" mode, so they don't
                    // get confused. But only do this on a new page load because
                    // we might have started the "wait-powerbox-request" sequence.
                    this.setState('downloader-instructions')
                }
            } else {
                if (this.curState === null) {
                    // We're in TUTORIAL_DONE mode, and we're doing a new page load. We
                    // might have gotten here because the user reset their
                    // grain after skipping the tutorial. In case of this, tell
                    // the server it's okay to do the powerbox request, since
                    // the user can't trigger it the normal way without the tutorial.
                    // (Calling this enpoint multiple times won't trigger
                    // multiple powerbox requests).
                    fetch('/app/download-manifest', {
                        method: 'POST'
                    }).catch(console.log)
                }
                // If we're collapsed already waiting for the powerbox, we'll
                // already be on this state so this won't have an effect. If
                // the user was on another state, it will pop up to inform them
                // that we're waiting for it now. (I think this was relevant if we
                // have two downloader users)
                this.setState('wait-powerbox-request')
            }
        }
    },
})

L.control.tutorial = function() {
    return new L.Control.Tutorial({
        position: 'topleft'
    });
}

const tutorial = L.control.tutorial()
