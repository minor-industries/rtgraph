import {Cache, Series} from '../combine.js';
import {expect} from "chai";
import _ from "lodash";

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
    const maxGapMS = 25;
    const cache = new Cache(3, maxGapMS);

    it('merges', function () {
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

    });

    it('appends with gaps', function () {
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

    it('appends with overlap', function () {
        cache.append([
            {Pos: 0, Timestamps: [95, 105, 180], Values: [16, 17, 18]},
            {Pos: 1, Timestamps: [95, 105, 180], Values: [19, 20, 21]},
            {Pos: 2, Timestamps: [95, 105, 180], Values: [22, 23, 24]},
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
            [new Date(95), 16, 19, 22],
            [new Date(100), 11, null, 14],
            [new Date(105), 17, 20, 23],
            [new Date(110), null, null, 15],
            [new Date(139), null, NaN, null],
            [new Date(140), null, 13, null],
            [new Date(179), NaN, NaN, NaN],
            [new Date(180), 18, 21, 24]
        ]);
    });
});

describe('overlaps and edge cases', function () {
    const maxGapMS = 25;

    it('one', function () {
        const cache = new Cache(1, maxGapMS);

        cache.append([
            {Pos: 0, Timestamps: [10, 40, 70], Values: [1, 4, 7]},
        ]);

        cache.append([
            {Pos: 0, Timestamps: [20, 50, 80], Values: [2, 5, 8]},
        ]);

        expect(cache.getData()).to.deep.equal([
            [new Date(10), 1],
            [new Date(20), 2],
            [new Date(40), 4],
            [new Date(50), 5],
            [new Date(70), 7],
            [new Date(80), 8],
        ]);
    });

    it('two', function () {
        const cache = new Cache(2, maxGapMS);

        cache.append([
            {Pos: 0, Timestamps: [10, 40, 70], Values: [1, 4, 7]},
            {Pos: 1, Timestamps: [20, 50, 80], Values: [2, 5, 8]},
        ]);

        expect(cache.getData()).to.deep.equal([
            [new Date(10), 1, null],
            [new Date(20), null, 2],
            [new Date(39), NaN, null],
            [new Date(40), 4, null],
            [new Date(49), null, NaN],
            [new Date(50), null, 5],
            [new Date(69), NaN, null],
            [new Date(70), 7, null],
            [new Date(79), null, NaN],
            [new Date(80), null, 8]
        ])

        cache.append([
            {Pos: 0, Timestamps: [20, 50, 80], Values: [22, 55, 88]},
            {Pos: 1, Timestamps: [30, 70], Values: [33, 77]},
        ]);

        expect(cache.getData()).to.deep.equal([
            [new Date(10), 1, null],
            [new Date(20), 22, 2],
            [new Date(30), null, 33],
            [new Date(40), 4, null],
            [new Date(50), 55, 5],
            [new Date(70), 7, 77],
            [new Date(80), 88, 8]
        ]);
    });
});

function randInt(max: number) {
    return Math.floor(Math.random() * max);
}

function buildData(allSamples: [number, number, number][]) {
    const groupedData = Object.values(_.groupBy(allSamples, (tuple) => tuple[0]));
    groupedData.sort((a, b) => a[0][0] - b[0][0]);

    return groupedData.map(row => {
        const result = Array.prototype.concat(
            [new Date(row[0][0])],
            Array.from({length: 5}, () => null)
        );
        row.forEach(col => {
            result[col[2] + 1] = col[1];
        })
        return result;
    });
}

describe('soak test', function () {
    const maxGapMS = 2500;
    const numSeries = 5;
    const cache = new Cache(numSeries, maxGapMS);
    const allSamples: [number, number, number][] = [];
    let t = 1000;

    it("soaks", function () {
        this.timeout(60 * 1000);
        let curValue = 1;

        const genValues = (n_: number, t_: number): [number[], number[]] => {
            const n = 1 + randInt(n_);

            let t = t_ - 50 + randInt(100)

            const x = [];
            const y = [];

            for (let i = 0; i < n; i++) {
                x.push(t);
                t += 1 + randInt(10);
                y.push(curValue++);
            }

            return [x, y];
        }

        const append = (t: number) => {
            const newData: Series[] = [];
            for (let i = 0; i < numSeries; i++) {
                const [x, y] = genValues(10, t);
                newData.push({
                    Pos: i,
                    Timestamps: x,
                    Values: y,
                });
            }

            cache.append(newData);

            newData.forEach(s => {
                for (let i = 0; i < s.Timestamps.length; i++) {
                    allSamples.push([s.Timestamps[i], s.Values[i], s.Pos]);
                }
            });
        };

        for (let i = 0; i < 1000; i++) {
            i % 100 === 0 && console.log(i);
            t += 10; // TODO: set to introduce gaps
            append(t);

            const expected = buildData(allSamples);
            expect(cache.getData()).to.deep.equal(expected);
        }
    });
});

