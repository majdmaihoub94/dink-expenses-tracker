/**
 * A small RFC 4180-ish CSV reader.
 *
 * Written by hand rather than pulled from npm: statement parsing happens in
 * the browser on the most sensitive data DINX touches, and a dependency-free
 * parser is one less package that could ever be compromised.
 */

/** Picks the delimiter by whichever yields the most consistent column count. */
export function detectDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"];
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  if (lines.length === 0) return ",";

  let best = ",";
  let bestScore = -1;

  for (const delimiter of candidates) {
    const counts = lines.map((line) => splitLine(line, delimiter).length);
    const max = Math.max(...counts);
    if (max < 2) continue;

    // Reward many columns, punish rows that disagree about how many there are.
    const consistent = counts.filter((c) => c === max).length / counts.length;
    const score = max * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted cell is a literal quote.
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

/**
 * Parses a whole CSV document into rows of trimmed cells.
 * Handles quoted fields containing newlines, and strips a UTF-8 BOM.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(clean);

  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  // Whatever is left after the final newline.
  if (cell || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.length > 0));
}
