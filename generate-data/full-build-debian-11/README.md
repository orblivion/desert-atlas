TODO - Some of this could be redundant with `generate-data/README.md`. Maybe it should be reconciled. The purpose of this section is simple instructions (mostly for myself) to get through the map generation process quickly and easily. The other README is more for newcomers to understand how it all works in more detail.

TODO - Put as much of these as I can into scripts. Instructions should be to "bootstrap" by running apt update/upgrade, installing git, and checking out repo. From that point the scripts will be available.

---

I had a version of these notes in my own secret stash since it's rather platform specific. I figured I'd avoid keeping secrets, it could be useful to somebody else, and anyway it's easy to keep track this way.

# Simple, platform-specifc instructions for building the world.

Our plan is to create a Linode, build the map (this will take about 2 and a half days), and destroy the Linode. This will upload everything to S3. After this, we can update our app and it'll use the new data.

## Set up Linode

Create shared CPU Linode with 16GB of RAM

## As root

    apt update; apt upgrade -y

    apt install -y build-essential libboost-dev libboost-filesystem-dev libboost-iostreams-dev libboost-program-options-dev libboost-system-dev liblua5.1-0-dev libprotobuf-dev libshp-dev libsqlite3-dev protobuf-compiler rapidjson-dev # I think this was for building tilemaker
    apt install -y osmium-tool pyosmium # extracting search
    apt install -y default-jre unzip # mkgmap's splitter
    apt install -y tmux git # I find tmux useful for this
    apt install -y aria2 s3cmd # Downloading torrent of osm's raw planet, and uploading the result to S3

    adduser mapbuilder --disabled-password

## As mapbuilder

    git clone https://github.com/orblivion/sandstorm-share-a-map

## As root again

    cd sandstorm-share-a-map/generate-data/full-build-debian-11
    ./install-go.sh

## As mapbuilder again

    export PATH=$PATH:/usr/local/go/bin

Copy s3 credentials for your bucket to `~/.s3cfg`

    cd sandstorm-share-a-map/
    git submodule init
    git submodule update

    cd generate-data/

Enter a tmux! Kick off these three at once:

    cd go-pmtiles; go build
    cd tilemake; make
    ./get-mkgmap-splitter.sh

After those are built, you have your tools to do everything else:

    # This sets the timestamp. It's sepate so that if we have to run ./build_all.py again it won't start over.
    ./set_build_name.py

    S3BUCKET=desert-atlas ./build_all.py

## Two or three days later

Update the app with the newly created name (timestamp set by `set_build_name.py`). If you forgot to save it, you should see it as a directory in your bucket.

Destroy the Linode to not waste money.
