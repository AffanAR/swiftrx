import { actions, getState } from './store';
import {
  DEFAULT_RX_DESIGN,
  RX_PAGE_MARGIN_MM,
  renderRxHtml,
  rxPageSizeMm,
  type RxDesign,
  type SignedRx,
} from '@swiftrx/shared';

// Render a prescription into the #print-area for the browser print dialog,
// using the shared template the admin preview also uses. `draft` marks an
// unsigned pad: DRAFT watermark, no signature verification.
export function renderPrintable(rx: SignedRx, opts?: { draft?: boolean }) {
  // The portal page has no #print-area of its own; create it on first print.
  let target = document.getElementById('print-area');
  if (!target) {
    target = document.createElement('div');
    target.id = 'print-area';
    document.body.appendChild(target);
  }

  // The pad only prints its own hospital's prescriptions, so its design applies.
  const design = getState().rxDesign ?? DEFAULT_RX_DESIGN;

  // Push the page geometry to the live @page rule so the print dialog picks
  // up the right paper size / orientation.
  applyPageGeometry(design);

  target.innerHTML = renderRxHtml(rx, design, { draft: opts?.draft });
}

// Sign the pad and print the result — the one path for every "Sign & Print"
// trigger. Prints only once the prescription is saved. Resolves to null when
// signing was refused (incomplete pad, invalid dose, or a critical alert that
// still needs an override reason) or saving failed.
export async function signAndPrint(overrideReason?: string): Promise<SignedRx | null> {
  const signed = await actions.sign(overrideReason);
  if (signed) printCurrent(signed);
  return signed;
}

// Build a SignedRx snapshot from the current store draft so Print works even without
// signing first. Returns null if the draft is incomplete.
export function buildDraftRx(): SignedRx | null {
  const s = getState();
  const patient = s.patients.find((p) => p.id === s.patientId);
  if (!patient || !s.diagnosis || !s.medications.length) return null;
  return {
    id: 'rx_draft_' + Date.now().toString(36),
    signedAt: new Date().toISOString(),
    hospitalSlug: patient.hospitalSlug,
    patient,
    diagnosis: s.diagnosis,
    medications: s.medications,
    investigations: s.investigations,
    doctorId: 'draft',
    doctorName: s.doctor?.name ?? '',
    doctorLicense: s.doctor?.licenseNo ?? '',
  };
}

// Always renders the printable area, then triggers window.print() on the next paint.
// Use this for any user-facing print action so the area is never blank.
// Pass the Rx returned by `sign()` to print it; with no argument the current
// draft is printed instead, marked DRAFT. Returns false if there was nothing
// to print.
export function printCurrent(rx?: SignedRx): boolean {
  const payload = rx ?? buildDraftRx();
  if (!payload) return false;
  renderPrintable(payload, { draft: !rx });
  // Switches on the print stylesheet in rx.css until the dialog closes.
  document.documentElement.classList.add('rx-printing');
  // Two rAFs + a small timeout is the most reliable cross-browser pattern
  // for letting layout/paint settle before the print dialog opens.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 50);
    });
  });
  return true;
}

// Once the dialog closes, empty the print area and switch the print stylesheet
// off, so a later print from the browser menu prints the page itself rather
// than an old (possibly signed) prescription.
if (typeof window !== 'undefined') {
  window.addEventListener('afterprint', () => {
    document.documentElement.classList.remove('rx-printing');
    const target = document.getElementById('print-area');
    if (target) target.innerHTML = '';
  });
}

// --- internals ---------------------------------------------------------------

let pageStyleEl: HTMLStyleElement | null = null;
function applyPageGeometry(design: RxDesign) {
  if (typeof document === 'undefined') return;
  // Same paper size and margin the admin preview draws (landscape included).
  const { widthMm, heightMm } = rxPageSizeMm(design);
  const css = `@page { size: ${widthMm}mm ${heightMm}mm; margin: ${RX_PAGE_MARGIN_MM}mm; } @media print { html, body { margin: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;
  if (!pageStyleEl) {
    pageStyleEl = document.createElement('style');
    pageStyleEl.setAttribute('data-rx-page', '1');
    document.head.appendChild(pageStyleEl);
  }
  pageStyleEl.textContent = css;
}
