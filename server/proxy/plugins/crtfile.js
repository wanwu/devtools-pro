const fs = require('fs');
const path = require('path');
module.exports = ({request, response}, proxyInstance) => {
    const id = request.add(
        ({request: req, response: res}) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            const caFilePath = proxyInstance.caFilePath;
            // path.join(proxyInstance.sslCaDir, 'certs/ca.pem');
            // console.log(caFilePath);
            if (fs.existsSync(caFilePath)) {
                const extname = path.extname(caFilePath);
                res.setHeader('Content-Type', 'application/x-x509-ca-cert');
                res.setHeader('Content-Disposition', `attachment; filename="rootCA${extname}"`);
                res.end(fs.readFileSync(caFilePath, {encoding: null}));
            } else {
                res.setHeader('Content-Type', 'text/html');
                res.end('Can not found rootCA');
            }
        },
        {host: 'devtools.pro', path: '/ssl'}
    );
    return () => {
        request.remove(id);
    };
};
