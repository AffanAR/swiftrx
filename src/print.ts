import type { SignedRx } from './types';
import { getState } from './store';
import { DEFAULT_RX_DESIGN, getRxDesign, type RxDesign } from '@swiftrx/shared';

// Render a prescription into the #print-area for the browser print dialog.
export function renderPrintable(rx: SignedRx) {
  const target = document.getElementById('print-area');
  if (!target) return;

  // Defensive default for older payloads that predate the investigations field.
  // We pass a shallow copy to the renderer so we never mutate the caller's
  // SignedRx (which also lives in the store's signed history).
  const safe: SignedRx = rx.investigations
    ? rx
    : { ...rx, investigations: [] };

  const design = getRxDesign(safe.hospitalSlug) ?? DEFAULT_RX_DESIGN;

  // Push the page geometry to the live @page rule so the print dialog picks
  // up the right paper size / orientation.
  applyPageGeometry(design);

  target.innerHTML = renderHtml(safe, design);
}

// Pure HTML render used by renderPrintable. Exported so tests / preview can call it.
export function renderHtml(rx: SignedRx, design: RxDesign = DEFAULT_RX_DESIGN): string {
  const signedAt = new Date(rx.signedAt);
  const meds = rx.medications;
  const invs = rx.investigations || [];
  const accent = design.accentColor;
  const accentSoft = hexToRgba(accent, 0.12);
  const accentBorder = hexToRgba(accent, 0.35);
  const validUntil = new Date(signedAt.getTime() + 90 * 86_400_000).toLocaleDateString();

  const allergyBanner =
    design.showAllergyBanner && rx.patient.allergies.length
      ? `<div style="display:inline-block; margin-top: 6px; padding: 3px 8px; border: 1.5px solid #b91c1c; color: #b91c1c; border-radius: 999px; font-size: 11px; font-weight: 600;">&#9888; ALLERGIES: ${escape(rx.patient.allergies.join(', '))}</div>`
      : '';

  const watermark =
    design.watermark === 'none'
      ? ''
      : `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index:0;">
          <div style="font-size: 96px; font-weight: 900; letter-spacing: 6px; color: ${accent}; opacity: 0.06; transform: rotate(-22deg);">
            ${escape(
              design.watermark === 'confidential'
                ? 'CONFIDENTIAL'
                : design.watermark === 'hospital'
                  ? (design.headerTitle || '').toUpperCase()
                  : (rx.doctorName || '').toUpperCase(),
            )}
          </div>
        </div>`;

  const headerBadge = design.showRxBadge
    ? `<div style="width:34px;height:34px;border-radius:8px;background:${accent};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0;">&#8478;</div>`
    : '';

  const headerRight = design.headerRight
    ? `<div style="text-align: right; font-size: 10px; color:#64748b; white-space: pre-line; line-height: 1.4; max-width: 45%;">${escape(design.headerRight)}</div>`
    : `<div style="text-align: right;">
          <div style="font-size: 10px; color:#64748b; text-transform:uppercase; letter-spacing:1.5px;">Prescription</div>
          <div style="font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color:${accent}; font-weight:600;">#${escape(rx.id)}</div>
          <div style="font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color:#475569;">${signedAt.toLocaleString()}</div>
        </div>`;

  return `
    <div style="position:relative; font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; color: #111; line-height: 1.45;">
      ${watermark}

      <div style="position:relative; z-index:1;">
        <!-- Letterhead -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding-bottom: 10px; ${design.showAccentBand ? `margin-bottom: 4px;` : `margin-bottom: 14px; border-bottom: 2px solid ${accent};`}">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            ${headerBadge}
            <div style="min-width:0;">
              <div style="font-size: 20px; font-weight: 700; color:${accent}; letter-spacing:-0.2px;">${escape(design.headerTitle || 'Prescription')}</div>
              ${design.headerSubtitle ? `<div style="font-size: 11px; color:#475569;">${escape(design.headerSubtitle)}</div>` : ''}
              <div style="font-size: 11px; color:#475569; margin-top: 2px;">${escape(rx.doctorName)} &middot; ${escape(rx.doctorLicense)}</div>
            </div>
          </div>
          ${headerRight}
        </div>
        ${design.showAccentBand ? `<div style="height: 4px; background: ${accent}; border-radius: 2px; margin-bottom: 14px;"></div>` : ''}

        <!-- Patient block -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
            <div>
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Patient</div>
              <div style="font-size:15px;font-weight:700;margin-top:2px;">${escape(rx.patient.name)}</div>
              <div style="font-size:11px;color:#475569;font-family:'JetBrains Mono',ui-monospace,monospace;">
                ${rx.patient.age}${rx.patient.sex} &middot; ${rx.patient.weightKg}kg &middot; ${escape(rx.patient.contact)}
              </div>
              ${allergyBanner}
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Date</div>
              <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;font-weight:600;">${signedAt.toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        <!-- Diagnosis -->
        <div style="margin-bottom: 12px;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Diagnosis</div>
          <div style="font-size:13px;margin-top:2px;">
            <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700;color:${accent};background:${accentSoft};padding:1px 6px;border-radius:4px;">${escape(rx.diagnosis.code)}</span>
            <span style="margin-left:6px;font-weight:600;">${escape(rx.diagnosis.name)}</span>
          </div>
        </div>

        ${
          invs.length
            ? `<div style="margin-bottom: 14px;">
                <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;border-bottom:1px dashed ${accentBorder};padding-bottom:3px;">Advised Investigations</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px;">
                  <thead>
                    <tr style="text-align:left; color:#475569;">
                      <th style="padding: 4px 6px; width: 24px; font-weight:600;">#</th>
                      <th style="padding: 4px 6px; width: 90px; font-weight:600;">Code</th>
                      <th style="padding: 4px 6px; font-weight:600;">Investigation</th>
                      <th style="padding: 4px 6px; width: 60px; font-weight:600;">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${invs
                      .map(
                        (inv, i) => `
                      <tr>
                        <td style="padding: 4px 6px; color:#64748b;">${i + 1}</td>
                        <td style="padding: 4px 6px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight:600;">${escape(inv.code)}</td>
                        <td style="padding: 4px 6px;">${escape(inv.name)}</td>
                        <td style="padding: 4px 6px; color:#64748b; text-transform: uppercase; font-size: 10px; letter-spacing:0.5px;">${escape(inv.type)}</td>
                      </tr>`,
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : ''
        }

        <!-- Medications -->
        <div style="margin-bottom: 12px;">
          <div style="display:flex; align-items:center; gap:8px; font-size:11px; color:${accent}; text-transform:uppercase; letter-spacing:2px; border-bottom:1px solid ${accent}; padding-bottom:4px;">
            <span style="font-size:18px; font-weight:700;">&#8478;</span>
            <span style="font-weight:700;">Medications</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px;">
            <thead>
              <tr style="text-align:left; background:#f1f5f9;">
                <th style="padding: 6px 8px; width: 22px; font-weight:600; color:#475569; border-bottom:1px solid #cbd5e1;">#</th>
                <th style="padding: 6px 8px; font-weight:600; color:#475569; border-bottom:1px solid #cbd5e1;">Drug (Generic)</th>
                <th style="padding: 6px 8px; width: 70px; font-weight:600; color:#475569; border-bottom:1px solid #cbd5e1;">Dose</th>
                <th style="padding: 6px 8px; width: 50px; font-weight:600; color:#475569; border-bottom:1px solid #cbd5e1;">Freq</th>
                <th style="padding: 6px 8px; width: 50px; font-weight:600; color:#475569; border-bottom:1px solid #cbd5e1;">Days</th>
                <th style="padding: 6px 8px; font-weight:600; color:#475569; border-bottom:1px solid #cbd5e1;">Instructions</th>
              </tr>
            </thead>
            <tbody>
              ${meds
                .map(
                  (m, i) => `
                <tr style="${i % 2 === 1 ? 'background:#fafafa;' : ''}">
                  <td style="padding: 6px 8px; color:#64748b; font-family:'JetBrains Mono',ui-monospace,monospace;">${i + 1}</td>
                  <td style="padding: 6px 8px;"><strong>${escape(m.genericName)}</strong>${
                    m.brandName
                      ? ` <span style="color:#64748b; font-size:10px;">(${escape(m.brandName)})</span>`
                      : ''
                  }</td>
                  <td style="padding: 6px 8px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight:600;">${m.dosage.value}${escape(m.dosage.unit)}</td>
                  <td style="padding: 6px 8px; font-family: 'JetBrains Mono', ui-monospace, monospace;">${escape(m.frequency)}</td>
                  <td style="padding: 6px 8px; font-family: 'JetBrains Mono', ui-monospace, monospace;">${m.durationDays}</td>
                  <td style="padding: 6px 8px;">${escape(m.instructions)}</td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>

        ${
          design.showRefillLine
            ? `<div style="font-size: 12px; margin-top: 8px;"><span style="color:#64748b; text-transform: uppercase; letter-spacing: 1.5px; font-size: 10px;">Refills</span> &nbsp; <strong>${design.defaultRefills}</strong></div>`
            : ''
        }
        ${
          design.showValidUntil
            ? `<div style="font-size: 12px; margin-top: 4px;"><span style="color:#64748b; text-transform: uppercase; letter-spacing: 1.5px; font-size: 10px;">Valid until</span> &nbsp; <strong>${escape(validUntil)}</strong></div>`
            : ''
        }

        <!-- Signature block -->
        ${
          design.showSignatureLine
            ? `<div style="margin-top: 28px; display:flex; justify-content:space-between; align-items:flex-end; gap:24px;">
                <div style="font-size: 10px; color:#64748b; line-height:1.5; max-width:60%;">
                  <div>Verified digitally &middot; signature hash
                    <span style="font-family: 'JetBrains Mono', ui-monospace, monospace; color:${accent}; font-weight:600;">${shortHash(rx.id)}</span>
                  </div>
                  <div style="margin-top:2px;">${escape(design.footerText || 'This prescription was generated and signed electronically by SwiftRx.')}</div>
                </div>
                <div style="text-align: center; min-width: 220px;">
                  <div style="height: 36px;"></div>
                  <div style="border-top: 1.5px solid #111; padding-top: 5px; font-size: 12px; font-weight:600;">
                    ${escape(rx.doctorName)}
                  </div>
                  <div style="font-size: 10px; color:#475569; font-family:'JetBrains Mono',ui-monospace,monospace;">${escape(rx.doctorLicense)}</div>
                </div>
              </div>`
            : `<div style="margin-top: 24px; font-size: 10px; color:#64748b; border-top: 1px dashed #cbd5e1; padding-top: 8px;">${escape(design.footerText || '')}</div>`
        }
      </div>
    </div>
  `;
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
    doctorName: s.doctorName,
    doctorLicense: s.doctorLicense,
  };
}

// Always renders the printable area, then triggers window.print() on the next paint.
// Use this for any user-facing print action so the area is never blank.
// Pass the Rx returned by `sign()` to print it; with no argument the current
// draft is printed instead.
export function printCurrent(rx?: SignedRx) {
  const payload = rx ?? buildDraftRx();
  if (!payload) return;
  renderPrintable(payload);
  // Two rAFs + a small timeout is the most reliable cross-browser pattern
  // for letting layout/paint settle before the print dialog opens.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 50);
    });
  });
}

// --- internals ---------------------------------------------------------------

let pageStyleEl: HTMLStyleElement | null = null;
function applyPageGeometry(design: RxDesign) {
  if (typeof document === 'undefined') return;
  const size =
    design.pageSize === 'A5' ? '148mm 210mm' :
    design.pageSize === 'Letter' ? '8.5in 11in' :
    'A4';
  const orient = design.landscape ? ' landscape' : '';
  const css = `@page { size: ${size}${orient}; margin: 14mm; } @media print { html, body { margin: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;
  if (!pageStyleEl) {
    pageStyleEl = document.createElement('style');
    pageStyleEl.setAttribute('data-rx-page', '1');
    document.head.appendChild(pageStyleEl);
  }
  pageStyleEl.textContent = css;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(16,185,129,${alpha})`;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

