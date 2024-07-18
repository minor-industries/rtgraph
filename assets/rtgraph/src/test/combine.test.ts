import {Cache} from '../combine.js';
import {expect} from "chai";

describe('normal interleave', function () {
    it('merges', function () {
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
    })
});

describe('interleave with coincident points', function () {
    it('merges', function () {
        const maxGapMS = 1600;

        const cache = new Cache(3, maxGapMS);

        cache.append([
            {Pos: 0, Timestamps: [10, 40, 70], Values: [1, 4, 7]},
            {Pos: 1, Timestamps: [40, 50, 80], Values: [2, 5, 8]},
            {Pos: 2, Timestamps: [30, 40, 70], Values: [3, 6, 9]},
        ]);

        const expected = [
            [new Date(10), 1, null, null],
            [new Date(30), null, null, 3],
            [new Date(40), 4, 2, 6],
            [new Date(50), null, 5, null],
            [new Date(70), 7, null, 9],
            [new Date(80), null, 8, null],
        ];

        expect(cache.getData()).to.deep.equal(expected);
    });
});

describe('interleave with gaps', function () {
    it('merges', function () {
        const maxGapMS = 25;

        const cache = new Cache(3, maxGapMS);

        cache.append([
            {Pos: 0, Timestamps: [10, 40, 70], Values: [1, 4, 7]},
            {Pos: 1, Timestamps: [40, 50, 80], Values: [2, 5, 8]},
            {Pos: 2, Timestamps: [30, 40, 70], Values: [3, 6, 9]},
        ]);

        expect(cache.getData()).to.deep.equal([
            [new Date(10), 1, null, null],
            [new Date(30), null, null, 3],
            [new Date(39), NaN, null, null],
            [new Date(40), 4, 2, 6],
            [new Date(50), null, 5, null],
            [new Date(69), NaN, null, NaN],
            [new Date(70), 7, null, 9],
            [new Date(79), null, NaN, null],
            [new Date(80), null, 8, null],
        ]);

        cache.append([
            {Pos: 0, Timestamps: [90, 100], Values: [10, 11]},
            {Pos: 1, Timestamps: [90, 140], Values: [12, 13]},
            {Pos: 2, Timestamps: [100, 110], Values: [14, 15]},
        ])

        expect(cache.getData()).to.deep.equal([
            [new Date(10), 1, null, null],
            [new Date(30), null, null, 3],
            [new Date(39), NaN, null, null],
            [new Date(40), 4, 2, 6],
            [new Date(50), null, 5, null],
            [new Date(69), NaN, null, NaN],
            [new Date(70), 7, null, 9],
            [new Date(79), null, NaN, null],
            [new Date(80), null, 8, null],
            [new Date(90), 10, 12, null],
            [new Date(99), null, null, NaN],
            [new Date(100), 11, null, 14],
            [new Date(110), null, null, 15],
            [new Date(139), null, NaN, null],
            [new Date(140), null, 13, null]
        ]);
    });
});