function WebSocketWeigh(options) {
    var defaults = {
        url: 'ws://127.0.0.1:12212/serial/WEIGH',
        weightRegex: new RegExp('([0-9]{1,2}\\.[0-9]{3})kg'),
        stableRegex: new RegExp('^ST.*\\s+'),
        onConnect: function () {
        },
        onDisconnect: function () {
        },
        onUpdate: function (weight, stable) {

        }
    };

    var settings = Object.assign({}, defaults, options);
    var websocket;
    var buffer = '';

    var onMessage = function (evt) {
        var chr = evt.data;
		//console.log("data: " + chr);
        if (chr == "\n") {
            var weightOutput = settings.weightRegex.exec(buffer);
            var stableOutput = settings.stableRegex.test(buffer);

            if (weightOutput != null) {
                settings.onUpdate(weightOutput[1], stableOutput);
            } else {
				console.log("buffer: " + buffer);
			}
            buffer = '';
        } else {
            buffer = buffer + chr;
        }
		//console.log("buffer: " + buffer);
    };

    var onConnect = function () {
        settings.onConnect();
    };

    var onDisconnect = function () {
        settings.onDisconnect();
        reconnect();
    };

    var connect = function () {
        websocket = new WebSocket(settings.url);
        websocket.onopen = onConnect;
        websocket.onclose = onDisconnect;
        websocket.onmessage = onMessage;
    };

    var reconnect = function () {
        connect();
    };

    connect();
}