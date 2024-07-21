export function sortedArrayMerge(arr1x, arr1y, arr2x, arr2y) {
    let m = arr1x.length;
    let n = arr2x.length;
    arr1x.length = m + n;
    let i = m - 1; // Last element of the original arr1x
    let j = n - 1; // Last element of arr2x
    let k = m + n - 1; // Last position of the expanded arr1x
    // Merge arrays from back to front
    while (i >= 0 && j >= 0) {
        if (arr1x[i] > arr2x[j]) {
            arr1x[k] = arr1x[i];
            arr1y[k] = arr1y[i];
            i--;
        }
        else {
            arr1x[k] = arr2x[j];
            arr1y[k] = arr2y[j];
            j--;
        }
        k--;
    }
    // Copy remaining elements of arr2x (if any)
    while (j >= 0) {
        arr1x[k] = arr2x[j];
        arr1y[k] = arr2y[j];
        j--;
        k--;
    }
    // remaining elements of arr1x are already in place
    return arr1x;
}
