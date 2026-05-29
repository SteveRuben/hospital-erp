/**
 * FHIR R4 mappers. Translate internal Prisma rows into FHIR resources so the
 * /fhir/* facade can expose patient data in a standard, interoperable form
 * (national registries, external labs, insurers, other EMRs).
 *
 * Read-only for now — these produce resources, they never parse incoming FHIR.
 * Identifiers use Patient/<id>, Encounter/<id>, etc. (internal numeric ids as
 * FHIR logical ids) which is sufficient for a single-establishment server.
 */

const FHIR_VERSION = '4.0.1';

// Internal system URIs for our own identifiers (opaque but stable).
const SYS_PATIENT_ID = 'urn:hospital-erp:patient-id';
const SYS_PATIENT_REF = 'urn:hospital-erp:reference-id';

// LOINC codes for the structured vital signs so vitals come out as coded
// FHIR Observations rather than free text — the single biggest interop win.
export const VITAL_LOINC: Record<string, { code: string; display: string; unit: string }> = {
  temperature:           { code: '8310-5',  display: 'Body temperature',        unit: 'Cel' },
  tensionSystolique:     { code: '8480-6',  display: 'Systolic blood pressure', unit: 'mm[Hg]' },
  tensionDiastolique:    { code: '8462-4',  display: 'Diastolic blood pressure',unit: 'mm[Hg]' },
  pouls:                 { code: '8867-4',  display: 'Heart rate',              unit: '/min' },
  frequenceRespiratoire: { code: '9279-1',  display: 'Respiratory rate',        unit: '/min' },
  saturationO2:          { code: '59408-5', display: 'Oxygen saturation',       unit: '%' },
  poids:                 { code: '29463-7', display: 'Body weight',             unit: 'kg' },
  taille:                { code: '8302-2',  display: 'Body height',             unit: 'cm' },
  glycemie:              { code: '2339-0',  display: 'Glucose [Mass/volume] in Blood', unit: 'g/L' },
};

const iso = (d: Date | string | null | undefined): string | undefined =>
  d ? (d instanceof Date ? d.toISOString() : new Date(d).toISOString()) : undefined;
const isoDate = (d: Date | string | null | undefined): string | undefined => {
  const s = iso(d);
  return s ? s.substring(0, 10) : undefined;
};

function mapGender(sexe: string | null | undefined): string {
  if (sexe === 'M') return 'male';
  if (sexe === 'F') return 'female';
  if (sexe === 'autre') return 'other';
  return 'unknown';
}

export interface PatientRow {
  id: number; nom: string; prenom: string; deuxiemePrenom?: string | null;
  sexe?: string | null; dateNaissance?: Date | string | null;
  telephone?: string | null; email?: string | null; adresse?: string | null;
  ville?: string | null; pays?: string | null; archived?: boolean;
  referenceId?: string | null;
}

export function patientToFhir(p: PatientRow): Record<string, unknown> {
  const given = [p.prenom, p.deuxiemePrenom].filter(Boolean) as string[];
  const telecom: Array<Record<string, unknown>> = [];
  if (p.telephone) telecom.push({ system: 'phone', value: p.telephone });
  if (p.email) telecom.push({ system: 'email', value: p.email });

  const identifier: Array<Record<string, unknown>> = [
    { system: SYS_PATIENT_ID, value: String(p.id) },
  ];
  if (p.referenceId) identifier.push({ system: SYS_PATIENT_REF, value: p.referenceId });

  const address = (p.adresse || p.ville || p.pays)
    ? [{ line: p.adresse ? [p.adresse] : undefined, city: p.ville || undefined, country: p.pays || undefined }]
    : undefined;

  return {
    resourceType: 'Patient',
    id: String(p.id),
    identifier,
    active: p.archived !== true,
    name: [{ use: 'official', family: p.nom, given }],
    telecom: telecom.length ? telecom : undefined,
    gender: mapGender(p.sexe),
    birthDate: isoDate(p.dateNaissance),
    address,
  };
}

export interface ObservationRow {
  id: number; patientId: number; encounterId?: number | null;
  valeurNumerique?: unknown; valeurTexte?: string | null; valeurDate?: Date | string | null;
  valeurBoolean?: boolean | null; valeurCoded?: number | null; dateObs?: Date | string | null;
  voided?: boolean;
  concept?: { nom: string; unite?: string | null } | null;
  codedConcept?: { nom: string } | null;
}

export function observationToFhir(o: ObservationRow): Record<string, unknown> {
  const res: Record<string, unknown> = {
    resourceType: 'Observation',
    id: String(o.id),
    status: o.voided ? 'entered-in-error' : 'final',
    code: { text: o.concept?.nom ?? 'Observation' },
    subject: { reference: `Patient/${o.patientId}` },
    effectiveDateTime: iso(o.dateObs),
  };
  if (o.encounterId) res.encounter = { reference: `Encounter/${o.encounterId}` };

  if (o.valeurNumerique !== null && o.valeurNumerique !== undefined) {
    res.valueQuantity = { value: Number(o.valeurNumerique), unit: o.concept?.unite ?? undefined };
  } else if (o.valeurBoolean !== null && o.valeurBoolean !== undefined) {
    res.valueBoolean = o.valeurBoolean;
  } else if (o.valeurDate) {
    res.valueDateTime = iso(o.valeurDate);
  } else if (o.valeurCoded && o.codedConcept) {
    res.valueCodeableConcept = { text: o.codedConcept.nom };
  } else if (o.valeurTexte) {
    res.valueString = o.valeurTexte;
  }
  return res;
}

export interface VitalRow {
  id: number; patientId: number;
  temperature?: unknown; tensionSystolique?: number | null; tensionDiastolique?: number | null;
  pouls?: number | null; frequenceRespiratoire?: number | null; saturationO2?: number | null;
  poids?: unknown; taille?: unknown; glycemie?: unknown;
  dateMesure?: Date | string | null;
}

// A Vital row holds several measurements; emit one coded Observation per
// non-null field, id-suffixed so each has a unique logical id.
export function vitalToFhirObservations(v: VitalRow): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const [field, meta] of Object.entries(VITAL_LOINC)) {
    const raw = (v as unknown as Record<string, unknown>)[field];
    if (raw === null || raw === undefined) continue;
    out.push({
      resourceType: 'Observation',
      id: `vital-${v.id}-${field}`,
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: meta.code, display: meta.display }], text: meta.display },
      subject: { reference: `Patient/${v.patientId}` },
      effectiveDateTime: iso(v.dateMesure),
      valueQuantity: { value: Number(raw), unit: meta.unit, system: 'http://unitsofmeasure.org', code: meta.unit },
    });
  }
  return out;
}

export interface EncounterRow {
  id: number; patientId: number; dateEncounter?: Date | string | null; notes?: string | null;
  encounterType?: { nom: string } | null;
  provider?: { nom?: string | null; prenom?: string | null } | null;
  service?: { nom: string } | null;
}

export function encounterToFhir(e: EncounterRow): Record<string, unknown> {
  const res: Record<string, unknown> = {
    resourceType: 'Encounter',
    id: String(e.id),
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${e.patientId}` },
    period: { start: iso(e.dateEncounter) },
  };
  if (e.encounterType?.nom) res.type = [{ text: e.encounterType.nom }];
  if (e.provider && (e.provider.nom || e.provider.prenom)) {
    res.participant = [{ individual: { display: `${e.provider.prenom ?? ''} ${e.provider.nom ?? ''}`.trim() } }];
  }
  if (e.service?.nom) res.serviceType = { text: e.service.nom };
  return res;
}

export interface PrescriptionRow {
  id: number; patientId: number; medicament: string;
  dosage?: string | null; frequence?: string | null; duree?: string | null; voie?: string | null;
  instructions?: string | null; statut?: string | null; dateDebut?: Date | string | null;
  medecin?: { nom?: string | null; prenom?: string | null } | null;
}

function mapMedStatus(statut: string | null | undefined): string {
  switch (statut) {
    case 'active': return 'active';
    case 'terminee': case 'terminée': return 'completed';
    case 'annulee': case 'annulée': return 'cancelled';
    case 'suspendue': return 'on-hold';
    default: return 'unknown';
  }
}

export function prescriptionToFhir(p: PrescriptionRow): Record<string, unknown> {
  const dosageText = [p.dosage, p.frequence, p.duree, p.voie, p.instructions].filter(Boolean).join(' • ');
  const res: Record<string, unknown> = {
    resourceType: 'MedicationRequest',
    id: String(p.id),
    status: mapMedStatus(p.statut),
    intent: 'order',
    medicationCodeableConcept: { text: p.medicament },
    subject: { reference: `Patient/${p.patientId}` },
    authoredOn: iso(p.dateDebut),
  };
  if (p.medecin && (p.medecin.nom || p.medecin.prenom)) {
    res.requester = { display: `Dr. ${p.medecin.prenom ?? ''} ${p.medecin.nom ?? ''}`.trim() };
  }
  if (dosageText) res.dosageInstruction = [{ text: dosageText }];
  return res;
}

/** Wrap resources in a FHIR searchset Bundle. */
export function bundle(resources: Array<Record<string, unknown>>, baseUrl: string): Record<string, unknown> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map(r => ({
      fullUrl: `${baseUrl}/${r.resourceType}/${r.id}`,
      resource: r,
    })),
  };
}

/** FHIR OperationOutcome — the standard error envelope. */
export function operationOutcome(severity: string, code: string, diagnostics: string): Record<string, unknown> {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity, code, diagnostics }],
  };
}

/** CapabilityStatement advertising what this server supports. */
export function capabilityStatement(baseUrl: string): Record<string, unknown> {
  const ro = [{ code: 'read' }, { code: 'search-type' }];
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    software: { name: 'Hospital ERP FHIR facade' },
    implementation: { description: 'Read-only FHIR R4 facade', url: baseUrl },
    fhirVersion: FHIR_VERSION,
    format: ['application/fhir+json', 'json'],
    rest: [{
      mode: 'server',
      resource: [
        { type: 'Patient', interaction: ro, searchParam: [{ name: 'name', type: 'string' }, { name: '_count', type: 'number' }] },
        { type: 'Observation', interaction: ro, searchParam: [{ name: 'patient', type: 'reference' }] },
        { type: 'Encounter', interaction: ro, searchParam: [{ name: 'patient', type: 'reference' }] },
        { type: 'MedicationRequest', interaction: ro, searchParam: [{ name: 'patient', type: 'reference' }] },
      ],
    }],
  };
}
