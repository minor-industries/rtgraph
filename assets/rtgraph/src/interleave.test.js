// const interleave = require('./interleave');
import {interleave} from "./interleave.js";
import data from './data.json' assert {type: 'json'};

describe('Calculator', function () {
    it('should return 3 when adding 1 and 2', function () {
        interleave(data);
    });
});


