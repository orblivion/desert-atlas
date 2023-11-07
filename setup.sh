#!/bin/bash

# TODO - I don't know which of this more properly goes into build.sh. My
# standard is going to be "root in setup.sh" and avoid sudo in build.sh. I
# don't have Vagrant in front of me to test this as I type. When we make this
# ready for vagrant I'd be curious if we need to move some of it to build.sh.

# For powerbox-http-proxy
apt install -y golang-go # 1.15 in Debian Bullseye

# Nginx
apt install -y nginx
service nginx stop
systemctl disable nginx

# Some Python libraries. (I don't like using pypi if I can help it)
apt install -y python3-unidecode
