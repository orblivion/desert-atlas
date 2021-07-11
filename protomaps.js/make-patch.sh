#!/bin/bash

set -euf -o pipefail

diff -u protomaps.js.orig protomaps.js > protomaps.patch
