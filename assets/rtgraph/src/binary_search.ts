export function binarySearch<T>(
    arr: T[],
    notFoundValue: number,
    comparator: Comparator<T>
): number {
    let left = 0;
    let right = arr.length - 1;
    let result = notFoundValue;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (comparator(arr[mid])) {
            result = mid;
            right = mid - 1;  // Continue to search in the left half
        } else {
            left = mid + 1;  // Continue to search in the right half
        }
    }

    return result;
}

type Comparator<T> = (element: T) => boolean;

// For number arrays
export const greaterThan = (x: number) => (element: number) => element > x;
export const greaterThanOrEqual = (x: number) => (element: number) => element >= x;
export const lessThan = (y: number) => (element: number) => element < y;
export const lessThanOrEqual = (y: number) => (element: number) => element <= y;
