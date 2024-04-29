// const interleave = require('./interleave');
import {Cache, interleave} from "./interleave.js";
import data from './data.json' assert {type: 'json'};
import {expect} from 'chai';

describe('interleave', function () {
    const maxGapMS = 1600;

    it('should interleave', function () {
        const rendered = interleave(data, maxGapMS);
        console.log(JSON.stringify(rendered, null, 2));

        const cache = new Cache(4, maxGapMS);
        const rendered2 = cache.interleave(data);
        console.log(JSON.stringify(rendered2, null, 2));

        expect(rendered2).to.deep.equal(rendered);
    });
});

// describe('interleave2', function () {
//     it('should interleave', function () {
//         const cache = new Cache(4);
//         const rendered = cache.interleave(data);
//         console.log(JSON.stringify(rendered, null, 2));
//     });
// });


