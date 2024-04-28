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

test('empty append', () => {
    const result = combineData(getExisting(), [
        [new Date(now + 4 * s), 1.4, null, null],
    ]);
    expect(result).toEqual([
        [new Date(now), 1.0, 2.0, 3.0],
        [new Date(now + s), 1.1, null, null],
        [new Date(now + 2 * s), 1.2, null, null],
        [new Date(now + 3 * s), 1.3, null, null],
        [new Date(now + 4 * s), 1.4, null, null],
    ]);
})

test('simple append', () => {
    const result = combineData(getExisting(), []);
    expect(result).toEqual(getExisting());
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

test('multi out-of-order', () => {
    const existing = getExisting()
    const result = combineData(existing, [
        [new Date(now + s + 500), 1.15, null, null],
        [new Date(now + 2 * s + 500), 1.25, 2.05, null],
    ]);

    expect(result).toEqual([
        [new Date(now), 1.0, 2.0, 3.0],
        [new Date(now + s), 1.1, null, null],
        [new Date(now + s + 500), 1.15, null, null],
        [new Date(now + 2 * s), 1.2, null, null],
        [new Date(now + 2 * s + 500), 1.25, 2.05, null],
        [new Date(now + 3 * s), 1.3, null, null],
    ]);
})

test('at same timestamp', () => {
    const existing = getExisting()
    const result = combineData(existing, [
        [new Date(now + 3 * s), null, 2.1, 3.1],
    ]);

    expect(result).toEqual([
        [new Date(now), 1.0, 2.0, 3.0],
        [new Date(now + s), 1.1, null, null],
        [new Date(now + 2 * s), 1.2, null, null],
        [new Date(now + 3 * s), 1.3, 2.1, 3.1],
    ]);
})

test('at same timestamp, two rows', () => {
    const existing = getExisting()
    const result = combineData(existing, [
        [new Date(now + 3 * s), null, 2.1, null],
        [new Date(now + 3 * s), null, null, 3.1],
    ]);

    expect(result).toEqual([
        [new Date(now), 1.0, 2.0, 3.0],
        [new Date(now + s), 1.1, null, null],
        [new Date(now + 2 * s), 1.2, null, null],
        [new Date(now + 3 * s), 1.3, 2.1, 3.1],
    ]);
})

