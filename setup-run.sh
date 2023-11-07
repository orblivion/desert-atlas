#!/bin/bash

# Nginx
apt install -y nginx
service nginx stop
systemctl disable nginx

# Some Python libraries. (I don't like using pypi if I can help it)
apt install -y python3-unidecode
