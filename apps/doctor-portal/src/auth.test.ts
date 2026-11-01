import { describe, expect, it } from 'vitest';
import {
  getHospital,
  type Hospital,
  type Membership,
  type SessionPayload,
  type User,
} from '@swiftrx/shared';
import { canPrescribe, sessionBelongsTo } from './auth';

const city = getHospital('city-hospital') as Hospital;
const northstar = getHospital('northstar-medical') as Hospital;

const doctorAtCity: SessionPayload = {
  role: 'doctor',
  userId: 'd_001',
  hospitalSlug: 'city-hospital',
  issuedAt: 0,
  expiresAt: 43_200_000,
  email: 'doctor@city-hospital.com',
  name: 'A City doctor',
  licenseNo: 'BMDC A-00000',
};

describe('sessionBelongsTo', () => {
  it('accepts a session on the hospital it signed in at', () => {
    expect(sessionBelongsTo(doctorAtCity, city)).toBe(true);
  });

  it("refuses it on another hospital's portal", () => {
    expect(sessionBelongsTo(doctorAtCity, northstar)).toBe(false);
    expect(sessionBelongsTo({ ...doctorAtCity, role: 'hospital_admin' }, northstar)).toBe(false);
  });

  it('refuses a platform admin, who signs in at the admin panel', () => {
    const admin: SessionPayload = {
      role: 'platform_admin',
      userId: 'u_admin_001',
      issuedAt: 0,
      expiresAt: 43_200_000,
      email: 'admin@swiftrx.com',
      name: 'Platform admin',
    };
    expect(sessionBelongsTo(admin, city)).toBe(false);
  });
});

describe('canPrescribe (D3: only doctors prescribe)', () => {
  const ayesha: User = {
    id: 'd_001',
    email: 'ayesha@city-hospital.com',
    name: 'Dr. Ayesha Khan',
    role: 'doctor',
    hospitalSlug: 'city-hospital',
    licenseNo: 'BMDC A-44121',
    status: 'active',
    createdAt: '2024-08-15T10:00:00.000Z',
  };
  const signedIn = (user: Partial<User>, roles: Membership['role'][]) => ({
    user: { ...ayesha, ...user },
    memberships: roles.map((role) => ({ hospitalSlug: 'city-hospital', role })),
  });

  it('admits an active doctor of this hospital with a license', () => {
    expect(canPrescribe(signedIn({}, ['doctor']), city)).toBe(true);
  });

  it('refuses a hospital admin, even one with a license number', () => {
    expect(canPrescribe(signedIn({ role: 'hospital_admin' }, ['hospital_admin']), city)).toBe(
      false,
    );
  });

  it('admits an admin who also holds a doctor role here', () => {
    const both = signedIn({ role: 'hospital_admin' }, ['hospital_admin', 'doctor']);
    expect(canPrescribe(both, city)).toBe(true);
  });

  it('refuses a doctor without a license, one not active, and at another hospital', () => {
    expect(canPrescribe(signedIn({ licenseNo: undefined }, ['doctor']), city)).toBe(false);
    expect(canPrescribe(signedIn({ licenseNo: '  ' }, ['doctor']), city)).toBe(false);
    expect(canPrescribe(signedIn({ status: 'invited' }, ['doctor']), city)).toBe(false);
    expect(canPrescribe(signedIn({}, ['doctor']), northstar)).toBe(false);
  });
});
