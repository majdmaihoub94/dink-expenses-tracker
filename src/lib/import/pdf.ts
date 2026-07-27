import "server-only";

/**
 * Server-side PDF text extraction.
 *
 * Runs on our own Railway container — no third-party service, no AI provider,
 * nothing leaves the infrastructure DINX already uses. The buffer is handed in
 * from the request and is never written to disk.
 */

/** Bounds the CPU one upload can consume. A year of statements is ~24 pages. */
const MAX_PAGES = 60;

type TextItem = { str: string; transform: number[] };

/**
 * Extracts visual lines of text, in reading order.
 *
 * PDFs have no concept of a line — they position glyph runs. Items are grouped
 * by their y coordinate, then sorted by x, which reconstructs the rows a human
 * sees on a statement.
 */
export async function extractPdfLines(data: Uint8Array): Promise<string[]> {
  // Imported lazily so the PDF engine is only loaded when someone imports one.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Hardening: no remote font or resource fetching. pdf.js v6 no longer uses
  // eval at all, so there is no isEvalSupported flag to set any more.
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableFontFace: true,
    // Encrypted statements are common; try an empty password rather than fail.
    password: "",
  });

  const doc = await loadingTask.promise;

  const lines: string[] = [];
  const pageCount = Math.min(doc.numPages, MAX_PAGES);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    // Bucket by rounded y — same visual row, whatever order the glyphs came in.
    const rows = new Map<number, { x: number; str: string }[]>();

    for (const raw of content.items as TextItem[]) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const x = raw.transform[4];
      const y = Math.round(raw.transform[5]);

      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: raw.str });
    }

    // Descending y: PDF origin is bottom-left, so higher y is further up.
    const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0]);

    for (const [, items] of ordered) {
      const line = items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (line) lines.push(line);
    }

    page.cleanup();
  }

  // Releases the worker and drops the document buffer from memory.
  await loadingTask.destroy();
  return lines;
}
