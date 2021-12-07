const path = require('path');
const utils = require('util');
const fs = require('fs');
const del = require('del');
const mkdirp = require('mkdirp');
const NodeForge = require('node-forge');
const findCacheDir = require('./utils/findCacheDir');
const logger = require('./utils/logger');
const LRUCache = require('lru-cache');
const cache = new LRUCache({
    max: 100,
    maxAge: 1000 * 60 * 60 * 12 // 1 hour
});

const pki = NodeForge.pki;
const readFile = utils.promisify(fs.readFile);
const writeFile = utils.promisify(fs.writeFile);

const DEFAULT_ATTRS = [
    {
        name: 'countryName',
        value: 'Internet'
    },
    {
        shortName: 'ST',
        value: 'Internet'
    },
    {
        name: 'localityName',
        value: 'Internet'
    },
    {
        name: 'organizationName',
        value: 'Bidu KFive Foxy CA'
    },
    {
        shortName: 'OU',
        value: 'Bidu KFive Foxy Server Certificate'
    }
];

const ServerExtensions = [
    {
        name: 'basicConstraints',
        cA: false
    }
];
class CA {
    constructor(dir) {
        this.baseCAFolder = dir || findCacheDir('ssl');
        this.certsFolder = path.join(this.baseCAFolder, 'certs');
        this.keysFolder = path.join(this.baseCAFolder, 'keys');
        this.caFilepath = path.join(this.certsFolder, 'ca.pem');
        this.caPrivateFilepath = path.join(this.keysFolder, 'ca.private.key');
        this.caPublicFilepath = path.join(this.keysFolder, 'ca.public.key');
        this.CAcert = null;
        this.CAkeys = null;
    }
    getRootPath() {
        return this.baseCAFolder;
    }
    getRootCAPath() {
        return this.caFilepath;
    }
    clean() {
        logger.log();
        logger.info('Delete RootCA...');
        try {
            del.sync(this.getRootPath(), {force: true});
            logger.success('success');
        } catch (e) {
            logger.error(e);
        }
    }
    async create(callback) {
        try {
            await mkdirp(this.baseCAFolder);
            await mkdirp(this.certsFolder);
            await mkdirp(this.keysFolder);

            if (fs.existsSync(this.caFilepath)) {
                await this.loadCA();
            } else {
                await this.genCA();
            }
            callback(null);
        } catch (e) {
            callback(e);
        }
    }
    async loadCA() {
        const certPEM = await readFile(this.caFilepath, 'utf-8');
        const keyPrivatePEM = await readFile(this.caPrivateFilepath, 'utf-8');
        const keyPublicPEM = await readFile(this.caPublicFilepath, 'utf-8');

        this.CAcert = pki.certificateFromPem(certPEM);
        this.CAkeys = {
            privateKey: pki.privateKeyFromPem(keyPrivatePEM),
            publicKey: pki.publicKeyFromPem(keyPublicPEM)
        };
    }
    async genCA() {
        const infoText = 'Generating CA...';
        logger.info(infoText);

        const {cert, keys} = getKeysAndCert();

        let attrs = DEFAULT_ATTRS.slice(0);
        attrs.unshift({
            name: 'commonName',
            value: 'DevtoolsProFoxy'
        });
        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        cert.setExtensions([
            {
                name: 'basicConstraints',
                cA: true
            }
        ]);
        cert.sign(keys.privateKey, NodeForge.md.sha256.create());
        this.CAcert = cert;
        this.CAkeys = keys;
        await writeFile(this.caFilepath, pki.certificateToPem(cert));
        await writeFile(this.caPrivateFilepath, pki.privateKeyToPem(keys.privateKey));
        await writeFile(this.caPublicFilepath, pki.publicKeyToPem(keys.publicKey));
        logger.success(infoText);
    }
    getCertificateByHostname(hostname, callback) {
        if (!Array.isArray(hostname)) {
            hostname = [hostname];
        }
        const mainHost = hostname[0];
        const hostPath = mainHost.replace(/\*/g, '_');

        const cachedKeys = cache.get(mainHost);
        if (cachedKeys) {
            return callback(null, cachedKeys);
        }
        const certFilepath = path.join(this.certsFolder, hostPath + '.pem');
        const privateKeyFilepath = path.join(this.keysFolder, hostPath + '.key');
        if (fs.existsSync(certFilepath) && fs.existsSync(privateKeyFilepath)) {
            Promise.all([readFile(certFilepath), readFile(privateKeyFilepath)])
                .then(([cert, key]) => {
                    const ckeys = {
                        privateKey: key,
                        // publicKey: pki.publicKeyToPem(keys.publicKey),
                        certificate: cert
                    };
                    cache.set(mainHost, ckeys);
                    callback(null, ckeys);
                })
                .catch(e => {
                    callback(e);
                });
            return;
        }

        const md = NodeForge.md.md5.create();
        md.update(mainHost);

        const {keys, cert} = getKeysAndCert();

        const caCert = this.CAcert;
        const caKey = this.CAkeys.privateKey;

        cert.setIssuer(caCert.issuer.attributes);

        let attrs = DEFAULT_ATTRS.slice(0);
        attrs.unshift({
            name: 'commonName',
            value: mainHost
        });
        cert.setSubject(attrs);
        cert.setExtensions(
            ServerExtensions.concat([
                {
                    name: 'subjectAltName',
                    altNames: hostname.map(host => {
                        if (/^[\d\.]+$/.test(host)) {
                            return {type: 7, ip: host};
                        }
                        return {type: 2, value: host};
                    })
                }
            ])
        );

        cert.sign(caKey, NodeForge.md.sha256.create());
        const certPem = pki.certificateToPem(cert);
        const keyPrivatePem = pki.privateKeyToPem(keys.privateKey);
        const ckeys = {
            privateKey: keyPrivatePem,
            // publicKey: pki.publicKeyToPem(keys.publicKey),
            certificate: certPem
        };
        cache.set(mainHost, ckeys);
        callback(null, ckeys);

        fs.writeFile(certFilepath, certPem, error => {
            if (error) {
                logger.error('Failed to save certificate to disk in ' + this.certsFolder, error);
            }
        });
        fs.writeFile(privateKeyFilepath, keyPrivatePem, error => {
            if (error) {
                logger.error('Failed to save private key to disk in ' + this.keysFolder, error);
            }
        });
    }
}

module.exports = CA;

function randomSerialNumber() {
    // generate random 16 bytes hex string
    let sn = '';
    for (let i = 0; i < 4; i++) {
        sn += ('00000000' + Math.floor(Math.random() * Math.pow(256, 4)).toString(16)).slice(-8);
    }
    return sn;
}
function getKeysAndCert() {
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = randomSerialNumber();
    let now = Date.now();
    // compatible with apple's updated cert policy: https://support.apple.com/en-us/HT210176
    cert.validity.notBefore = new Date(now - 24 * 60 * 60 * 1000); // 1 day before
    cert.validity.notAfter = new Date(now + 824 * 24 * 60 * 60 * 1000); // 824 days after
    return {
        keys,
        cert
    };
}
