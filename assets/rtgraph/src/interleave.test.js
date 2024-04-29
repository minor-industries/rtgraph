const interleave = require('./interleave');
const data = require("./data.json");

test('interleave', () => {
    interleave(data);
});