// How a prescribed medicine is written, as on a Bangladeshi prescription:
// the form's short name, the brand and its strength ("Tab. Napa 500 mg"). A
// row without a brand is written as its generic.

import type { RxMedication } from './types';

// The dosage forms' usual short names. Others are written out ("Cream").
const SHORT_FORMS: [RegExp, string][] = [
  [/^chewable tablet/i, 'Chew. Tab.'],
  [/^tablet/i, 'Tab.'],
  [/^capsule/i, 'Cap.'],
  [/^syrup/i, 'Syr.'],
  [/^(oral |dry )?suspension|^powder for suspension/i, 'Susp.'],
  [/injection|infusion/i, 'Inj.'],
  [/^suppository/i, 'Supp.'],
  [/drops$/i, 'Drops'],
];

export function shortForm(form: string): string {
  return SHORT_FORMS.find(([pattern]) => pattern.test(form))?.[1] ?? form;
}

export function medicineLabel(
  m: Pick<RxMedication, 'genericName' | 'brandName' | 'form' | 'strength'>,
): string {
  if (!m.brandName) return m.genericName;
  return [m.form && shortForm(m.form), m.brandName, m.strength].filter(Boolean).join(' ');
}
