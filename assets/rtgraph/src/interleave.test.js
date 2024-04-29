// const interleave = require('./interleave');
import {interleave} from "./interleave.js";
import data from './data.json' assert {type: 'json'};

describe('interleave', function () {
    it('should interleave', function () {
        interleave(data);
    });
});


