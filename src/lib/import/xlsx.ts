import "server-only";

import { inflateRawSync } from "node:zlib";

/**
 * A minimal .xlsx reader.
 *
 * XLSX is a ZIP of XML parts, and Node ships the inflate we need — so this
 * avoids taking on a spreadsheet dependency for the one job of pulling rows
 * out of a bank export. Deliberately narrow: it reads the first worksheet's
 * cell values and nothing else. No formulas, no macros, no external links.
 */

type ZipEntry = { name: string; data: Buffer };

/** Reads the ZIP central directory, then inflates only the parts we need. */
function readZip(bytes: Uint8Array, wanted: (name: string) => boolean): ZipEntry[] {
  const buf = Buffer.from(bytes);

  // Locate the end-of-central-directory record, scanning back from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Not a zip archive");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;

    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);

    offset += 46 + nameLength + extraLength + commentLength;

    if (!wanted(name)) continue;

    // The local header repeats the name/extra lengths, which may differ.
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buf.subarray(start, start + compressedSize);

    entries.push({ name, data: method === 0 ? raw : inflateRawSync(raw) });
  }

  return entries;
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (match) => XML_ENTITIES[match] ?? match);
}

/** The shared string table, which text cells reference by index. */
function readSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const item of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    // An <si> may hold several <t> runs; concatenate them.
    const text = (item.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [])
      .map((t) => decodeXml(t.replace(/<[^>]+>/g, "")))
      .join("");
    strings.push(text);
  }
  return strings;
}

/** Converts an Excel serial date to `yyyy-MM-dd`. */
function serialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 200_000) return null;
  // Excel's epoch is 1899-12-30 to absorb its 1900 leap-year bug.
  const ms = Math.round((serial - 25569) * 86_400 * 1000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Column letters to a zero-based index: A→0, B→1, AA→26. */
function columnIndex(ref: string): number {
  const letters = ref.match(/^([A-Z]+)/)?.[1] ?? "A";
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * Returns the first worksheet as a grid of strings. Dates are converted from
 * Excel serials so they reach the date parser in a form it understands.
 */
export async function readXlsxRows(bytes: Uint8Array): Promise<string[][]> {
  const entries = readZip(
    bytes,
    (name) =>
      name === "xl/sharedStrings.xml" ||
      name === "xl/worksheets/sheet1.xml" ||
      name === "xl/styles.xml",
  );

  const sheet = entries.find((e) => e.name === "xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("No worksheet found");

  const shared = entries.find((e) => e.name === "xl/sharedStrings.xml");
  const strings = shared ? readSharedStrings(shared.data.toString("utf8")) : [];

  // Which style ids format as dates — how a numeric cell is known to be one.
  const styles = entries.find((e) => e.name === "xl/styles.xml")?.data.toString("utf8") ?? "";
  const dateStyles = new Set<number>();
  const cellXfs = styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  (cellXfs.match(/<xf\b[^>]*>/g) ?? []).forEach((xf, index) => {
    const numFmt = Number(xf.match(/numFmtId="(\d+)"/)?.[1] ?? 0);
    // 14-22 and 45-47 are the built-in date and time formats.
    if ((numFmt >= 14 && numFmt <= 22) || (numFmt >= 45 && numFmt <= 47)) dateStyles.add(index);
  });

  const xml = sheet.data.toString("utf8");
  const rows: string[][] = [];

  for (const rowXml of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];

    for (const cellXml of rowXml.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const ref = cellXml.match(/r="([A-Z]+\d+)"/)?.[1] ?? "A1";
      const type = cellXml.match(/t="([^"]+)"/)?.[1] ?? "n";
      const styleId = Number(cellXml.match(/s="(\d+)"/)?.[1] ?? -1);
      const rawValue = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";

      let value = "";
      if (type === "s") {
        value = strings[Number(rawValue)] ?? "";
      } else if (type === "inlineStr") {
        value = decodeXml((cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "").replace(/<[^>]+>/g, ""));
      } else if (rawValue) {
        value = dateStyles.has(styleId) ? (serialToDate(Number(rawValue)) ?? rawValue) : rawValue;
      }

      const index = columnIndex(ref);
      while (cells.length < index) cells.push("");
      cells[index] = decodeXml(value).trim();
    }

    if (cells.some((c) => c.length > 0)) rows.push(cells);
  }

  return rows;
}
