const path = require('path');
const utils = require('util');
const fs = require('fs');
const del = require('del');
const ora = require('ora');
const mkdirp = require('mkdirp');
const NodeForge = require('node-forge');
const findCacheDir = require('./utils/findCacheDir');
const logger = require('./utils/logger');
const LRUCache = require('lru-cache');
const cache = new LRUCache({
    max: 100,
    maxAge: 1000 * 60 * 60 * 12 // 1 hour
});
// 30 days
const SERVER_CERT_TIMEOUT = 30;
const ROOT_CERT_TIMEOUT = 824;

const pki = NodeForge.pki;
const readFile = utils.promisify(fs.readFile);
const writeFile = utils.promisify(fs.writeFile);
const fsstat = utils.promisify(fs.stat);

const SERVER_EXTENSIONS = [
    {
        name: 'basicConstraints',
        cA: true
    },
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
                value: 'devtools.pro'
            },
            {
                type: 2,
                value: '*.devtools.pro'
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
];
const DEFAULT_ATTRS = [
    {
        name: 'commonName',
        value: 'DevtoolsProFoxy'
    },
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
        // 存放网站
        this.certsFolder = path.join(this.baseCAFolder, 'certs');
        // root CA 证书路径
        this.caFilepath = path.join(this.baseCAFolder, 'ca.pem');
        this.caPrivateFilepath = path.join(this.baseCAFolder, 'ca.private.key');
        this.caPublicFilepath = path.join(this.baseCAFolder, 'ca.public.key');
        this.CAcert = null;
        this.CAkeys = null;
    }
    static async getServerCA(dir) {
        const certificatePath = path.join(dir, 'server.pem');
        let certificateExists = await ifCertificateExpireDelete(certificatePath, SERVER_CERT_TIMEOUT);

        if (!certificateExists) {
            const spinner = ora('Generating Server CA...').start();

            const {cert, keys} = getKeysAndCert(SERVER_CERT_TIMEOUT);

            let attrs = [{name: 'commonName', value: 'DevtoolsProServer'}];

            cert.setSubject(attrs);
            cert.setIssuer(attrs);
            cert.setExtensions(SERVER_EXTENSIONS);
            cert.sign(keys.privateKey, NodeForge.md.sha256.create());
            const certPem = pki.certificateToPem(cert);
            const keyPem = pki.privateKeyToPem(keys.privateKey);
            // 创建
            await mkdirp(dir);
            // 双写
            const content = keyPem + certPem;
            await writeFile(certificatePath, content, {
                encoding: 'utf8'
            });
            spinner.succeed();
            logger.info('Server PEM: ' + certificatePath);
            return content;
        }
        return await readFile(certificatePath);
    }
    getRootPath() {
        return this.baseCAFolder;
    }
    getRootCAPath() {
        return this.caFilepath;
    }
    clean() {
        const spinner = ora('Delete Certificate Folder...').start();
        try {
            del.sync(this.getRootPath(), {force: true});
            spinner.succeed();
        } catch (e) {
            spinner.fail();
            logger.error(e);
        }
    }
    async create(callback) {
        try {
            await mkdirp(this.baseCAFolder);
            await mkdirp(this.certsFolder);

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
        // 过期删除
        let certificateExists = await ifCertificateExpireDelete(this.caFilepath, ROOT_CERT_TIMEOUT);

        if (!certificateExists) {
            return await this.genCA();
        }
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
        const spinner = ora('Generating Proxy RootCA...').start();

        const {cert, keys} = getKeysAndCert(ROOT_CERT_TIMEOUT);

        let attrs = DEFAULT_ATTRS.slice(0);

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
        spinner.succeed();
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
        if (fs.existsSync(certFilepath)) {
            readFile(certFilepath)
                .then(cert => {
                    const ckeys = {
                        privateKey: cert,
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

        const {keys, cert} = getKeysAndCert();

        const caCert = this.CAcert;
        const caKey = this.CAkeys.privateKey;

        cert.setIssuer(caCert.issuer.attributes);

        let attrs = DEFAULT_ATTRS.slice(1);
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
        const content = Buffer.from(keyPrivatePem + certPem);
        const ckeys = {
            privateKey: content,
            // publicKey: pki.publicKeyToPem(keys.publicKey),
            certificate: content
        };
        cache.set(mainHost, ckeys);
        callback(null, ckeys);

        fs.writeFile(certFilepath, content, error => {
            if (error) {
                logger.error('Failed to save certificate to disk in ' + this.certsFolder, error);
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
function getKeysAndCert(days = ROOT_CERT_TIMEOUT) {
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = randomSerialNumber();
    let now = Date.now();
    // compatible with apple's updated cert policy: https://support.apple.com/en-us/HT210176
    cert.validity.notBefore = new Date(now - 24 * 60 * 60 * 1000); // 1 day before
    cert.validity.notAfter = new Date(now + days * 24 * 60 * 60 * 1000); // 824 days after
    return {
        keys,
        cert
    };
}
async function ifCertificateExpireDelete(certificatePath, days = SERVER_CERT_TIMEOUT) {
    let certificateExists = false;
    try {
        const certificate = await fsstat(certificatePath);
        certificateExists = certificate.isFile();
    } catch {
        certificateExists = false;
    }
    if (certificateExists) {
        const certificateStat = await fsstat(certificatePath);

        const now = new Date();

        // 如果超过30天，则删除，重新生成
        if ((now - certificateStat.ctime) / (1000 * 60 * 60 * 24) > days - 1) {
            logger.info(`SSL certificate is more than ${days} days old. Removing...`);

            await del([certificatePath], {force: true});

            certificateExists = false;
        }
    }
    return certificateExists;
}
