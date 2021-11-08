const EventEmitter = require('events').EventEmitter;
const WebSocket = require('ws');
const createDebug = require('../utils/createDebug');
const debugMsgReceived = createDebug('CDP:Received');
const debugMsgSent = createDebug('CDP:sent');
const logger = require('../utils/logger');

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

module.exports = class CDPClient extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this._callbacks = {};
        this._nextCommandId = 1;
        this._messageStack = [];
        this._connected = false;
    }
    async connect(url) {
        const ws = new WebSocket(url, {
            rejectUnauthorized: false
        });
        this._ws = ws;
        return new Promise((resolve, reject) => {
            ws.on('open', this._onOpen.bind(this));
            ws.on('error', this._onError.bind(this));
            ws.on('message', this._onMessage.bind(this));
            ws.on('close', this._onClose.bind(this));
            resolve();
        });
    }
    _onMessage(data) {
        // {"id":7,"method":"Network.getResponseBody","params":{"requestId":"1061"}}
        const message = JSON.parse(data);
        const {method, params} = message;
        debugMsgReceived(method, params);
        this.emit('message', message);
    }
    _onError(e) {
        this._connected = false;
        // 强制关闭
        this.close();
        this.emit('error', e);
        logger.error(e);
    }
    _onOpen() {
        this._connected = true;

        // if (this._ws && this._ws.readyState === 1) {
        //     for (const message of this._messageStack) {
        //         this._ws.send(message);
        //     }
        // }
        // 清空消息
        this._messageStack.length = 0;
        this.emit('open');
    }
    _onClose() {
        this.emit('close');
    }
    sendRawMessage(message, callback) {
        const id = this._nextCommandId++;
        if (this._ws && this._ws.readyState === 1) {
            message = typeof message === 'string' ? message : JSON.stringify(message);
            // message = '@' + this.id + '\n' + message;
            this._ws.send(message, err => {
                if (err) {
                    if (typeof callback === 'function') {
                        callback(err);
                    }
                } else {
                    this._callbacks[id] = callback;
                }
            });
        } else {
            this._messageStack.push(message);
        }
    }
    sendResult(id, result) {
        const message = {
            id: parseInt(id, 10),
            result
        };
        this.sendRawMessage(JSON.stringify(message));
    }
    sendCommand(...args) {
        let method = args[0];
        const optionals = args.slice(1);
        let params = optionals.find(x => typeof x === 'object');
        let sessionId = optionals.find(x => typeof x === 'string');
        let callback = optionals.find(x => typeof x === 'function');
        debugMsgSent(method, params);
        if (typeof callback === 'function') {
            this._sendCommand(method, params, sessionId, callback);
            return undefined;
        }
        return new Promise((resolve, reject) => {
            this._sendCommand(method, params, sessionId, (error, response) => {
                if (error) {
                    const request = {method, params, sessionId};
                    reject(error instanceof Error ? error : new ProtocolError(request, response));
                } else {
                    resolve(response);
                }
            });
        });
    }
    _sendCommand(method, params, sessionId, callback) {
        const message = {
            method,
            sessionId,
            params: params || {}
        };
        this.sendRawMessage(message, callback);
    }
    close(callback) {
        const closeWebSocket = callback => {
            if (this._ws.readyState === 3) {
                callback();
            } else {
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
};
