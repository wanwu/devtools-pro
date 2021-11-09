const path = require('path');
const utils = require('util');
const fs = require('fs');
const del = require('del');
const mkdirp = require('mkdirp');
const NodeForge = require('node-forge');
const findCacheDir = require('./utils/findCacheDir');
const logger = require('./utils/logger');

const pki = NodeForge.pki;
const readFile = utils.promisify(fs.readFile);
const writeFile = utils.promisify(fs.writeFile);

const CA_ATTRS = [
    {
        name: 'commonName',
        value: 'DevtoolsProFoxy'
    },
    {
        name: 'countryName',
        value: 'CN'
    },
    {
        shortName: 'ST',
        value: 'Beijing'
    },
    {
        name: 'localityName',
        value: 'Bidu'
    },
    {
        name: 'organizationName',
        value: 'Devtools-pro Foxy CA'
    },
    {
        shortName: 'OU',
        value: 'https://github.com/wanwu/devtools-pro'
    }
];

const CA_EXTENSIONS = [
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
        emailProtection: true,
        timeStamping: true
    },
    {
        name: 'nsCertType',
        client: true,
        server: true,
        email: true,
        objsign: true,
        sslCA: true,
        emailCA: true,
        objCA: true
    },
    {
        name: 'subjectKeyIdentifier'
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
                value: 'baidu.com'
            },
            {
                type: 2,
                value: 'devtools.baidu.com'
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
];

class CA {
    constructor(dir) {
        this.baseCAFolder = dir || findCacheDir('ssl');
        this.certsFolder = path.join(this.baseCAFolder, 'certs');
        this.keysFolder = path.join(this.baseCAFolder, 'keys');
        this.caFilepath = path.join(this.certsFolder, 'ca.pem');
        this.caPrivateFilepath = path.join(this.keysFolder, 'ca.private.key');
        this.caPublicFilepath = path.join(this.keysFolder, 'ca.public.key');
        this.cert = null;
        this.keys = null;
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
    async create() {
        await mkdirp(this.baseCAFolder);
        await mkdirp(this.certsFolder);
        await mkdirp(this.keysFolder);
        if (fs.existsSync(this.caFilepath)) {
            await this.load();
        } else {
            await this.gen();
        }
    }
    async load() {
        const certPEM = await readFile(this.caFilepath, 'utf-8');
        const keyPrivatePEM = await readFile(this.caPrivateFilepath, 'utf-8');
        const keyPublicPEM = await readFile(this.caPublicFilepath, 'utf-8');

        this.cert = pki.certificateFromPem(certPEM);
        this.keys = {
            privateKey: pki.privateKeyFromPem(keyPrivatePEM),
            publicKey: pki.publicKeyFromPem(keyPublicPEM)
        };
    }
    gen() {
        const self = this;
        logger.info('Generating CA...');
        return new Promise(async (resolve, reject) => {
            pki.rsa.generateKeyPair({bits: 2048}, function(err, keyPair) {
                if (err) {
                    return reject(err);
                }
                let cert = pki.createCertificate();
                cert.publicKey = keyPair.publicKey;
                cert.serialNumber = randomSerialNumber();
                cert.validity.notBefore = new Date();
                cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
                cert.validity.notAfter = new Date();
                cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);
                cert.setSubject(CA_ATTRS);
                cert.setIssuer(CA_ATTRS);
                cert.setExtensions(CA_EXTENSIONS);
                cert.sign(keyPair.privateKey, NodeForge.md.sha256.create());
                self.cert = cert;
                self.keys = keyPair;
                resolve(
                    Promise.all([
                        writeFile(self.caFilepath, pki.certificateToPem(cert)),
                        writeFile(self.caPrivateFilepath, pki.privateKeyToPem(keyPair.privateKey)),
                        writeFile(self.caPublicFilepath, pki.publicKeyToPem(keyPair.publicKey))
                    ])
                );
                logger.success('Generating CA...');
            });
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
