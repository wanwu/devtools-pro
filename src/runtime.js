class Runtime {
    constructor(chobitsu) {
        this._chobitsu = chobitsu;
    }
    off(method) {
        const [name, cmd] = method.split('.');
        delete this._chobitsu.domain(name)[cmd];
    }
    // 注册domain command
    on(method, handler) {
        if (handler && typeof handler === 'function' && typeof name === 'string') {
            this._chobitsu.registerMethod({
                [method]: handler
            });
        } else {
            this._chobitsu.registerMethod(method);
        }
    }
    // 发送domain事件
    sendCommand(method, params) {
        this._chobitsu.trigger(method, params);
    }
}

export default function createRuntime(chobitsu) {
    const $devtools = (self.$devtools = new Runtime(chobitsu));
}
