#!/bin/bash
set -euo pipefail

# TODO - I don't know which of this more properly goes into build.sh. My
# standard is going to be "root in setup.sh" and avoid sudo in build.sh. I
# don't have Vagrant in front of me to test this as I type. When we make this
# ready for vagrant I'd be curious if we need to move some of it to build.sh.

cd /opt/app/.sandstorm
./setup-build.sh
./setup-run.sh

exit 0
