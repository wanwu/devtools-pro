import EventEmitter from '@lib/EventEmitter';
import methods from '@domains';
import CDPError from './Error';
import {nanoid} from 'nanoid';

class Backend extends EventEmitter {
    constructor(bridge) {
        super();
        this._bridge = bridge;
    }
    sendMessage(method, params) {
        const id = nanoid();

        this.sendRawMessage(
            JSON.stringify({
                id,
                method,
                params
            })
        );

        return new Promise(resolve => {
            this.resolves.set(id, resolve);
        });
    }

    async sendRawMessage(message) {
        const parsedMessage = JSON.parse(message);

        const {id, method, params} = parsedMessage;

        const resultMsg = {id};

        try {
            resultMsg.result = await this._call(method, params);
        } catch (e) {
            resultMsg.error = {
                message: e.message
            };
        }

        this._bridge.emit('message', JSON.stringify(resultMsg));
    }
    async _call(method, params) {
        if (methods[method]) {
            return methods[method](params) || {};
        } else {
            throw new CDPError(`${method} unimplemented`);
        }
    }
}
