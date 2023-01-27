#!/bin/bash

set -euf -o pipefail

wget https://github.com/kiselev-dv/gazetteer/releases/download/2.0/Gazetteer.jar -O /tmp/Gazetteer.jar
sha256sum /tmp/Gazetteer.jar | grep 89a9db422b6dc47cf5cafa47b906635db408f49cadc6b7b215a19b24de76de01
mv /tmp/Gazetteer.jar gazetteer.jar
