const WebSocket = require('ws');
class ProtocolError extends Error {
    constructor(request, response) {
        let {message} = response;
        if (response.data) {
            message += ` (${response.data})`;
        }
        super(message);
        // attach the original response as well
        this.request = request;
        this.response = response;
    }
}

module.exports = class CDPClient {
    constructor() {
        this.ws = null;
        this._callbacks = {};
        this._nextCommandId = 1;
        this._messageStack = [];
        this._connected = false;
    }
    async connect(url) {
        const ws = new WebSocket(url);
        this._ws = ws;
        return new Promise((resolve, reject) => {
            ws.on('open', this._onOpen.bind(this));
            ws.on('error', this._onError.bind(this));
            resolve();
        });
    }
    _onError(e) {
        this._connected = false;
        // 强制关闭
        this.close();
    }
    _onOpen() {
        this._connected = true;

        if (this._ws && this._ws.readyState === 1) {
            for (const message of this._messageStack) {
                this._ws.send(message);
            }
        }
        // 清空消息
        this._messageStack.length = 0;
    }
    sendRawMessage(message) {
        if (this._ws && this._ws.readyState > 0) {
            this._ws.send(`@${this._name}\n${message}`);
        } else {
            this._messageStack.push(message);
        }
    }
    send(...args) {
        let method = args[0];
        const optionals = args.slice(1);
        let params = optionals.find(x => typeof x === 'object');
        let sessionId = optionals.find(x => typeof x === 'string');
        let callback = optionals.find(x => typeof x === 'function');
        // return a promise when a callback is not provided
        if (typeof callback === 'function') {
            this._enqueueCommand(method, params, sessionId, callback);
            return undefined;
        }
        return new Promise((resolve, reject) => {
            this._enqueueCommand(method, params, sessionId, (error, response) => {
                if (error) {
                    const request = {method, params, sessionId};
                    reject(
                        error instanceof Error
                            ? error // low-level WebSocket error
                            : new ProtocolError(request, response)
                    );
                } else {
                    resolve(response);
                }
            });
        });
    }

    close(callback) {
        const closeWebSocket = callback => {
            // don't close if it's already closed
            if (this._ws.readyState === 3) {
                callback();
            } else {
                // don't notify on user-initiated shutdown ('disconnect' event)
                this._ws.removeAllListeners('close');
                this._ws.once('close', () => {
                    this._ws.removeAllListeners();
                    callback();
                });
                this._ws.close();
            }
        };
        if (typeof callback === 'function') {
            closeWebSocket(callback);
            return undefined;
        }
        return new Promise((resolve, reject) => {
            closeWebSocket(resolve);
        });
    }
    // send a command to the remote endpoint and register a callback for the reply
    _enqueueCommand(method, params, sessionId, callback) {
        const id = this._nextCommandId++;
        const message = {
            id,
            method,
            sessionId,
            params: params || {}
        };
        this._ws.send(JSON.stringify(message), err => {
            if (err) {
                // handle low-level WebSocket errors
                if (typeof callback === 'function') {
                    callback(err);
                }
            } else {
                this._callbacks[id] = callback;
            }
        });
    }
};
