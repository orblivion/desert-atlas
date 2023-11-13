#!/bin/bash

set -exuo pipefail

# https://golang.org/doc/install
wget https://golang.org/dl/go1.18.1.linux-amd64.tar.gz -O /tmp/golang.tar.gz
sha256sum --strict -c golang.checksum

# https://golang.org/doc/install
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/golang.tar.gz

export PATH=$PATH:/usr/local/go/bin

go version
