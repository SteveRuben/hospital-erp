/**
 * Pure-function tests for the form coercion helpers. Each case here
 * mirrors a real bug that landed in prod and was hot-fixed today:
 *   - PatientForm: nulls in <select value>, lost multi-word fields,
 *     groupe_sanguin enum mismatch.
 *   - RDV: 400 'Expected number, received string' on every create.
 *
 * No React render — these are deterministic, fast, and would have
 * caught each of those bugs in <50 ms.
 */
import { describe, it, expect } from 'vitest';
import { patientServerToForm, coerceRdvPayload, GROUPE_API_TO_FORM } from './formCoerce';

describe('patientServerToForm', () => {
  it('coalesces server nulls to empty strings — no React null-value warnings', () => {
    const out = patientServerToForm({
      nom: 'Doe', prenom: 'Jane',
      sexe: null, statutMatrimonial: null, groupeSanguin: null,
      adresse: null, profession: null,
    });
    expect(out.sexe).toBe('');
    expect(out.statut_matrimonial).toBe('');
    expect(out.groupe_sanguin).toBe('');
    expect(out.adresse).toBe('');
  });

  it('reads camelCase server keys into snake_case form slots', () => {
    const out = patientServerToForm({
      nom: 'Doe', prenom: 'Jane',
      dateNaissance: '1990-04-12T00:00:00.000Z',
      ageEstime: 35,
      lieuNaissance: 'Yaoundé',
      numeroIdentite: 'CM123',
      statutMatrimonial: 'celibataire',
      contactUrgenceNom: 'John Doe',
      contactUrgenceRelation: 'conjoint',
      contactUrgenceTelephone: '+237600000000',
    });
    expect(out.date_naissance).toBe('1990-04-12');
    expect(out.age_estime).toBe('35');
    expect(out.lieu_naissance).toBe('Yaoundé');
    expect(out.numero_identite).toBe('CM123');
    expect(out.statut_matrimonial).toBe('celibataire');
    expect(out.contact_urgence_nom).toBe('John Doe');
    expect(out.contact_urgence_relation).toBe('conjoint');
    expect(out.contact_urgence_telephone).toBe('+237600000000');
  });

  it('clips ISO timestamps to YYYY-MM-DD for <input type="date">', () => {
    const out = patientServerToForm({
      nom: 'Doe', prenom: 'Jane',
      dateNaissance: '2000-01-15T00:00:00.000Z',
    });
    expect(out.date_naissance).toBe('2000-01-15');
  });

  it('back-translates Prisma GroupeSanguin enum names to <select> labels', () => {
    // Every enum variant: Prisma name → form value
    for (const [enumName, formLabel] of Object.entries(GROUPE_API_TO_FORM)) {
      const out = patientServerToForm({ nom: 'X', prenom: 'Y', groupeSanguin: enumName });
      expect(out.groupe_sanguin).toBe(formLabel);
    }
  });

  it('snake_case server payload (alternative shape) still works', () => {
    // Some endpoints already emit snake_case — accept both shapes.
    const out = patientServerToForm({
      nom: 'Doe', prenom: 'Jane',
      date_naissance: '1990-04-12',
      age_estime: 35,
      groupe_sanguin: 'A+',
      contact_urgence_nom: 'John',
    });
    expect(out.date_naissance).toBe('1990-04-12');
    expect(out.age_estime).toBe('35');
    expect(out.groupe_sanguin).toBe('A+');
    expect(out.contact_urgence_nom).toBe('John');
  });

  it('passes through unknown groupe_sanguin values unchanged (forward compat)', () => {
    const out = patientServerToForm({ nom: 'X', prenom: 'Y', groupeSanguin: 'Bombay' });
    expect(out.groupe_sanguin).toBe('Bombay');
  });
});

describe('coerceRdvPayload', () => {
  it('coerces patient_id and medecin_id from strings to numbers', () => {
    const out = coerceRdvPayload({
      patient_id: '42', medecin_id: '7', service_id: '',
      date_rdv: '2026-06-01T10:00', motif: '', notes: '',
    });
    expect(out.patient_id).toBe(42);
    expect(typeof out.patient_id).toBe('number');
    expect(out.medecin_id).toBe(7);
    expect(typeof out.medecin_id).toBe('number');
  });

  it('drops service_id when empty (Zod sees undefined, not NaN)', () => {
    const out = coerceRdvPayload({
      patient_id: '1', medecin_id: '2', service_id: '',
      date_rdv: '2026-06-01T10:00', motif: '', notes: '',
    });
    expect(out.service_id).toBeUndefined();
    // Critical: not 0, not NaN, not null — undefined.
    expect('service_id' in out).toBe(false);
  });

  it('coerces service_id when present', () => {
    const out = coerceRdvPayload({
      patient_id: '1', medecin_id: '2', service_id: '5',
      date_rdv: '2026-06-01T10:00', motif: 'Suivi', notes: '',
    });
    expect(out.service_id).toBe(5);
    expect(out.motif).toBe('Suivi');
    expect(out.notes).toBeUndefined();
  });

  it('throws when patient_id is missing — caller surfaces the error', () => {
    expect(() => coerceRdvPayload({
      patient_id: '', medecin_id: '2', service_id: '',
      date_rdv: '2026-06-01T10:00', motif: '', notes: '',
    })).toThrow(/patient_id/);
  });

  it('throws when medecin_id is missing', () => {
    expect(() => coerceRdvPayload({
      patient_id: '1', medecin_id: '', service_id: '',
      date_rdv: '2026-06-01T10:00', motif: '', notes: '',
    })).toThrow(/medecin_id/);
  });
});
