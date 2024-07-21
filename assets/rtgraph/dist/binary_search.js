export function binarySearch(arr, notFoundValue, comparator) {
    let left = 0;
    let right = arr.length - 1;
    let result = notFoundValue;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (comparator(arr[mid])) {
            result = mid;
            right = mid - 1; // Continue to search in the left half
        }
        else {
            left = mid + 1; // Continue to search in the right half
        }
    }
    return result;
}
// For number arrays
export const greaterThan = (x) => (element) => element > x;
export const greaterThanOrEqual = (x) => (element) => element >= x;
export const lessThan = (y) => (element) => element < y;
export const lessThanOrEqual = (y) => (element) => element <= y;
