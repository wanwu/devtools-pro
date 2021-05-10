const fs = require('fs');
const path = require('path');
module.exports = plugins => {
    if (Array.isArray(plugins)) {
        return plugins
            .map(pluginName => {
                const {devtools, name, version} = require(path.join(pluginName, 'package.json'));
                return {devtools, name, version, pluginName};
            })
            .map(({devtools, name, version, pluginName}) => {
                /**
             * // middleware
                "frontend": {
                    "name": "jsna_monitor",
                    "type": "", // remote/autostart
                    "dir": "frontend"
                },
                // backend字段，该文件内容会被merge到backend.js中
                "backend": "index.js",
                // middleware
                "middleware": "middleware.js"
             */
                let {frontend, backend, middleware} = devtools;
                if (!frontend.dir) {
                    throw Error(`DevTools Plugin [${pluginName}] frontend.dir is undefined!`);
                }
                if (!frontend.name) {
                    throw Error(`DevTools Plugin [${pluginName}] frontend.name is undefined!`);
                }
                if (frontend.type && !['remote', 'autostart'].includes(frontend.type)) {
                    throw Error(`DevTools Plugin [${pluginName}] frontend.type is oneof autostart/remote!`);
                }
                const frontendDir = require.resolve(path.join(pluginName, frontend.dir));
                if (!fs.existsSync(frontendDir)) {
                    throw Error(`DevTools Plugin [${pluginName}] frontend.dir is not exists!`);
                }

                backend = backend ? require.resolve(path.join(pluginName, backend)) : undefined;
                if (backend && !fs.existsSync(backend)) {
                    throw Error(`DevTools Plugin [${pluginName}] backend file is not exists!`);
                }
                if (middleware) {
                    try {
                        middleware = require(path.join(pluginName, middleware));
                    } catch (e) {
                        console.error(`DevTools Plugin [${pluginName}] middleware is error!`);
                        throw e;
                    }
                }
                return {
                    frontend: {
                        module: {name: frontend.name, type: frontend.type ? frontend.type : undefined},
                        dir: frontendDir
                    },
                    backend,
                    middleware
                };
            });
    }
};
