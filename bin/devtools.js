#!/usr/bin/env node

/**
 * Copyright (c) Baidu Inc. All rights reserved.
 *
 * This source code is licensed under the MIT license.
 * See LICENSE file in the project root for license information.
 *
 * @file bin 文件入口
 * @author ksky521
 */
const fs = require('fs');
const path = require('path');
/* eslint-disable no-console */
const updateNotifier = require('update-notifier');
const semver = require('semver');
const colorette = require('colorette');
const logger = require('../server/utils/logger');
const inernalIPSync = require('../server/utils/internalIPSync');

const {
    scriptName,
    engines: {node: requiredNodeVersion},
    name: pkgName,
    version: pkgVersion
} = require('../package.json');

const DEFAULT_PORT = 8001;
const DEFAULT_PROXY_PORT = 8002;

// set process
process.title = scriptName;

// 1. 检测 node 版本
checkNodeVersion(requiredNodeVersion, pkgName);
// 2. 检测最新版本
upNotifier(pkgVersion, pkgName);
// 3. 加载bin
require('yargs')
    .scriptName(scriptName)
    .detectLocale(false)
    .usage('Usage: $0 <command> [options]')
    .command(
        '$0',
        'A web remote debugging tools, based on Chrome DevTools',
        {
            plugins: {
                type: 'array',
                describe: 'Add plugins'
            },
            proxy: {
                type: 'bollen',
                default: true,
                describe: 'Proxy server enabled'
            },
            // proxyUA: {
            //     type: 'string',
            //     alias: 'proxy-user-agent',
            //     describe: 'Set proxy config: client user-agent. [glob-string]'
            // },
            // proxyDomain: {
            //     type: 'string',
            //     alias: 'proxy-domain',
            //     describe: 'Set proxy config: domain. [glob-string]'
            // },
            proxyPort: {
                type: 'number',
                default: 8002,
                describe: `Proxy server port to use [${DEFAULT_PROXY_PORT}]`
            },
            config: {
                default: 'devtools.config.js',
                type: 'string',
                describe: 'Provide path to a devtools configuration file e.g. ./devtools.config.js'
            },
            open: {
                alias: 'o',
                default: true,
                type: 'boolean',
                describe: 'Open browser when server start'
            },
            https: {
                type: 'boolean',
                describe: 'Use HTTPS protocol.'
            },
            port: {
                alias: 'p',
                type: 'number',
                describe: `Port to use [${DEFAULT_PORT}]`
            },
            verbose: {
                type: 'boolean',
                default: false,
                describe: 'Displays verbose logging'
            },
            quiet: {
                hidden: true,
                type: 'boolean',
                default: false,
                describe: 'Displays no debug logs, or errors'
            },
            hostname: {
                type: 'string',
                describe: 'Address to use [0.0.0.0]'
            }
        },
        async argv => {
            const portfinder = require('portfinder');
            const Server = require('../server/Server');
            const {BACKENDJS_PATH} = require('../server/constants');
            // 加载config文件
            const config = (await loadConfig(argv.config)) || {};
            // 加载plugins
            let plugins = argv.plugins || [];
            if (config.plugins) {
                if (Array.isArray(config.plugins)) {
                    config.plugins.forEach(p => plugins.push(p));
                } else {
                    throw 'config.plugins is must be an Array';
                }
            }
            if (plugins && plugins.length) {
                plugins = require('./normalizePlugins')(plugins);
            }

            argv.logLevel = config.options.logLevel || 'info';
            if (argv.verbose) {
                logger.setLevel(Infinity);
            } else if (argv.quiet) {
                logger.level = 1;
                logger.setLevel(1);
            } else {
                logger.setLevel(argv.logLevel);
            }

            let port = argv.port || config.options.port || DEFAULT_PORT;
            const hostname = argv.hostname || config.options.hostname || '0.0.0.0';
            const https = argv.https || config.options.https || false;
            let proxyPort = argv.proxyPort || config.options.proxyPort || DEFAULT_PROXY_PORT;

            port = await portfinder.getPortPromise({
                port, // minimum port
                stopPort: port + 10 // maximum port
            });

            if (argv.proxy) {
                proxyPort = await portfinder.getPortPromise({
                    port: proxyPort, // minimum port
                    stopPort: proxyPort + 10 // maximum port
                });
            }
            // 添加proxy
            const configFileOptions = config.options || {};
            if (argv.proxy && !configFileOptions.proxy) {
                configFileOptions.proxy = {
                    port: proxyPort
                };
            } else if (argv.proxy && configFileOptions.proxy) {
                configFileOptions.proxy.port = proxyPort;
            }
            startServer();
            function startServer() {
                const options = {
                    ...configFileOptions,
                    https: https ? https : null,
                    plugins,
                    port,
                    hostname
                };

                const server = new Server(options);

                server.listen(port, hostname, err => {
                    if (err) {
                        throw err;
                    }
                    const canonicalHost = hostname === '0.0.0.0' ? inernalIPSync() : hostname;
                    const protocol = https ? 'https://' : 'http://';

                    logger.log(
                        [colorette.yellow('Starting up Devtools Server.'), colorette.yellow('\nWeb GUI on:')].join('')
                    );
                    const urls = ['127.0.0.1', canonicalHost].map(
                        address => `    ${protocol}${address}:${colorette.green(port.toString())}`
                    );
                    urls.forEach(url => logger.log(url));
                    logger.log('');
                    logger.log(`${colorette.yellow('Backend url:')}`);
                    urls.forEach(url => logger.log(url + colorette.green(BACKENDJS_PATH)));
                    logger.log('');
                    const s = server.getProxyServer();
                    if (s) {
                        logger.log(
                            `${colorette.yellow('Proxy server port:')} ${colorette.green(
                                server.getProxyServer().port.toString()
                            )}`
                        );
                        logger.log('');
                    }
                    logger.log('Hit CTRL-C to stop the server');

                    const home = server.getUrl();
                    argv.open && require('opener')(home);

                    process.on('exit', () => {
                        server.close();
                        process.exit(1);
                    });
                });
            }
        }
    )
    .command('clean-ca', 'Clean RootCA', {}, async argv => {
        const CA = require('../server/CA');
        const ca = new CA();
        ca.clean();
    })
    .command('open-ca-dir', 'Open CA folder', {}, async a => {
        const CA = require('../server/CA');
        const ca = new CA();
        require('opener')(ca.baseCAFolder);
    })
    .help('h')
    .alias('h', 'help')
    .alias('v', 'version').argv;

function checkNodeVersion(wanted, id) {
    if (!semver.satisfies(process.version, wanted)) {
        logger.log(
            // prettier-ignore
            // eslint-disable-next-line
            'You are using Node ' + process.version + ', but this version of ' + id +
             ' requires ' + colorette.yellow('Node ' + wanted) + '.\nPlease upgrade your Node version.'
        );
        process.exit(1);
    }
}

function upNotifier(version, name) {
    let notifier;
    if (version && name) {
        // 检测版本更新
        notifier = updateNotifier({
            pkg: {
                name,
                version
            },
            updateCheckInterval: 1000 * 60 * 60 * 24 * 7, // 1 week
            isGlobal: true,
            // updateCheckInterval: 0,
            // npm script 也显示
            shouldNotifyInNpmScript: true
        });
    }
    ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => {
            notifier && notifier.notify();
            process.exit(0);
        });
    });
}

if (process.platform === 'win32') {
    require('readline')
        .createInterface({
            input: process.stdin,
            output: process.stdout
        })
        .on('SIGINT', () => {
            process.emit('SIGINT');
        });
}
async function loadConfig(configPath) {
    configPath = path.resolve(configPath);

    let options;

    try {
        if (fs.existsSync(configPath)) {
            options = require(configPath);
        }
    } catch (error) {
        logger.error(`Failed to load '${configPath}' config`);
        logger.error(error);
        process.exit(2);
    }

    return {options: options ? options : {}, path: configPath};
}

process.on('SIGINT', () => {
    logger.log(colorette.red('San-Devtool server stopped.'));
    process.exit();
});

process.on('SIGTERM', () => {
    logger.log(colorette.red('San-Devtool server stopped.'));
    process.exit();
});
process.on('uncaughtException', error => {
    console.error(error);
    process.exit(1);
});

process.on('unhandledRejection', error => {
    console.error(error);
    process.exit(1);
});
