#!/bin/bash

set -euf -o pipefail

wget https://ajax.googleapis.com/ajax/libs/jquery/3.6.1/jquery.min.js -O /tmp/jquery.min.js
sha256sum /tmp/jquery.min.js | grep a3cf00c109d907e543bc4f6dbc85eb31068f94515251347e9e57509b52ee3d74 || (echo "sha256sum did not match"; exit 1)
mv /tmp/jquery.min.js jquery.min.js
