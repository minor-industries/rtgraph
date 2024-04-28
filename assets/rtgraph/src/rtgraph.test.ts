import {combineData, row} from './rtgraph';

const now = 1714338683000;
const s = 1000;

function getExisting(): row[] {
    return [
        [new Date(now), 1.0, 2.0, 3.0],
        [new Date(now + s), 1.1, null, null],
        [new Date(now + 2 * s), 1.2, null, null],
        [new Date(now + 3 * s), 1.3, null, null],
    ]
}

test('simple append', () => {
    expect(false).toBe(true);
})

test('simple out-of-order', () => {
    const existing = getExisting()
    const result = combineData(existing, [
        [new Date(now + 2 * s + 500), 1.25, 2.05, null],
    ]);

    expect(result).toEqual([
        [new Date(now), 1.0, 2.0, 3.0],
        [new Date(now + s), 1.1, null, null],
        [new Date(now + 2 * s), 1.2, null, null],
        [new Date(now + 2 * s + 500), 1.25, 2.05, null],
        [new Date(now + 3 * s), 1.3, null, null],
    ]);
})

