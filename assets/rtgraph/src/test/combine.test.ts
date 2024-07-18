import {Cache} from '../combine.js';
import {expect} from "chai";

describe('cache', function () {
    const maxGapMS = 1600;

    const cache = new Cache(3, maxGapMS);

    cache.append([
        {Pos: 0, Timestamps: [10, 40, 70], Values: [1, 4, 7]},
        {Pos: 1, Timestamps: [20, 50, 80], Values: [2, 5, 8]},
        {Pos: 2, Timestamps: [30, 60, 90], Values: [3, 6, 9]},
    ]);

    const expected = [
        [new Date(10), 1, null, null],
        [new Date(20), null, 2, null],
        [new Date(30), null, null, 3],
        [new Date(40), 4, null, null],
        [new Date(50), null, 5, null],
        [new Date(60), null, null, 6],
        [new Date(70), 7, null, null],
        [new Date(80), null, 8, null],
        [new Date(90), null, null, 9]
    ];

    expect(cache.getData()).to.deep.equal(expected);
});
