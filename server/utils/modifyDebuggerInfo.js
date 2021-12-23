const fs = require('fs');
const path = require('path');
let configPath = path.join(__dirname, 'config.json');
let readDebuggerConfig = () => {
    try {
        let data = fs.readFileSync(configPath).toString() || '{}';
        return JSON.parse(data);
    } catch (error) {
        console.log('----readDebuggerConfigerror', error);
        throw error;
    }
};

let writeDebuggerConfig = data => {
    try {
        fs.writeFileSync(configPath, JSON.stringify(data));
    } catch (error) {
        console.log('----writeDebuggerConfigrror', error);
        throw error;
    }
};
exports.readDebuggerConfig = readDebuggerConfig;
exports.writeDebuggerConfig = writeDebuggerConfig;
