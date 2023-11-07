function getWebSocketUrl() {
    const protocol = window.location.protocol.replace('http', 'ws');
    return protocol + "//" + window.location.host + "/_sandstorm/websocket";
}
function connectWebSocket() {
    console.log("Connecting to websocket.");
    const socket = new WebSocket(getWebSocketUrl());
    socket.onmessage = (event) => {
        console.log("Got message from server: ", event.data);
        window.parent.postMessage(JSON.parse(event.data), '*');
    };
    socket.onclose = () => {
        // Short delay before re-trying, so we don't overload the server.
        // TODO: expontential backoff.
        // TODO: do something to avoid thrashing between more than one client.
        console.log("Disconnected; re-trying in 500ms");
        setTimeout(connectWebSocket, 500);
    };
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) {
            return;
        }
        console.log("Got message parent frame: ", event.data);
        socket.send(JSON.stringify(event.data));
    });
}
connectWebSocket();
