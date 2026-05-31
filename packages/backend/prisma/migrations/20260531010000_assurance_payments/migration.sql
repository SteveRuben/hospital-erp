-- Assurance, prise en charge (tiers payant) et payment intents
-- (suivi Remita / autres agrégateurs MM-Carte).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PriseEnChargeStatut') THEN
    CREATE TYPE "PriseEnChargeStatut" AS ENUM ('en_attente','accordee','refusee','payee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentIntentStatut') THEN
    CREATE TYPE "PaymentIntentStatut" AS ENUM ('pending','paid','failed','cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS assurances (
  id          SERIAL PRIMARY KEY,
  nom         VARCHAR(200) NOT NULL,
  code        VARCHAR(50) UNIQUE,
  contact     VARCHAR(200),
  taux_defaut DECIMAL(5,2) DEFAULT 80,
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prises_en_charge (
  id                  SERIAL PRIMARY KEY,
  assurance_id        INTEGER NOT NULL REFERENCES assurances(id),
  patient_id          INTEGER NOT NULL REFERENCES patients(id),
  examen_id           INTEGER REFERENCES examens(id) ON DELETE SET NULL,
  facture_id          INTEGER REFERENCES factures(id) ON DELETE SET NULL,
  numero_police       VARCHAR(100) NOT NULL,
  montant_total       DECIMAL(12,2) NOT NULL,
  montant_assurance   DECIMAL(12,2) NOT NULL,
  montant_patient     DECIMAL(12,2) NOT NULL,
  statut              "PriseEnChargeStatut" NOT NULL DEFAULT 'en_attente',
  notes               TEXT,
  created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pec_patient ON prises_en_charge(patient_id);
CREATE INDEX IF NOT EXISTS idx_pec_statut  ON prises_en_charge(statut);

CREATE TABLE IF NOT EXISTS payment_intents (
  id                  SERIAL PRIMARY KEY,
  reference           VARCHAR(100) NOT NULL UNIQUE,
  provider            VARCHAR(30) NOT NULL,
  mode                VARCHAR(30) NOT NULL,
  examen_id           INTEGER REFERENCES examens(id) ON DELETE SET NULL,
  facture_id          INTEGER REFERENCES factures(id) ON DELETE SET NULL,
  patient_id          INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  montant             DECIMAL(12,2) NOT NULL,
  phone               VARCHAR(30),
  external_ref        VARCHAR(200),
  ussd_code           VARCHAR(60),
  statut              "PaymentIntentStatut" NOT NULL DEFAULT 'pending',
  error_message       TEXT,
  created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pi_statut ON payment_intents(statut);
CREATE INDEX IF NOT EXISTS idx_pi_examen ON payment_intents(examen_id);

-- Quelques assurances par défaut pour ne pas démarrer vide.
INSERT INTO assurances (nom, code, taux_defaut, actif) VALUES
  ('Mutuelle Nationale', 'MN', 80, TRUE),
  ('Assurance Privée Cameroun', 'APC', 70, TRUE),
  ('IPRES (CIPRES)', 'IPRES', 100, TRUE)
ON CONFLICT (code) DO NOTHING;
