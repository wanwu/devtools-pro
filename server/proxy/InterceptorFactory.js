const matcher = require('../utils/matcher');

class InterceptorFactory {
    constructor() {
        this._hanlders = [];
    }
    add(handler, filterDetail) {
        console.log(handler, filterDetail);
        return (
            this._hanlders.push({
                handler,
                filterDetail
            }) - 1
        );
    }
    remove(id) {
        if (this._handlers[id]) {
            this._handlers[id] = null;
        }
    }
    async run(params, test) {
        for (let {handler, filterDetail} of this._hanlders) {
            let runIt = true;
            if (filterDetail && typeof test === 'function') {
                runIt = test(filterDetail);
            }
            if (runIt) {
                await handler(params);
            }
        }
    }
}

module.exports = InterceptorFactory;
module.exports.createFilter = context => {
    return function interceptorFilterFunc(filterDetail) {
        return matcher(filterDetail, context);
    };
};
