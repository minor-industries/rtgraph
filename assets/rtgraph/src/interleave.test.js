// const interleave = require('./interleave');
import {Cache, interleave} from "./interleave.js";
import data from './data.json' assert {type: 'json'};
import {expect} from 'chai';

const append = [
    {"Pos": 0, "Timestamps": [1714431888528], "Values": [0.6055667611636614]},
    {"Pos": 1, "Timestamps": [1714431888528], "Values": [0.6541284511120098]},
    {"Pos": 2, "Timestamps": [1714431888528], "Values": [0.7533053691102697]},
    {"Pos": 3, "Timestamps": [1714431889528], "Values": [0.5]}
]

describe('interleave', function () {
    const maxGapMS = 1600;

    it('should interleave', function () {
        const rendered = interleave(data, maxGapMS);
        // console.log(JSON.stringify(rendered, null, 2));

        const cache = new Cache(4, maxGapMS);
        const rendered2 = cache.interleave(data);
        // console.log(JSON.stringify(rendered2, null, 2));

        expect(rendered2).to.deep.equal(rendered);

        const newRows = cache.append(append);
        console.log(JSON.stringify(newRows, null, 2));
    });
});

// describe('interleave2', function () {
//     it('should interleave', function () {
//         const cache = new Cache(4);
//         const rendered = cache.interleave(data);
//         console.log(JSON.stringify(rendered, null, 2));
//     });
// });


