import EventEmitter from './EventEmitter';

const BATCH_DURATION = 100;

export default class Bridge extends EventEmitter {
    constructor(wall) {
        super();
        this._batchingQueue = [];
        this._sendingQueue = [];
        this._receivingQueue = [];
        this._sending = false;
        this._time = 0;
        this._timer = null;
        this.wall = wall;
        wall.listen(messages => {
            if (Array.isArray(messages)) {
                messages.forEach(message => this._emit(message));
            } else {
                this._emit(messages);
            }
        });
    }

    /**
     * Send an event.
     *
     * @param {String} event
     * @param {*} payload
     */

    send(event, payload) {
        if (Array.isArray(payload)) {
            const lastIndex = payload.length - 1;
            payload.forEach((chunk, index) => {
                this._send({
                    event,
                    chunk: chunk,
                    isLast: index === lastIndex
                });
            });
            this._flush();
        } else if (this._time === 0) {
            this._send([{event, payload}]);
            this._time = Date.now();
        } else {
            this._batchingQueue.push({
                event,
                payload
            });

            const now = Date.now();
            if (now - this._time > BATCH_DURATION) {
                this._flush();
            } else {
                this._timer = setTimeout(() => this._flush(), BATCH_DURATION);
            }
        }
    }

    /**
     * Log a message to the devtools background page.
     *
     * @param {String} message
     */

    log(message) {
        this.send('log', message);
    }

    _flush() {
        if (this._batchingQueue.length) {
            this._send(this._batchingQueue);
        }
        clearTimeout(this._timer);
        this._batchingQueue.length = 0;
        this._time = 0;
    }

    _emit(message) {
        if (typeof message === 'string') {
            this.emit(message);
        } else if (message.chunk) {
            this._receivingQueue.push(message.chunk);
            if (message.isLast) {
                this.emit(message.event, this._receivingQueue);
                this._receivingQueue.length = 0;
            }
        } else {
            this.emit(message.event, message.payload);
        }
    }

    _send(messages) {
        this._sendingQueue.push(messages);
        this._nextSend();
    }

    _nextSend() {
        if (!this._sendingQueue.length || this._sending) {
            return;
        }
        this._sending = true;
        const messages = this._sendingQueue.shift();
        try {
            this.wall.send(messages);
        } catch (err) {
            if (err.message === 'Message length exceeded maximum allowed length.') {
                this._sendingQueue.splice(
                    0,
                    0,
                    messages.map(message => [message])
                );
            }
        }
        this._sending = false;
        requestAnimationFrame(() => this._nextSend());
    }
}
