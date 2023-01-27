#!/bin/bash

# TODO - haven't tried this script AS SUCH yet, but I ran commands similar to these and they worked

set -euf -o pipefail

mkdir out/
mkdir tmp/

tar -czvf tmp/bstn.tar.gz in/bstn
split -d -b 2M tmp/bstn.tar.gz bstn.tar.gz.

tar -czvf tmp/psmt.tar.gz in/psmt
split -d -b 2M tmp/psmt.tar.gz psmt.tar.gz.
