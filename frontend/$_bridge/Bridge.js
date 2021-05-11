import {Capability, SDKModel, Target} from '../sdk/SDKModel.js';

Protocol.inspectorBackend.registerEvent('$Bridge.messageReceived', ['event', 'payload']);

Protocol.inspectorBackend.registerCommand(
    '$Bridge.messageReceived',
    [
        {name: 'event', type: 'string', optional: false},
        {name: 'payload', type: 'object', optional: false}
    ],
    [],
    false
);

class Bridge {
    // agent发送消息
    // dispathcher 接受消息
    constructor(model, agent) {
        this._model = model;
        this._agent = agent;
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
    emit(event, payload) {
        return this._agent.messageReceived(event, payload);
    }
    // backend事件接收触发
    messageReceived(eventName, data) {
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

export class BridgeModel extends SDKModel {
    static Events = {
        messageReceived: Symbol('bridge-messageReceived')
    };
    constructor(target) {
        super(target);
        this._agent = target.$BridgeAgent();
        const dispatcher = (this._dispatcher = new Bridge(this, this._agent));
        // 给runtime加个方法
        runtime.bridge = dispatcher;
        // this._agent.messageReceived('ffff', {}).then(a => console.log(a));
        this.target().register$BridgeDispatcher(this._dispatcher);
    }
}
export class Main extends Common.Object {
    run() {
        SDK.SDKModel.register(BridgeModel, Capability.None, true);
        SDK.targetManager.addModelListener(BridgeModel, BridgeModel.Events.messageReceived, {});
    }
}
