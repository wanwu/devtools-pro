/**
 * from https://github.com/webpack/webpack-dev-server/blob/e80976320d/lib/utils/getCertificate.js
 */
const path = require('path');
const fs = require('fs');
const del = require('del');
const selfsigned = require('selfsigned');
const logger = require('./logger');
const findCacheDir = require('./findCacheDir');
function getCertificate() {
    // Use a self-signed certificate if no certificate was configured.
    // Cycle certs every 24 hours
    const certificateDir = findCacheDir('ssl');
    const certificatePath = path.join(certificateDir, 'ca.pem');

    let certificateExists = fs.existsSync(certificatePath);

    if (certificateExists) {
        const certificateTtl = 1000 * 60 * 60 * 24;
        const certificateStat = fs.statSync(certificatePath);

        const now = new Date();

        // cert is more than 30 days old, kill it with fire
        if ((now - certificateStat.ctime) / certificateTtl > 30) {
            logger.info('SSL Certificate is more than 30 days old. Removing.');

            del.sync([certificatePath], {force: true});

            certificateExists = false;
        }
    }

    if (!certificateExists) {
        logger.info('Generating SSL Certificate');

        const attributes = [{name: 'commonName', value: 'localhost'}];
        const pems = createCertificate(attributes);

        fs.mkdirSync(certificateDir, {recursive: true});
        fs.writeFileSync(certificatePath, pems.private + pems.cert, {
            encoding: 'utf8'
        });
    }

    return fs.readFileSync(certificatePath);
}

module.exports = getCertificate;

function createCertificate(attributes) {
    return selfsigned.generate(attributes, {
        algorithm: 'sha256',
        days: 30,
        keySize: 2048,
        extensions: [
            // {
            //   name: 'basicConstraints',
            //   cA: true,
            // },
            {
                name: 'keyUsage',
                keyCertSign: true,
                digitalSignature: true,
                nonRepudiation: true,
                keyEncipherment: true,
                dataEncipherment: true
            },
            {
                name: 'extKeyUsage',
                serverAuth: true,
                clientAuth: true,
                codeSigning: true,
                timeStamping: true
            },
            {
                name: 'subjectAltName',
                altNames: [
                    {
                        // type 2 is DNS
                        type: 2,
                        value: 'localhost'
                    },
                    {
                        type: 2,
                        value: 'localhost.localdomain'
                    },
                    {
                        type: 2,
                        value: 'baidu.com'
                    },
                    {
                        type: 2,
                        value: '*.baidu.com'
                    },
                    {
                        type: 2,
                        value: 'baidu-int.com'
                    },
                    {
                        type: 2,
                        value: '*.baidu-int.com'
                    },
                    {
                        type: 2,
                        value: '[::1]'
                    },
                    {
                        // type 7 is IP
                        type: 7,
                        ip: '127.0.0.1'
                    },
                    {
                        type: 7,
                        ip: 'fe80::1'
                    }
                ]
            }
        ]
    });
}
