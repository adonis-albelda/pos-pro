import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  cellText,
  PDF_ROW_CAP,
  sheetToCsv,
  type BackupSheet,
} from "@/lib/backup-export";

/** Zip of one CSV per sheet — the full dump when the owner wants open files. */
export async function sheetsToCsvZip(sheets: BackupSheet[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const sheet of sheets) {
    const note = sheet.truncated
      ? `# truncated: row cap reached — re-export with a narrower range if you need older rows\r\n`
      : "";
    zip.file(`${sheet.filename}.csv`, `${note}${sheetToCsv(sheet)}`);
  }
  return zip.generateAsync({ type: "uint8array" });
}

/** One workbook, one worksheet per dataset. */
export async function sheetsToXlsx(sheets: BackupSheet[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "POSPro One";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.label.slice(0, 31));
    worksheet.addRow(sheet.headers);
    worksheet.getRow(1).font = { bold: true };
    for (const row of sheet.rows) {
      worksheet.addRow(row.map((cell) => (cell === null || cell === undefined ? "" : cell)));
    }
    worksheet.columns.forEach((column) => {
      column.width = 16;
    });
    if (sheet.truncated) {
      worksheet.addRow([]);
      worksheet.addRow([
        "Note: this sheet hit the export row cap. Older rows are not in this file.",
      ]);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Printable summary PDF. Caps rows per sheet — a full database dump as PDF is
 * unusable, so Excel/CSV carry the complete data.
 */
export async function sheetsToPdf(sheets: BackupSheet[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 842; // landscape A4
  const pageHeight = 595;
  const margin = 36;
  const fontSize = 8;
  const titleSize = 12;
  const lineHeight = 11;

  for (const sheet of sheets) {
    const displayRows = sheet.rows.slice(0, PDF_ROW_CAP);
    const headers = sheet.headers;
    const colCount = Math.min(headers.length, 8);
    const usable = pageWidth - margin * 2;
    const colWidth = usable / colCount;

    let page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawHeader = () => {
      page.drawText(sheet.label, {
        x: margin,
        y,
        size: titleSize,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= titleSize + 6;
      const subtitle = `${sheet.rows.length} row${sheet.rows.length === 1 ? "" : "s"}${
        sheet.truncated ? " (capped at source)" : ""
      }${
        sheet.rows.length > PDF_ROW_CAP
          ? ` — showing first ${PDF_ROW_CAP}; use Excel or CSV for the rest`
          : ""
      }`;
      page.drawText(subtitle, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });
      y -= lineHeight + 4;

      for (let c = 0; c < colCount; c += 1) {
        page.drawText(clip(headers[c] ?? "", colWidth, bold, fontSize), {
          x: margin + c * colWidth,
          y,
          size: fontSize,
          font: bold,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
      y -= lineHeight;
      page.drawLine({
        start: { x: margin, y: y + 2 },
        end: { x: pageWidth - margin, y: y + 2 },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 4;
    };

    drawHeader();

    for (const row of displayRows) {
      if (y < margin + lineHeight) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        drawHeader();
      }
      for (let c = 0; c < colCount; c += 1) {
        page.drawText(clip(cellText(row[c]), colWidth, font, fontSize), {
          x: margin + c * colWidth,
          y,
          size: fontSize,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
      y -= lineHeight;
    }

    if (headers.length > colCount) {
      y -= lineHeight;
      if (y < margin + lineHeight) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(
        `Columns beyond the first ${colCount} omitted on PDF. Full columns are in Excel/CSV.`,
        {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0.4, 0.4, 0.4),
        },
      );
    }
  }

  return doc.save();
}

function clip(
  text: string,
  maxWidth: number,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
): string {
  const pad = 4;
  const limit = maxWidth - pad;
  if (font.widthOfTextAtSize(text, size) <= limit) return text;
  let end = text.length;
  while (end > 1) {
    end -= 1;
    const candidate = `${text.slice(0, end)}…`;
    if (font.widthOfTextAtSize(candidate, size) <= limit) return candidate;
  }
  return "…";
}
