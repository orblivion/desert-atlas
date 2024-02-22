#!/bin/bash
set -euox pipefail
here="$(dirname "$(readlink -f "$0")")"
cd "$here"

# Don't waste time installing it twice
go version | grep 'go version go1.21.6 linux/amd64' && exit 0

# https://golang.org/doc/install
wget https://golang.org/dl/go1.21.6.linux-amd64.tar.gz -O /tmp/golang.3e9a2640b23f279fabc6c5ed40d101f1.tar.gz
sha256sum --strict -c golang.checksum

# https://golang.org/doc/install
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/golang.3e9a2640b23f279fabc6c5ed40d101f1.tar.gz

export PATH=$PATH:/usr/local/go/bin

go version
