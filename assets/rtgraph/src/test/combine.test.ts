// @ts-ignore: Ignore missing module error for JSON import
import data from '../../src/test/data.json' assert { type: 'json' };
// @ts-ignore: Ignore missing module error for serialize-javascript
import * as serializer from 'serialize-javascript';
// @ts-ignore: Ignore missing module error for expected.js
import { expected } from '../../src/test/expected.js';
import { Cache } from '../combine.js';
import { expect } from 'chai';

const append = [
    { "Pos": 0, "Timestamps": [1714431888528], "Values": [0.6055667611636614] },
    { "Pos": 1, "Timestamps": [1714431888528], "Values": [0.6541284511120098] },
    { "Pos": 2, "Timestamps": [1714431888528], "Values": [0.7533053691102697] },
    { "Pos": 3, "Timestamps": [1714431889528], "Values": [0.5] }
];

describe('cache', function () {
    const maxGapMS = 1600;

    it('should interleave', function () {
        const cache = new Cache(4, maxGapMS);
        // @ts-ignore: Ignore private method access error
        cache.interleave(data);
        // @ts-ignore: Ignore private property access error
        console.log(serializer.default(cache.data));
        // @ts-ignore: Ignore private property access error
        expect(cache.data).to.deep.equal(expected);

        cache.append(append);
        // @ts-ignore: Ignore private property access error
        const newRows: any = cache.data.slice(-5);
        console.log(JSON.stringify(newRows, null, 2));
    });
});
