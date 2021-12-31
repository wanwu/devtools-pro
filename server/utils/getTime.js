const initTime = process.hrtime();
module.exports = function getTime() {
    let diff = process.hrtime(initTime);

    return diff[0] + diff[1] / 1e9;
};
