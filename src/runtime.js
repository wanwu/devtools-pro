import EventEmitter from './lib/EventEmitter';

class Runtime {
    constructor(chobitsu) {
        this._chobitsu = chobitsu;
        this._eventEmitter = new EventEmitter();
    }
    isDomainEnabled(domainName) {
        return !!this._chobitsu.domain(domainName);
    }
    // 批量注册domain
    registerDomains(domainsMap) {
        this._chobitsu.registerMethod(domainsMap);
    }
    // 注册domain
    registerDomain(domainName, method) {
        this._chobitsu.registerMethod({
            [domainName]: method
        });
    }
    // 发送domain事件
    sendCommand(domainName, params) {
        this._chobitsu.trigger(domainName, params);
    }
}

export default function createRuntime(chobitsu) {
    const $devtools = (self.$devtools = new Runtime(chobitsu));
}
