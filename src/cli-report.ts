import type { CityJsonAnalysisResult } from "./shared/types.js";

/**
 * Summary of a processing run used to decide the process exit code.
 *
 * @group CLI
 */
export interface RunReport {
  /** Number of files successfully analyzed and written. */
  analyzed: number;
  /** Number of files skipped (unreadable, non-CityJSON, or write failure). */
  skipped: number;
  /** Total number of discovered input files. */
  total: number;
  /** Exit code: non-zero when the run produced no usable output. */
  exitCode: number;
  /** Human-readable one-line summary. */
  message: string;
}

/**
 * Evaluates a processing result and derives a stable exit code.
 *
 * A run is only successful when at least one file was analyzed. An empty input
 * directory or a batch in which every file was skipped previously exited `0`
 * and looked like success; both now fail so that a misconfigured or malformed
 * run is visible to the caller (and to Airflow). When `strict` is set, any
 * skipped file fails the run.
 *
 * @group CLI
 * @param result Aggregated per-file result.
 * @param strict When true, treat any skipped file as a failure.
 * @returns Report including the exit code to apply.
 */
export function evaluateRunResult(
  result: CityJsonAnalysisResult,
  strict = false,
): RunReport {
  const total = result.files.length;
  const analyzed = result.files.filter((file) => file.status === "analyzed").length;
  const skipped = result.files.filter((file) => file.status === "skipped").length;

  let exitCode = 0;
  let message = `Processed ${analyzed} file(s), skipped ${skipped} of ${total}.`;

  if (total === 0) {
    exitCode = 1;
    message = "No input files found.";
  } else if (analyzed === 0) {
    exitCode = 1;
    message = `No files could be processed successfully (skipped ${skipped} of ${total}).`;
  } else if (strict && skipped > 0) {
    exitCode = 1;
    message = `Strict mode: ${skipped} of ${total} file(s) were skipped.`;
  }

  return { analyzed, skipped, total, exitCode, message };
}
