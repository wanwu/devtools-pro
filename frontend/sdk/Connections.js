// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Protocol.Connection}
 */
export class MainConnection {
    constructor() {
        this._onMessage = null;
        this._onDisconnect = null;
        this._messageBuffer = '';
        this._messageSize = 0;
        this._eventListeners = [
            Host.InspectorFrontendHost.events.addEventListener(
                Host.InspectorFrontendHostAPI.Events.DispatchMessage,
                this._dispatchMessage,
                this
            ),
            Host.InspectorFrontendHost.events.addEventListener(
                Host.InspectorFrontendHostAPI.Events.DispatchMessageChunk,
                this._dispatchMessageChunk,
                this
            )
        ];
    }

    /**
     * @override
     * @param {function((!Object|string))} onMessage
     */
    setOnMessage(onMessage) {
        this._onMessage = onMessage;
    }

    /**
     * @override
     * @param {function(string)} onDisconnect
     */
    setOnDisconnect(onDisconnect) {
        this._onDisconnect = onDisconnect;
    }

    /**
     * @override
     * @param {string} message
     */
    sendRawMessage(message) {
        if (this._onMessage) {
            Host.InspectorFrontendHost.sendMessageToBackend(message);
        }
    }

    /**
     * @param {!Common.Event} event
     */
    _dispatchMessage(event) {
        if (this._onMessage) {
            this._onMessage.call(null, /** @type {string} */ (event.data));
        }
    }

    /**
     * @param {!Common.Event} event
     */
    _dispatchMessageChunk(event) {
        const messageChunk = /** @type {string} */ (event.data['messageChunk']);
        const messageSize = /** @type {number} */ (event.data['messageSize']);
        if (messageSize) {
            this._messageBuffer = '';
            this._messageSize = messageSize;
        }
        this._messageBuffer += messageChunk;
        if (this._messageBuffer.length === this._messageSize) {
            this._onMessage.call(null, this._messageBuffer);
            this._messageBuffer = '';
            this._messageSize = 0;
        }
    }

    /**
     * @override
     * @return {!Promise}
     */
    disconnect() {
        const onDisconnect = this._onDisconnect;
        Common.EventTarget.removeEventListeners(this._eventListeners);
        this._onDisconnect = null;
        this._onMessage = null;

        if (onDisconnect) {
            onDisconnect.call(null, 'force disconnect');
        }
        return Promise.resolve();
    }
}

/**
 * @implements {Protocol.Connection}
 */
export class WebSocketConnection {
    /**
     * @param {string} url
     * @param {function()} onWebSocketDisconnect
     */
    constructor(url, onWebSocketDisconnect) {
        // 保存一份，heartbeat 有用
        this._url = url;
        this._socket = new WebSocket(url);
        this._socket.onerror = this._onError.bind(this);
        this._socket.onopen = this._onOpen.bind(this);
        this._socket.onmessage = messageEvent => {
            if (this._onMessage) {
                let data = messageEvent.data;
                this._onMessage.call(null, /** @type {string} */ (data));
            }
        };
        this._socket.onclose = this._onClose.bind(this);

        this._onMessage = null;
        this._onDisconnect = null;
        this._onWebSocketDisconnect = onWebSocketDisconnect;
        this._connected = false;
        this._messages = [];
    }

    /**
     * @override
     * @param {function((!Object|string))} onMessage
     */
    setOnMessage(onMessage) {
        this._onMessage = onMessage;
    }

    /**
     * @override
     * @param {function(string)} onDisconnect
     */
    setOnDisconnect(onDisconnect) {
        this._onDisconnect = onDisconnect;
    }

    _onError() {
        this._onWebSocketDisconnect.call(null);
        // This is called if error occurred while connecting.
        this._onDisconnect.call(null, 'connection failed');
        this._close();
    }

    _onOpen() {
        this._socket.onerror = console.error;
        this._connected = true;
        for (const message of this._messages) {
            this._socket.send(message);
        }
        this._messages = [];
    }

    _onClose() {
        this._onWebSocketDisconnect.call(null);
        this._onDisconnect.call(null, 'websocket closed');
        this._close();
    }

    /**
     * @param {function()=} callback
     */
    _close(callback) {
        // 激活backend ws connection 探针
        let timerId;
        // 提取id
        const match = this._url.match(/frontend\/([^/?]+)/);
        console.log('backend connection 探针激活!', match);
        const self = this;
        function heartbeat() {
            // 1. 先建立ws链接，如果成功，则监听backendConnected事件，判断id是否相等
            const url = self._url.split('/frontend')[0] + '/heartbeat';
            const socket = new WebSocket(url);
            // 2. 失败，则建立http 轮询
            socket.onerror = socket.onclose = function() {
                poll();
            };
            socket.onmessage = function(messageEvent) {
                try {
                    const {event, payload} = JSON.parse(messageEvent.data);
                    if (event === 'backendConnected' && payload.id === match[1]) {
                        location.reload();
                    }
                } catch (e) {}
            };
        }
        function poll() {
            if (timerId) {
                clearTimeout(timerId);
            }
            const target = match[1];

            timerId =
                target &&
                setTimeout(function() {
                    poll();
                    if (document.hidden) {
                        return;
                    }
                    // TODO 这里如果检测到了服务器死掉，那么加大轮询时间
                    fetch('/_alive_/' + target)
                        .then(res => res.text())
                        .then(
                            status => {
                                if (status === '1') {
                                    location.reload();
                                }
                            },
                            () => {}
                        );
                }, 1e3);
        }
        match && heartbeat();

        this._socket.onerror = null;
        this._socket.onopen = null;
        this._socket.onclose = callback || null;
        this._socket.onmessage = null;
        this._socket.close();
        this._socket = null;
        this._onWebSocketDisconnect = null;
    }

    /**
     * @override
     * @param {string} message
     */
    sendRawMessage(message) {
        if (this._connected) {
            this._socket.send(message);
        } else {
            this._messages.push(message);
        }
    }

    /**
     * @override
     * @return {!Promise}
     */
    disconnect() {
        let fulfill;
        const promise = new Promise(f => (fulfill = f));
        this._close(() => {
            if (this._onDisconnect) {
                this._onDisconnect.call(null, 'force disconnect');
            }
            fulfill();
        });
        return promise;
    }
}

/**
 * @implements {Protocol.Connection}
 */
export class StubConnection {
    constructor() {
        this._onMessage = null;
        this._onDisconnect = null;
    }

    /**
     * @override
     * @param {function((!Object|string))} onMessage
     */
    setOnMessage(onMessage) {
        this._onMessage = onMessage;
    }

    /**
     * @override
     * @param {function(string)} onDisconnect
     */
    setOnDisconnect(onDisconnect) {
        this._onDisconnect = onDisconnect;
    }

    /**
     * @override
     * @param {string} message
     */
    sendRawMessage(message) {
        setTimeout(this._respondWithError.bind(this, message), 0);
    }

    /**
     * @param {string} message
     */
    _respondWithError(message) {
        const messageObject = JSON.parse(message);
        const error = {
            message: "This is a stub connection, can't dispatch message.",
            code: Protocol.DevToolsStubErrorCode,
            data: messageObject
        };
        if (this._onMessage) {
            this._onMessage.call(null, {id: messageObject.id, error: error});
        }
    }

    /**
     * @override
     * @return {!Promise}
     */
    disconnect() {
        if (this._onDisconnect) {
            this._onDisconnect.call(null, 'force disconnect');
        }
        this._onDisconnect = null;
        this._onMessage = null;
        return Promise.resolve();
    }
}

/**
 * @implements {Protocol.Connection}
 */
export class ParallelConnection {
    /**
     * @param {!Protocol.Connection} connection
     * @param {string} sessionId
     */
    constructor(connection, sessionId) {
        this._connection = connection;
        this._sessionId = sessionId;
        this._onMessage = null;
        this._onDisconnect = null;
    }

    /**
     * @override
     * @param {function(!Object)} onMessage
     */
    setOnMessage(onMessage) {
        this._onMessage = onMessage;
    }

    /**
     * @override
     * @param {function(string)} onDisconnect
     */
    setOnDisconnect(onDisconnect) {
        this._onDisconnect = onDisconnect;
    }

    /**
     * @override
     * @param {string} message
     */
    sendRawMessage(message) {
        const messageObject = JSON.parse(message);
        // If the message isn't for a specific session, it must be for the root session.
        if (!messageObject.sessionId) {
            messageObject.sessionId = this._sessionId;
        }
        this._connection.sendRawMessage(JSON.stringify(messageObject));
    }

    /**
     * @override
     * @return {!Promise}
     */
    disconnect() {
        if (this._onDisconnect) {
            this._onDisconnect.call(null, 'force disconnect');
        }
        this._onDisconnect = null;
        this._onMessage = null;
        return Promise.resolve();
    }
}

/**
 * @param {function():!Promise<undefined>} createMainTarget
 * @param {function()} websocketConnectionLost
 * @return {!Promise}
 */
export async function initMainConnection(createMainTarget, websocketConnectionLost) {
    Protocol.Connection.setFactory(_createMainConnection.bind(null, websocketConnectionLost));
    await createMainTarget();
    Host.InspectorFrontendHost.connectionReady();
    Host.InspectorFrontendHost.events.addEventListener(Host.InspectorFrontendHostAPI.Events.ReattachMainTarget, () => {
        SDK.targetManager
            .mainTarget()
            .router()
            .connection()
            .disconnect();
        createMainTarget();
    });
    return Promise.resolve();
}

/**
 * @param {function()} websocketConnectionLost
 * @return {!Protocol.Connection}
 */
export function _createMainConnection(websocketConnectionLost) {
    const wsParam = Root.Runtime.queryParam('ws');
    const wssParam = Root.Runtime.queryParam('wss');
    if (wsParam || wssParam) {
        const ws = wsParam ? `ws://${wsParam}` : `wss://${wssParam}`;
        return new WebSocketConnection(ws, websocketConnectionLost);
    } else if (Host.InspectorFrontendHost.isHostedMode()) {
        return new StubConnection();
    }

    return new MainConnection();
}
