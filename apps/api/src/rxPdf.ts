// =============================================================================
//  SwiftRx API — A signed prescription as a PDF
// =============================================================================
//  The server draws the PDF itself (pdf-lib), so it is the same file on every
//  device, unlike the browser's print. It follows the print template
//  (apps/shared/src/print.ts) and the Rx design frozen on the prescription
//  when it was signed: letterhead, accent color, watermark, page size,
//  allergy banner, refills, "valid until" and the signature line.
//
//  A demo server stamps every page DEMO, as the demo print does, and leaves
//  out "valid until".
//
//  The standard PDF fonts only cover Latin text (WinAnsi), so anything else
//  is drawn as "?". Bangla needs an embedded font; that comes with the Bangla
//  patient instructions (PLAN.md Phase 4).
// =============================================================================

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

import { medicineLabel } from '@swiftrx/shared/medicine';
import { ageSexLabel } from '@swiftrx/shared/patient';
import { rxPageSizeMm, RX_PAGE_MARGIN_MM } from '@swiftrx/shared/print';
import { DEFAULT_RX_DESIGN, type RxDesign, type SignedRx } from '@swiftrx/shared/types';

const PT_PER_MM = 72 / 25.4;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.39, 0.45, 0.55); // #64748b
const SOFT = rgb(0.28, 0.33, 0.41); // #475569
const LINE = rgb(0.8, 0.84, 0.88); // #cbd5e1
const PANEL = rgb(0.97, 0.98, 0.99); // #f8fafc
const RED = rgb(0.73, 0.11, 0.11); // #b91c1c
const STAMP = rgb(0.86, 0.15, 0.15); // #dc2626

/** Bangladesh Standard Time, for the dates printed on the Rx. */
const DHAKA = 'Asia/Dhaka';

export async function renderRxPdf(
  rx: SignedRx,
  design: RxDesign = DEFAULT_RX_DESIGN,
  opts: { demo: boolean },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Prescription ${rx.id}`);
  doc.setAuthor(rx.doctorName);
  doc.setSubject(`${rx.patient.name}: ${rx.diagnosis.code} ${rx.diagnosis.name}`);
  doc.setProducer('SwiftRx');
  doc.setCreator('SwiftRx');
  // The time it was signed, so the same Rx always gives the same file.
  doc.setCreationDate(new Date(rx.signedAt));
  doc.setModificationDate(new Date(rx.signedAt));

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
  };
  const w = new Writer(doc, design, fonts, opts.demo ? 'DEMO' : null, rx);
  const accent = w.accent;
  const signedAt = new Date(rx.signedAt);

  // --- Letterhead --------------------------------------------------------------
  const top = w.y;
  let left = w.x0;
  if (design.showRxBadge) {
    w.page.drawRectangle({ x: left, y: top - 26, width: 26, height: 26, color: accent });
    w.text('Rx', left + 5, top - 18, { font: fonts.bold, size: 12, color: rgb(1, 1, 1) });
    left += 34;
  }
  const rightWidth = w.width * 0.42;
  const titleWidth = w.x1 - rightWidth - left - 8;
  let y = top - 16;
  for (const line of w.wrap(design.headerTitle || 'Prescription', fonts.bold, 17, titleWidth)) {
    w.text(line, left, y, { font: fonts.bold, size: 17, color: accent });
    y -= 19;
  }
  if (design.headerSubtitle) {
    for (const line of w.wrap(design.headerSubtitle, fonts.regular, 9, titleWidth)) {
      w.text(line, left, y + 4, { size: 9, color: SOFT });
      y -= 11;
    }
  }
  w.text(`${rx.doctorName} · ${rx.doctorLicense}`, left, y + 2, { size: 9, color: SOFT });
  y -= 10;

  let ry = top - 8;
  if (design.headerRight) {
    for (const part of design.headerRight.split('\n')) {
      for (const line of w.wrap(part, fonts.regular, 8, rightWidth)) {
        w.textRight(line, w.x1, ry, { size: 8, color: MUTED });
        ry -= 10;
      }
    }
  } else {
    w.textRight('PRESCRIPTION', w.x1, ry, { size: 8, color: MUTED });
    w.textRight(`#${rx.id}`, w.x1, ry - 11, { font: fonts.monoBold, size: 9, color: accent });
    w.textRight(dateTime(signedAt), w.x1, ry - 22, { font: fonts.mono, size: 9, color: SOFT });
    ry -= 33;
  }
  w.y = Math.min(y, ry) - 4;
  if (design.showAccentBand) {
    w.page.drawRectangle({ x: w.x0, y: w.y - 3, width: w.width, height: 3, color: accent });
  } else {
    w.rule(w.y, accent, 1.5);
  }
  w.y -= 16;

  // --- Patient -----------------------------------------------------------------
  const allergies =
    design.showAllergyBanner && rx.patient.allergies.length
      ? w.wrap(`ALLERGIES: ${rx.patient.allergies.join(', ')}`, fonts.bold, 9, w.width - 120)
      : [];
  const boxHeight = 44 + allergies.length * 11;
  w.ensure(boxHeight + 10);
  w.page.drawRectangle({
    x: w.x0,
    y: w.y - boxHeight,
    width: w.width,
    height: boxHeight,
    color: PANEL,
    borderColor: rgb(0.89, 0.91, 0.94),
    borderWidth: 0.75,
  });
  w.label('PATIENT', w.x0 + 9, w.y - 12);
  w.text(rx.patient.name, w.x0 + 9, w.y - 25, { font: fonts.bold, size: 12 });
  w.text(
    `${ageSexLabel(rx.patient, rx.signedAt)} · ${num(rx.patient.weightKg)}kg · ${rx.patient.contact}`,
    w.x0 + 9,
    w.y - 37,
    { font: fonts.mono, size: 8.5, color: SOFT },
  );
  allergies.forEach((line, i) =>
    w.text(line, w.x0 + 9, w.y - 49 - i * 11, { font: fonts.bold, size: 9, color: RED }),
  );
  w.labelRight('DATE', w.x1 - 9, w.y - 12);
  w.textRight(date(signedAt), w.x1 - 9, w.y - 25, { font: fonts.monoBold, size: 10 });
  w.y -= boxHeight + 14;

  // --- Diagnosis ---------------------------------------------------------------
  w.ensure(30);
  w.label('DIAGNOSIS', w.x0, w.y);
  w.text(rx.diagnosis.code, w.x0, w.y - 14, { font: fonts.monoBold, size: 10, color: accent });
  const codeWidth = fonts.monoBold.widthOfTextAtSize(w.clean(rx.diagnosis.code), 10);
  w.text(rx.diagnosis.name, w.x0 + codeWidth + 8, w.y - 14, { font: fonts.bold, size: 10 });
  w.y -= 30;

  // --- Investigations ----------------------------------------------------------
  const invs = rx.investigations ?? [];
  if (invs.length) {
    w.ensure(40);
    w.label('ADVISED INVESTIGATIONS', w.x0, w.y);
    w.y -= 6;
    w.table(
      [
        { title: '#', width: 18 },
        { title: 'Code', width: 64, font: fonts.monoBold },
        { title: 'Investigation' },
        { title: 'Type', width: 50, color: MUTED },
      ],
      invs.map((inv, i) => [String(i + 1), inv.code, inv.name, inv.type.toUpperCase()]),
    );
    w.y -= 16;
  }

  // --- Medications -------------------------------------------------------------
  w.ensure(50);
  w.text('Rx  MEDICATIONS', w.x0, w.y - 2, { font: fonts.bold, size: 10, color: accent });
  w.rule(w.y - 6, accent, 0.75);
  w.y -= 10;
  w.table(
    [
      { title: '#', width: 18, font: fonts.mono, color: MUTED },
      { title: 'Drug (generic)', font: fonts.bold },
      { title: 'Dose', width: 56, font: fonts.monoBold },
      { title: 'Freq', width: 36, font: fonts.mono },
      { title: 'Days', width: 32, font: fonts.mono },
      { title: 'Instructions', share: 1.2 },
    ],
    rx.medications.map((m, i) => [
      String(i + 1),
      m.brandName ? `${medicineLabel(m)} (${m.genericName})` : m.genericName,
      `${num(m.dosage.value)}${m.dosage.unit}`,
      m.frequency,
      num(m.durationDays),
      m.instructions,
    ]),
    { header: true, zebra: true },
  );
  w.y -= 6;

  if (design.showRefillLine) {
    w.ensure(14);
    w.label('REFILLS', w.x0, w.y);
    w.text(num(design.defaultRefills), w.x0 + 52, w.y, { font: fonts.bold, size: 10 });
    w.y -= 14;
  }
  if (design.showValidUntil && !w.stamp) {
    w.ensure(14);
    const validUntil = new Date(signedAt.getTime() + 90 * 86_400_000);
    w.label('VALID UNTIL', w.x0, w.y);
    w.text(date(validUntil), w.x0 + 52, w.y, { font: fonts.bold, size: 10 });
    w.y -= 14;
  }

  // --- Signature and verification ---------------------------------------------
  const verification = w.stamp
    ? 'Demo print · not valid for dispensing'
    : `Verified digitally · record hash ${rx.recordHash ? rx.recordHash.slice(0, 16) : rx.id}${
        rx.ruleSetVersion ? ` · checked against rules ${rx.ruleSetVersion}` : ''
      }`;
  const footer =
    design.footerText ||
    (design.showSignatureLine
      ? 'This prescription was generated and signed electronically by SwiftRx.'
      : '');
  const noteWidth = design.showSignatureLine ? w.width * 0.58 : w.width;
  const notes = [
    ...w.wrap(verification, fonts.regular, 8, noteWidth).map((t) => ({
      t,
      color: w.stamp ? STAMP : MUTED,
    })),
    ...w.wrap(footer, fonts.regular, 8, noteWidth).map((t) => ({ t, color: MUTED })),
  ];
  w.ensure(design.showSignatureLine ? 70 : notes.length * 10 + 20);
  w.y -= design.showSignatureLine ? 40 : 10;
  if (design.showSignatureLine) {
    const sx = w.x1 - 170;
    w.page.drawLine({
      start: { x: sx, y: w.y },
      end: { x: w.x1, y: w.y },
      thickness: 1,
      color: INK,
    });
    w.textCenter(rx.doctorName, sx + 85, w.y - 12, { font: fonts.bold, size: 10 });
    w.textCenter(rx.doctorLicense, sx + 85, w.y - 23, { font: fonts.mono, size: 8, color: SOFT });
  } else {
    w.rule(w.y + 4, LINE, 0.5);
  }
  notes.forEach((n, i) => w.text(n.t, w.x0, w.y - 4 - i * 10, { size: 8, color: n.color }));

  return doc.save();
}

// --- internals ----------------------------------------------------------------

interface TextOpts {
  font?: PDFFont;
  size?: number;
  color?: RGB;
}

interface Column {
  title: string;
  /** Fixed width in points; columns without one share what's left. */
  width?: number;
  /** How much of the leftover width a flexible column takes (default 1). */
  share?: number;
  font?: PDFFont;
  color?: RGB;
}

/** Draws top-down on pages of the design's size, adding a page when one fills up. */
class Writer {
  page!: PDFPage;
  y = 0;
  readonly x0: number;
  readonly x1: number;
  readonly width: number;
  readonly accent: RGB;
  private readonly size: [number, number];
  private readonly margin = RX_PAGE_MARGIN_MM * PT_PER_MM;
  private pages = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly design: RxDesign,
    private readonly fonts: Record<'regular' | 'bold' | 'mono' | 'monoBold', PDFFont>,
    readonly stamp: 'DEMO' | null,
    private readonly rx: SignedRx,
  ) {
    const { widthMm, heightMm } = rxPageSizeMm(design);
    this.size = [widthMm * PT_PER_MM, heightMm * PT_PER_MM];
    this.x0 = this.margin;
    this.x1 = this.size[0] - this.margin;
    this.width = this.x1 - this.x0;
    this.accent = hexColor(design.accentColor) ?? hexColor(DEFAULT_RX_DESIGN.accentColor)!;
    this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage(this.size);
    this.pages += 1;
    const [pw, ph] = this.size;
    this.y = ph - this.margin;

    const mark = this.stamp ?? this.watermarkText();
    if (mark) {
      const size = Math.min(this.stamp ? 110 : 72, (pw * 0.9) / Math.max(4, mark.length * 0.62));
      const tw = this.fonts.bold.widthOfTextAtSize(mark, size);
      const angle = 22;
      const rad = (angle * Math.PI) / 180;
      this.page.drawText(mark, {
        x: pw / 2 - (tw / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
        y: ph / 2 - (tw / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
        size,
        font: this.fonts.bold,
        color: this.stamp ? STAMP : this.accent,
        opacity: this.stamp ? 0.14 : 0.06,
        rotate: degrees(angle),
      });
    }
    if (this.stamp) {
      const h = 18;
      this.page.drawRectangle({
        x: this.x0,
        y: this.y - h,
        width: this.width,
        height: h,
        borderColor: STAMP,
        borderWidth: 1.5,
      });
      this.textCenter(
        'DEMO - NOT A VALID PRESCRIPTION · printed from a demo site, do not dispense',
        this.x0 + this.width / 2,
        this.y - 12.5,
        { font: this.fonts.bold, size: 8, color: STAMP },
      );
      this.y -= h + 10;
    }
    if (this.pages > 1) {
      this.text(`${this.rx.patient.name} · Rx #${this.rx.id} · continued`, this.x0, this.y, {
        size: 8,
        color: MUTED,
      });
      this.y -= 16;
    }
  }

  private watermarkText(): string {
    const d = this.design;
    if (d.watermark === 'confidential') return 'CONFIDENTIAL';
    if (d.watermark === 'hospital') return this.clean((d.headerTitle || '').toUpperCase());
    if (d.watermark === 'doctor') return this.clean((this.rx.doctorName || '').toUpperCase());
    return '';
  }

  /** Starts a new page unless `height` points still fit on this one. */
  ensure(height: number) {
    if (this.y - height < this.margin) this.newPage();
  }

  /** Text the standard fonts can draw: anything outside WinAnsi becomes "?". */
  clean(s: string): string {
    const allowed = this.fonts.regular.getCharacterSet();
    return Array.from(s.replace(/[\r\n\t]+/g, ' '))
      .map((ch) => (allowed.includes(ch.codePointAt(0)!) ? ch : '?'))
      .join('');
  }

  text(s: string, x: number, y: number, o: TextOpts = {}) {
    this.page.drawText(this.clean(s), {
      x,
      y,
      font: o.font ?? this.fonts.regular,
      size: o.size ?? 10,
      color: o.color ?? INK,
    });
  }

  textRight(s: string, right: number, y: number, o: TextOpts = {}) {
    const font = o.font ?? this.fonts.regular;
    const width = font.widthOfTextAtSize(this.clean(s), o.size ?? 10);
    this.text(s, right - width, y, o);
  }

  textCenter(s: string, center: number, y: number, o: TextOpts = {}) {
    const font = o.font ?? this.fonts.regular;
    const width = font.widthOfTextAtSize(this.clean(s), o.size ?? 10);
    this.text(s, center - width / 2, y, o);
  }

  label(s: string, x: number, y: number) {
    this.text(s, x, y, { size: 7, color: MUTED });
  }

  labelRight(s: string, right: number, y: number) {
    this.textRight(s, right, y, { size: 7, color: MUTED });
  }

  rule(y: number, color: RGB, thickness: number) {
    this.page.drawLine({ start: { x: this.x0, y }, end: { x: this.x1, y }, thickness, color });
  }

  /** `s` broken into lines no wider than `width`, splitting long words if need be. */
  wrap(s: string, font: PDFFont, size: number, width: number): string[] {
    const text = this.clean(s).trim();
    if (!text) return [];
    const lines: string[] = [];
    let line = '';
    const fits = (t: string) => font.widthOfTextAtSize(t, size) <= width;
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (fits(next)) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (!fits(rest)) {
        let cut = rest.length - 1;
        while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** A table whose rows grow to fit wrapped text; it carries on across pages. */
  table(columns: Column[], rows: string[][], opts: { header?: boolean; zebra?: boolean } = {}) {
    const pad = 4;
    const size = 9;
    const lineHeight = 11;
    const fixed = columns.reduce((sum, c) => sum + (c.width ?? 0), 0);
    const shares = columns.reduce((sum, c) => sum + (c.width ? 0 : (c.share ?? 1)), 0);
    const widths = columns.map((c) => c.width ?? ((this.width - fixed) * (c.share ?? 1)) / shares);
    const xs = widths.map((_, i) => this.x0 + widths.slice(0, i).reduce((a, b) => a + b, 0));

    const header = () => {
      if (!opts.header) {
        this.rule(this.y, LINE, 0.5);
        this.y -= 2;
        columns.forEach((c, i) =>
          this.text(c.title, xs[i] + pad, this.y - 9, { size: 7.5, color: SOFT }),
        );
        this.y -= 13;
        return;
      }
      this.page.drawRectangle({
        x: this.x0,
        y: this.y - 16,
        width: this.width,
        height: 16,
        color: rgb(0.95, 0.96, 0.98),
      });
      columns.forEach((c, i) =>
        this.text(c.title, xs[i] + pad, this.y - 11, {
          font: this.fonts.bold,
          size: 8,
          color: SOFT,
        }),
      );
      this.rule(this.y - 16, LINE, 0.75);
      this.y -= 16;
    };

    this.ensure(40);
    header();
    rows.forEach((row, r) => {
      const cells = row.map((cell, i) =>
        this.wrap(cell, columns[i].font ?? this.fonts.regular, size, widths[i] - pad * 2),
      );
      const height = Math.max(1, ...cells.map((c) => c.length)) * lineHeight + pad * 2;
      if (this.y - height < this.margin) {
        this.newPage();
        header();
      }
      if (opts.zebra && r % 2 === 1) {
        this.page.drawRectangle({
          x: this.x0,
          y: this.y - height,
          width: this.width,
          height,
          color: rgb(0.98, 0.98, 0.98),
        });
      }
      cells.forEach((lines, i) =>
        lines.forEach((line, l) =>
          this.text(line, xs[i] + pad, this.y - pad - 8 - l * lineHeight, {
            font: columns[i].font,
            size,
            color: columns[i].color,
          }),
        ),
      );
      this.y -= height;
    });
  }
}

function num(n: number): string {
  return Number.isFinite(n) ? String(n) : '';
}

function date(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: DHAKA, dateStyle: 'medium' }).format(d);
}

function dateTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DHAKA,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** A #rrggbb color, or null when it isn't one. */
function hexColor(value: string): RGB | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  if (!m) return null;
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}
