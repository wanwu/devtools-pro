const getResourceType = require('../../utils/getResourceType');
module.exports = ({request, response}, proxyInstance) => {
    response.add(({request: req, response: res}) => {
        const type = res.type;
        const resourceType = getResourceType(type);
        if (resourceType === 'Document') {
            const body = res.body.toString();

        }
    });
};
