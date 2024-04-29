export type row = [Date, ...(number | null)[]];

const t0 = new Date().getTime() - 10000

function printRows(name: string, rows: row[]) {
    console.log(name);

    rows.forEach((row, idx) => {
        console.log("  ", idx, row[0].getTime() - t0, ...row.slice(1))
    })
}

function check(condition: boolean, desc: string) {
    if (!condition) {
        const error = new Error(desc);
        alert(error);
        throw error;
    }
}

function isSorted(rows: row[]): boolean {
    if (rows.length < 2) {
        return true;
    }

    for (let i = 1; i < rows.length; i++) {
        const r0 = rows[i - 1];
        const r1 = rows[i];

        if (r0[0].getTime() >= r1[0].getTime()) {
            return false;
        }
    }

    return true;
}

function allDefined(rows: row[]): boolean {
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r === undefined) {
            return false;
        }
    }

    return true;
}


export function combineData(existing: row[], extra: row[]): row[] {
    // TODO: should handle the simple case where extra after existing with a simple append

    if (extra.length === 0) {
        return existing;
    }

    extra.sort((a, b) => a[0].getTime() - b[0].getTime());

    check(allDefined(existing), "before: existing rows all defined");
    check(isSorted(existing), "before: existing is sorted")

    const firstExtraDate = extra[0][0];
    // console.log("date", firstExtraDate)
    const mergeIndex = findMergeIndex(existing, firstExtraDate);
    // console.log("mergeIndex", mergeIndex)

    // printRows("existing", existing);

    // console.log("existing.length", existing.length);

    const slicedExisting = existing.slice(mergeIndex);
    // printRows("slicedExisting", slicedExisting)
    // printRows("extra", extra)

    const merged = mergeArrays(slicedExisting, extra);
    // printRows("merged", merged)

    const overwriteCount = existing.length - mergeIndex;
    // console.log("overwriteCount", overwriteCount)

    const appendCount = merged.length - overwriteCount;
    check(appendCount >= 0, "appendCount >= 0")
    // console.log("appendCount", appendCount)

    let mergedPos = 0;
    for (let i = 0; i < overwriteCount; i++) {
        existing[mergeIndex + i] = merged[mergedPos++];
    }

    for (let i = 0; i < appendCount; i++) {
        existing.push(merged[mergedPos++])
    }

    check(allDefined(existing), "after: existing rows all defined");
    check(isSorted(existing), "after: existing is sorted");

    existing.forEach(row => {
        if (row === undefined) {
            throw new Error("here");
        }
    })

    return existing;
}

function findMergeIndex(existing: row[], firstExtraDate: Date) {
    let insertionIndex = existing.length - 1;
    while (insertionIndex >= 0 && existing[insertionIndex][0] >= firstExtraDate) {
        insertionIndex--;
    }
    insertionIndex++;
    return insertionIndex;
}

function mergeArrays(arr1: row[], arr2: row[]): row[] {
    const combined = arr1.concat(arr2);
    combined.sort((a, b) => a[0].getTime() - b[0].getTime());

    const result: row[] = [];
    let acc: row[] = [];

    for (let i = 0; i < combined.length; i++) {
        const r = combined[i];
        if (acc.length === 0 || r[0].getTime() === acc[0][0].getTime()) {
            acc.push(r); // Accumulate rows with the same timestamp
        } else {
            result.push(mergeRowsAtSameTimestamp(acc));
            acc = [r]; // Start a new accumulation
        }
    }

    if (acc.length > 0) {
        result.push(mergeRowsAtSameTimestamp(acc));
    }

    return result;
}

function mergeRowsAtSameTimestamp(rows: row[]): row {
    if (rows.length === 0) {
        throw new Error("No rows to merge");
    }

    let mergedRow: row = rows[0];
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        for (let colIndex = 1; colIndex < rows[rowIndex].length; colIndex++) {
            if (rows[rowIndex][colIndex] !== null) {
                mergedRow[colIndex] = rows[rowIndex][colIndex];
            }
        }
    }

    return mergedRow;
}
