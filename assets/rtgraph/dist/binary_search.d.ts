export declare function binarySearch<T>(arr: T[], notFoundValue: number, comparator: Comparator<T>): number;
type Comparator<T> = (element: T) => boolean;
export declare const greaterThan: (x: number) => (element: number) => boolean;
export declare const greaterThanOrEqual: (x: number) => (element: number) => boolean;
export declare const lessThan: (y: number) => (element: number) => boolean;
export declare const lessThanOrEqual: (y: number) => (element: number) => boolean;
export {};
