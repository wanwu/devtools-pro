export default class EventEmitter {
    constructor() {
        this.listeners = new Map();
    }
    on(eventName, listener) {
        let listeners = this.listeners.get(eventName);
        if (typeof listener !== 'function') {
            throw new Error(`[EventEmitter.on] ${listener} is not Function`);
        }
        const added = listeners && listeners.push(listener);
        if (!added) {
            this.listeners.set(eventName, [listener]);
        }
    }
    once(eventName, listener) {
        let onceListener = (...args) => {
            this.off(eventName, onceListener);
            listener.apply(this, args);
        };
        this.on(eventName, onceListener);
    }
    off(eventName, listener) {
        const listeners = this.listeners.get(eventName);
        if (listeners) {
            listeners.splice(listeners.indexOf(listener) >>> 0, 1);
        }
    }
    emit(eventName, data) {
        const listeners = this.listeners.get(eventName);
        if (listeners && listeners.length > 0) {
            listeners.map(listener => {
                listener(data);
            });
        }
    }
    removeAllListeners(eventName) {
        if (eventName) {
            const listeners = this.listeners.get(eventName);
            if (listeners && listeners.length > 0) {
                listeners.length = 0;
                this.listeners.delete(eventName);
            }
        } else {
            this.listeners.clear();
        }
    }
}
