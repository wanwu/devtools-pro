const os = require('os');
const ipaddr = require('ipaddr.js');
const defaultGateway = require('default-gateway');
const cached = {};
function internalIPSync(family = 'v4') {
    if (cached[family]) {
        return cached[family];
    }
    try {
        const {gateway} = defaultGateway[family].sync();
        const ip = findIp(gateway);
        cached[family] = ip;
        return ip;
    } catch {
        // ignore
    }
}

function findIp(gateway) {
    const gatewayIp = ipaddr.parse(gateway);

    // Look for the matching interface in all local interfaces.
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const {cidr} of addresses) {
            const net = ipaddr.parseCIDR(cidr);

            if (net[0] && net[0].kind() === gatewayIp.kind() && gatewayIp.match(net)) {
                return net[0].toString();
            }
        }
    }
}
// console.log(internalIPSync());
module.exports = internalIPSync;
