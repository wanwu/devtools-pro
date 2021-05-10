const fs = require('fs');
const path = require('path');
module.exports = plugins => {
    if (Array.isArray(plugins)) {
        return plugins
            .map(pluginName => {
                let rp = path.join(pluginName, 'package.json');
                let pluginPath;
                let devtools;
                let name;
                try {
                    pluginPath = require.resolve(pluginName);
                    const pkg = require(rp);
                    devtools = pkg.devtools;
                    name = pkg.name;
                } catch (e) {
                    // work路径查找
                    pluginPath = path.join(process.cwd(), pluginName);
                    rp = path.join(pluginPath, 'package.json');
                    try {
                        const pkg = require(rp);
                        devtools = pkg.devtools;
                        name = pkg.name;
                    } catch (e) {
                        throw Error(`Cannot find plugin '${pluginName}'`);
                    }
                }

                return {devtools, name, pluginPath};
            })
            .map(({devtools, name, pluginPath}) => {
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
                    throw Error(`DevTools Plugin '${name}' frontend.dir is undefined!`);
                }
                if (!frontend.name) {
                    throw Error(`DevTools Plugin '${name}' frontend.name is undefined!`);
                }
                if (frontend.type && !['remote', 'autostart'].includes(frontend.type)) {
                    throw Error(`DevTools Plugin '${name}' frontend.type is oneof autostart/remote!`);
                }
                const frontendDir = path.join(pluginPath, frontend.dir);
                if (!fs.existsSync(frontendDir)) {
                    throw Error(`DevTools Plugin '${name}' frontend.dir is not exists!`);
                }

                backend = backend ? path.join(pluginPath, backend) : undefined;
                if (backend && !fs.existsSync(backend)) {
                    throw Error(`DevTools Plugin '${name}' backend file is not exists!`);
                }
                if (middleware) {
                    try {
                        middleware = require(path.join(pluginPath, middleware));
                    } catch (e) {
                        console.error(`DevTools Plugin '${name}' middleware is error!`);
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
