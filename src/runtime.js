import EventEmitter from './lib/EventEmitter';

class Runtime extends EventEmitter {
    constructor(chobitsu) {
        super();
        this._chobitsu = chobitsu;
        chobitsu.registerMethod('$Bridge.messageReceived', (...args) => {
            args.forEach(({event, payload}) => {
                super.emit(event, payload);
            });
        });
    }
    emit(method, params) {
        this._chobitsu.trigger('$Bridge.messageReceived', {event: method, payload: params});
    }
    registerMethod(method, fn) {
        this._chobitsu.registerMethod(method, fn);
    }
    // 发送domain事件
    sendCommand(method, params) {
        this._chobitsu.trigger(method, params);
    }
}

export default function createRuntime(chobitsu) {
    const $devtools = (self.$devtools = new Runtime(chobitsu));
}
