/**
 * Coercition des entrées de formulaire (validation.ts) + transitions workflow.
 *
 * Les champs cliniques arrivent du navigateur en chaînes ("37.5") ou vides
 * ('') depuis les <input>/<select>. Les helpers numeric()/emptyToNull doivent
 * coercer correctement, sinon c'est un 400 (le bug POST /api/vitaux d'origine).
 * On teste via les schémas exportés réels — c'est le contrat qui a cassé.
 */

import { describe, it, expect } from '@jest/globals';
import { createVitalSchema, createAllergieSchema } from '../middleware/validation.js';
import { canTransition, assertTransition, WorkflowError } from '../services/workflow.js';

describe('numeric() — coercition des nombres (createVitalSchema)', () => {
  it('chaîne vide → undefined (champ optionnel accepté)', () => {
    const r = createVitalSchema.safeParse({ patient_id: 1, saturation_o2: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.saturation_o2).toBeUndefined();
  });

  it('chaîne numérique "37.5" → nombre 37.5', () => {
    const r = createVitalSchema.safeParse({ patient_id: 1, temperature: '37.5' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.temperature).toBe(37.5);
  });

  it('patient_id requis fourni en chaîne "42" → 42', () => {
    const r = createVitalSchema.safeParse({ patient_id: '42' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.patient_id).toBe(42);
  });

  it('chaîne non numérique "abc" → erreur lisible sur le champ', () => {
    const r = createVitalSchema.safeParse({ patient_id: 1, tension_systolique: 'abc' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.errors.map(e => e.path.join('.'));
      expect(paths).toContain('tension_systolique');
    }
  });

  it('respecte les bornes après coercition (tension < min → rejet)', () => {
    const r = createVitalSchema.safeParse({ patient_id: 1, tension_systolique: '10' });
    expect(r.success).toBe(false);
  });

  it('patient_id manquant → rejet (champ requis)', () => {
    const r = createVitalSchema.safeParse({ temperature: '37' });
    expect(r.success).toBe(false);
  });
});

describe('emptyToNull() — selects vides (createAllergieSchema)', () => {
  it('type_allergie "" → null (optionnel accepté)', () => {
    const r = createAllergieSchema.safeParse({ patient_id: 1, allergene: 'Pénicilline', type_allergie: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type_allergie).toBeNull();
  });

  it('type_allergie valide conservé', () => {
    const r = createAllergieSchema.safeParse({ patient_id: 1, allergene: 'Arachide', type_allergie: 'alimentaire' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type_allergie).toBe('alimentaire');
  });

  it('type_allergie hors enum → rejet', () => {
    const r = createAllergieSchema.safeParse({ patient_id: 1, allergene: 'X', type_allergie: 'inconnu' });
    expect(r.success).toBe(false);
  });

  it('allergene vide → rejet (min 1)', () => {
    const r = createAllergieSchema.safeParse({ patient_id: 1, allergene: '' });
    expect(r.success).toBe(false);
  });
});

describe('workflow examen — transitions', () => {
  it('autorise le parcours normal', () => {
    expect(canTransition('examen', 'prelevement', 'analyse')).toBe(true);
    expect(canTransition('examen', 'analyse', 'resultat')).toBe(true);
    expect(canTransition('examen', 'resultat', 'valide')).toBe(true);
    expect(canTransition('examen', 'valide', 'transmis')).toBe(true);
  });

  it('autorise la self-transition (rejeu idempotent)', () => {
    expect(canTransition('examen', 'resultat', 'resultat')).toBe(true);
  });

  it('refuse les sauts d’étape', () => {
    expect(canTransition('examen', 'prelevement', 'transmis')).toBe(false);
    expect(canTransition('examen', 'analyse', 'valide')).toBe(false);
  });

  it('transmis est terminal', () => {
    expect(canTransition('examen', 'transmis', 'valide')).toBe(false);
  });

  it('assertTransition lève WorkflowError sur transition invalide', () => {
    expect(() => assertTransition('examen', 'prelevement', 'transmis')).toThrow(WorkflowError);
  });

  it('assertTransition ne lève pas sur transition valide', () => {
    expect(() => assertTransition('examen', 'analyse', 'resultat')).not.toThrow();
  });
});
