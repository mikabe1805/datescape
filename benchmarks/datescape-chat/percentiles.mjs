/**
 * Calculate percentile from sorted array
 * @param {number[]} sortedArray - Array of numbers sorted in ascending order
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number} The percentile value
 */
export function calculatePercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) return 0;
  
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  if (lower === upper) {
    return sortedArray[lower];
  }
  
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Calculate multiple percentiles from an array
 * @param {number[]} values - Array of numbers
 * @param {number[]} percentiles - Array of percentiles to calculate (e.g., [50, 95, 99])
 * @returns {Object} Object with percentile values
 */
export function calculatePercentiles(values, percentiles = [50, 95, 99]) {
  if (values.length === 0) {
    return percentiles.reduce((acc, p) => ({ ...acc, [`p${p}`]: 0 }), {});
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const results = {};
  
  for (const p of percentiles) {
    results[`p${p}`] = calculatePercentile(sorted, p);
  }
  
  return results;
}

/**
 * Calculate basic statistics
 * @param {number[]} values - Array of numbers
 * @returns {Object} Object with min, max, mean, median, count
 */
export function calculateStats(values) {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, count: 0 };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, val) => acc + val, 0);
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / values.length,
    median: calculatePercentile(sorted, 50),
    count: values.length,
  };
}

/**
 * Format milliseconds to a readable string
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted string
 */
export function formatMs(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format a number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
  return num.toLocaleString('en-US');
}

