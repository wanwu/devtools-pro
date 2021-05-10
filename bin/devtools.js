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
const os = require('os');
/* eslint-disable no-console */
const updateNotifier = require('update-notifier');
const semver = require('semver');
const chalk = require('chalk');
const logger = require('lighthouse-logger');

const {
    scriptName,
    engines: {node: requiredNodeVersion},
    name: pkgName,
    version: pkgVersion
} = require('../package.json');

const DEFAULT_PORT = 8899;

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
            config: {
                default: 'devtools.config',
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
                    throw `config.plugins is must be an Array`;
                }
            }
            if (plugins && plugins.length) {
                plugins = require('./normalizePlugins')(plugins);
            }

            argv.logLevel = config.options.logLevel || 'info';
            if (argv.verbose) {
                argv.logLevel = 'verbose';
            } else if (argv.quiet) {
                argv.logLevel = 'silent';
            }
            logger.setLevel(argv.logLevel);

            let port = argv.port || config.options.port || DEFAULT_PORT;
            const hostname = argv.hostname || config.options.hostname || '0.0.0.0';
            const https = argv.https || config.options.https || false;

            if (!port) {
                portfinder.basePort = DEFAULT_PORT;
                portfinder.getPort((err, p) => {
                    if (err) {
                        throw err;
                    }
                    port = p;
                    startServer();
                });
            } else {
                startServer();
            }
            function startServer() {
                const ifaces = os.networkInterfaces();
                const options = {
                    ...config.options,
                    https: https ? {} : null,
                    plugins,
                    port,
                    hostname
                };
                const server = new Server(options);

                server.listen(port, hostname, err => {
                    if (err) {
                        throw err;
                    }
                    const canonicalHost = hostname === '0.0.0.0' ? '127.0.0.1' : hostname;
                    const protocol = https ? 'https://' : 'http://';

                    console.log(
                        [chalk.yellow('Starting up Devtools Server.'), chalk.yellow('\nAvailable on:')].join('')
                    );
                    const urls = [];
                    if (argv.address && hostname !== '0.0.0.0') {
                        const url = '    ' + protocol + canonicalHost + ':' + chalk.green(port.toString());
                        urls.push(url);
                        console.log(url);
                    } else {
                        Object.keys(ifaces).forEach(dev => {
                            /* eslint-disable max-nested-callbacks */
                            ifaces[dev].forEach(details => {
                                if (details.family === 'IPv4') {
                                    const url = '  ' + protocol + details.address + ':' + chalk.green(port.toString());
                                    urls.push(url);
                                    console.log(url);
                                }
                            });
                        });
                    }
                    console.log('');
                    // TODO 文案
                    console.log(`${chalk.yellow('Backend url:')}`);
                    urls.forEach(u => {
                        console.log(u + chalk.green(BACKENDJS_PATH));
                    });
                    console.log('');
                    console.log('Hit CTRL-C to stop the server');

                    const home = server.getUrl();
                    argv.open && require('opener')(home);
                });
            }
        }
    )
    .help('h')
    .alias('h', 'help')
    .alias('v', 'version').argv;

function checkNodeVersion(wanted, id) {
    if (!semver.satisfies(process.version, wanted)) {
        console.log(
            // prettier-ignore
            // eslint-disable-next-line
            'You are using Node ' + process.version + ', but this version of ' + id +
             ' requires ' + chalk.yellow('Node ' + wanted) + '.\nPlease upgrade your Node version.'
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
    console.log(chalk.red('San-Devtool server stopped.'));
    process.exit();
});

process.on('SIGTERM', () => {
    console.log(chalk.red('San-Devtool server stopped.'));
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
