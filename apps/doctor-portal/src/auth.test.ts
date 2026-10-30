import { describe, expect, it } from 'vitest';
import { getHospital, type Hospital, type SessionPayload } from '@swiftrx/shared';
import { sessionBelongsTo } from './auth';

const city = getHospital('city-hospital') as Hospital;
const northstar = getHospital('northstar-medical') as Hospital;

const doctorAtCity: SessionPayload = {
  role: 'doctor',
  userId: 'd_001',
  hospitalSlug: 'city-hospital',
  issuedAt: 0,
  email: 'doctor@city-hospital.com',
  name: 'A City doctor',
  licenseNo: 'PMDC-00000',
};

describe('sessionBelongsTo', () => {
  it('accepts a session on the hospital it signed in at', () => {
    expect(sessionBelongsTo(doctorAtCity, city)).toBe(true);
  });

  it("refuses it on another hospital's portal", () => {
    expect(sessionBelongsTo(doctorAtCity, northstar)).toBe(false);
    expect(sessionBelongsTo({ ...doctorAtCity, role: 'hospital_admin' }, northstar)).toBe(false);
  });

  it("doesn't restrict platform admins, who have no hospital (PLAN.md §2.3)", () => {
    const admin: SessionPayload = {
      role: 'platform_admin',
      userId: 'u_admin_001',
      issuedAt: 0,
      email: 'admin@swiftrx.com',
      name: 'Platform admin',
    };
    expect(sessionBelongsTo(admin, city)).toBe(true);
  });
});
