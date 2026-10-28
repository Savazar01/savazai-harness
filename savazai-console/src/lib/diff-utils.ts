export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

/**
 * Computes line-by-line diff between two text strings using Longest Common Subsequence (LCS).
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split("\n") : [];
  const newLines = newText ? newText.split("\n") : [];

  const m = oldLines.length;
  const n = newLines.length;

  // If text is very long (e.g. > 1000 lines), fall back to simple diff to avoid O(mn) allocation
  if (m * n > 1000000) {
    // Basic fast fallback
    const result: DiffLine[] = [];
    const max = Math.max(m, n);
    for (let i = 0; i < max; i++) {
      if (i < m && i < n) {
        if (oldLines[i] === newLines[i]) {
          result.push({ type: "unchanged", oldLineNumber: i + 1, newLineNumber: i + 1, content: oldLines[i] });
        } else {
          result.push({ type: "removed", oldLineNumber: i + 1, content: oldLines[i] });
          result.push({ type: "added", newLineNumber: i + 1, content: newLines[i] });
        }
      } else if (i < m) {
        result.push({ type: "removed", oldLineNumber: i + 1, content: oldLines[i] });
      } else {
        result.push({ type: "added", newLineNumber: i + 1, content: newLines[i] });
      }
    }
    return result;
  }

  // Standard LCS Dynamic Programming table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to construct diff
  const diff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: "unchanged",
        oldLineNumber: i,
        newLineNumber: j,
        content: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({
        type: "added",
        newLineNumber: j,
        content: newLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({
        type: "removed",
        oldLineNumber: i,
        content: oldLines[i - 1],
      });
      i--;
    }
  }

  return diff;
}
