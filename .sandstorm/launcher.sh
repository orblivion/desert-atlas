#!/bin/bash
set -euo pipefail

cd /opt/app

export POWERBOX_PROXY_PORT=8001
export POWERBOX_WEBSOCKET_PORT=3000
export DB_TYPE=sqlite3
export DB_URI="/var/powerbox-http-proxy.db"
export CA_CERT_PATH=/var/powerbox-http-proxy.pem
rm -f $CA_CERT_PATH

./dependencies/powerbox-http-proxy/powerbox-http-proxy &
while [ ! -e "$CA_CERT_PATH" ] ; do
    echo "waiting for powerbox-http-proxy to start"
    sleep .1
done

# python requests library actually picks this up
export http_proxy=http://localhost:$POWERBOX_PROXY_PORT
export https_proxy=http://localhost:$POWERBOX_PROXY_PORT

./server.py &

# Hang out until the app starts and curl gets something back
curl --connect-timeout 5 --max-time 1 --retry 5 --retry-delay 1 --retry-max-time 10 --retry-connrefused -I localhost:3857

export HOME=/var

mkdir -p /var/run
mkdir -p /var/log/nginx
mkdir -p /var/lib/nginx

# Start nginx.
/usr/sbin/nginx -c /opt/app/service-config/nginx.conf -g "daemon off;"

exit 0
