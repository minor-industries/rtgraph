export type Series = {
    Pos: number;
    Timestamps: number[];
    Values: number[];
};
export type DygraphRow = [Date, ...(number | null)[]];
export declare class Cache {
    private readonly maxGapMS;
    private readonly data;
    private readonly series;
    overlapCount: number;
    constructor(numSeries: number, maxGapMS: number);
    private newRow;
    private interleave;
    append(data: Series[]): void;
    getData(): DygraphRow[];
    private detectOverlap;
    private mergeSingleSeries;
    private mergeAndAddGaps;
}
