import EventEmitter from './EventEmitter';

class Channel extends EventEmitter {
    constructor(name, ws) {
        super();
        this._messageStack = [];
        this._connected = false;
        this._ws = ws;
        ws.onopen = this._onOpen.bind(this);
        this._name = name;
    }
    _onOpen() {
        this._connected = true;

        if (this._ws) {
            for (const message of this._messageStack) {
                this._ws.send(message);
            }
        }
        // 清空消息
        this._messageStack.length = 0;
        this.emit('open');
    }
    sendRawMessage(message) {
        if (this._ws && this._ws.readyState > 0) {
            this._ws.send(`@${this._name}\n${message}`);
        } else {
            this._messageStack.push(message);
        }
    }
    send(event, data) {
        if (event && data) {
            data = JSON.stringify({
                event,
                payload: data
            });
        } else if (!data) {
            data = event;
        }
        if (typeof data === 'object') {
            data = JSON.stringify(data);
        }
        this.sendRawMessage(data);
    }
}

export default class WebSocketMultiplex extends EventEmitter {
    constructor(sockUrl) {
        super();
        this._url = sockUrl;
        this._channelsMap = new Map();
        this._messageStack = [];
        this._connected = false;

        const ws = (this._ws = new window.WebSocket(this._url));

        ws.onerror = this._onError.bind(this);
        ws.onopen = this._onOpen.bind(this);
        ws.onclose = this._onClose.bind(this);
        ws.onmessage = event => {
            if (event.data.startsWith('@')) {
                const t = event.data.split('\n');
                const channelName = t.shift();
                if (channelName) {
                    const channel = this._channelsMap.get(channelName.replace(/^@/, ''));
                    if (channel) {
                        const payload = t.join('\n');
                        channel.emit('message', {data: payload});
                    }
                }
            } else {
                this.emit('message', event);
            }
        };
    }
    registerChannel(name) {
        const channel = new Channel(name, this._ws);
        this._channelsMap.set(name, channel);
        return channel;
    }
    sendRawMessage(message) {
        if (this.isConnected()) {
            this._ws.send(message);
        } else {
            this._messageStack.push(message);
        }
    }
    disconnect() {
        return new Promise(resolve => {
            this._close(() => {
                this.emit('close');
                resolve();
            });
        });
    }
    isConnected() {
        return this._connected && this._ws;
    }
    send(message) {
        if (this._ws && this._connected) {
            if (typeof message === 'object') {
                message = JSON.stringify(message);
            }
            this._ws.send(message);
        }
    }
    getWs() {
        return this._ws;
    }
    getChannelsMap() {
        return this._channelsMap;
    }
    /**
     * 这个只是第一次使用，链接之后会换掉ws.onerror
     */
    _onError(e) {
        this._connected = false;
        this.emit('error', e);
        // 强制关闭
        this._close();
    }
    _onOpen() {
        this._connected = true;

        if (this._ws) {
            this._ws.onerror = err => {
                console.error('WebSocket Error');
                console.error(err);
                this.emit('error', err);
            };
            for (const message of this._messageStack) {
                this._ws.send(message);
            }
        }
        // 清空消息
        this._messageStack.length = 0;
        this.emit('open');
    }
    _onClose() {
        this.emit('close');
        this._close();
    }
    _close(callback) {
        if (this._ws) {
            this._ws.onerror = null;
            this._ws.onopen = null;
            this._ws.onclose = callback || null;
            this._ws.onmessage = null;
            this._ws.close();
            this._ws = null;
        }
        this.removeAllListeners();
    }
}
