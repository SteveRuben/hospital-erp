-- Patient Parcours: Kanban tracking a patient through the care journey
-- triage → consultation → examens → traitement → sortie

-- Enum for parcours steps
CREATE TYPE "ParcoursStatut" AS ENUM ('triage', 'consultation', 'examens', 'traitement', 'sortie');

CREATE TABLE parcours_patient (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  statut "ParcoursStatut" NOT NULL DEFAULT 'triage',
  service_id INTEGER REFERENCES services(id),
  medecin_user_id INTEGER REFERENCES users(id),
  priorite VARCHAR(20) DEFAULT 'normal',
  motif VARCHAR(500),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  date_entree TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_triage TIMESTAMP,
  date_consultation TIMESTAMP,
  date_examens TIMESTAMP,
  date_traitement TIMESTAMP,
  date_sortie TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parcours_patient_statut ON parcours_patient(statut);
CREATE INDEX idx_parcours_patient_patient_id ON parcours_patient(patient_id);
CREATE INDEX idx_parcours_patient_medecin ON parcours_patient(medecin_user_id);
CREATE INDEX idx_parcours_patient_date ON parcours_patient(date_entree DESC);
