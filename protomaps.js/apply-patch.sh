#!/bin/bash

set -euf -o pipefail

cp protomaps.js.orig protomaps.js
patch protomaps.js protomaps.patch
