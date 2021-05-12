import {Capability, SDKModel, Target} from '../sdk/SDKModel.js';

Protocol.inspectorBackend.registerEvent('$Bridge.messageChannel', ['event', 'payload']);

Protocol.inspectorBackend.registerCommand(
    '$Bridge.messageChannel',
    [
        {name: 'event', type: 'string', optional: false},
        {name: 'payload', type: 'object', optional: true}
    ],
    ['result'],
    false
);

class Bridge {
    // agent发送消息
    // dispathcher 接受消息
    constructor(model, agent) {
        this._model = model;
        this._agent = agent;
        this._listeners = new Map();
    }
    registerEvent(event, listener) {
        this._listeners.set(event, listener);
    }
    sendCommand(event, payload) {
        return this._agent.messageChannel(event, payload);
    }
    // backend事件接收触发
    messageChannel(event, data) {
        const handler = this._listeners.get(event);
        if (handler && typeof handler === 'function') {
            return handler(data) || {};
        } else {
            throw Error(`${event} unimplemented`);
        }
    }
}

export class BridgeModel extends SDKModel {
    static Events = {
        messageChannel: Symbol('bridge-messageChannel')
    };
    constructor(target) {
        super(target);
        this._agent = target.$BridgeAgent();
        const dispatcher = (this._dispatcher = new Bridge(this, this._agent));
        // 给runtime加个方法
        runtime.bridge = dispatcher;
        // this._agent.messageChannel('ffff', {}).then(a => console.log(a));
        this.target().register$BridgeDispatcher(this._dispatcher);
    }
}
export class Main extends Common.Object {
    run() {
        SDK.SDKModel.register(BridgeModel, Capability.None, true);
        SDK.targetManager.addModelListener(BridgeModel, BridgeModel.Events.messageChannel, {});
    }
}
