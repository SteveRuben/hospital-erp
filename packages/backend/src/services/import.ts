// CSV/TXT parser — no external dependency needed
export interface ParsedRow {
  [key: string]: string;
}

export const parseCsv = (content: string, delimiter?: string): ParsedRow[] => {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Auto-detect delimiter
  const sep = delimiter || (lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',');

  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/\s+/g, '_'));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(sep).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: ParsedRow = {};
    headers.forEach((h, j) => { row[h] = values[j] || ''; });
    rows.push(row);
  }

  return rows;
};

// Map imported fields to DB fields
export const mapPatientFields = (row: ParsedRow): Record<string, string | null> => {
  const n = (v: string | undefined) => (v && v.trim()) || null;
  return {
    nom: n(row.nom || row.name || row.last_name || row.nom_famille) || '',
    prenom: n(row.prenom || row.first_name || row.prenom_usuel) || '',
    sexe: n(row.sexe || row.genre || row.sex || row.gender),
    date_naissance: n(row.date_naissance || row.dob || row.birth_date || row.date_de_naissance),
    telephone: n(row.telephone || row.tel || row.phone || row.mobile),
    email: n(row.email || row.mail || row.courriel),
    adresse: n(row.adresse || row.address || row.adresse_complete),
    ville: n(row.ville || row.city),
    profession: n(row.profession || row.job || row.metier),
    nationalite: n(row.nationalite || row.nationality),
    contact_urgence_nom: n(row.contact_urgence || row.contact_urgence_nom || row.emergency_contact),
    contact_urgence_telephone: n(row.contact_urgence_telephone || row.contact_urgence_tel || row.emergency_phone),
  };
};

export const mapMedecinFields = (row: ParsedRow): Record<string, string | null> => {
  const n = (v: string | undefined) => (v && v.trim()) || null;
  return {
    nom: n(row.nom || row.name || row.last_name) || '',
    prenom: n(row.prenom || row.first_name) || '',
    specialite: n(row.specialite || row.specialty || row.speciality),
    telephone: n(row.telephone || row.tel || row.phone),
  };
};

export const mapTarifFields = (row: ParsedRow): Record<string, string | null> => {
  const n = (v: string | undefined) => (v && v.trim()) || null;
  return {
    code: n(row.code) || '',
    libelle: n(row.libelle || row.label || row.designation || row.description) || '',
    categorie: n(row.categorie || row.category || row.type) || '',
    montant: n(row.montant || row.prix || row.price || row.amount) || '0',
  };
};

export const mapUserFields = (row: ParsedRow): Record<string, string | null> => {
  const n = (v: string | undefined) => (v && v.trim()) || null;
  return {
    username: n(row.username || row.login || row.identifiant) || '',
    role: n(row.role || row.profil || row.profile) || 'reception',
    nom: n(row.nom || row.name || row.last_name),
    prenom: n(row.prenom || row.first_name),
    telephone: n(row.telephone || row.tel || row.phone),
  };
};