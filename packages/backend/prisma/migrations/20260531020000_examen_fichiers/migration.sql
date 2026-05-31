-- Pièces jointes sur examens de labo : scans de résultats, photos
-- de lame, PDFs d'analyseur. Visibles dès le statut 'analyse',
-- conservées tout le long du cycle (resultat / valide / transmis).
-- Cascade pour qu'un examen supprimé libère ses fichiers.

CREATE TABLE IF NOT EXISTS examen_fichiers (
  id               SERIAL PRIMARY KEY,
  examen_id        INTEGER NOT NULL REFERENCES examens(id) ON DELETE CASCADE,
  fichier_url      TEXT NOT NULL,
  fichier_nom      VARCHAR(255) NOT NULL,
  fichier_type     VARCHAR(100),
  fichier_taille   INTEGER,
  notes            VARCHAR(500),
  uploaded_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_examen_fichiers_examen ON examen_fichiers(examen_id);
