// User roles
export type UserRole = 'admin' | 'medecin' | 'comptable' | 'laborantin' | 'reception';

// User model
export interface User {
  id: number;
  username: string;
  password: string;
  role: UserRole;
  nom: string;
  prenom: string;
  telephone?: string;
  created_at: Date;
}

// Patient model
export interface Patient {
  id: number;
  nom: string;
  prenom: string;
  date_naissance?: string;
  lieu_naissance?: string;
  adresse?: string;
  profession?: string;
  telephone?: string;
  contact_urgence?: string;
  archived: boolean;
  created_at: Date;
}

// Médecin model
export interface Medecin {
  id: number;
  nom: string;
  prenom: string;
  specialite?: string;
  telephone?: string;
  created_at: Date;
}

// Service model
export interface Service {
  id: number;
  nom: string;
  description?: string;
  created_at: Date;
}

// Consultation model
export interface Consultation {
  id: number;
  patient_id: number;
  medecin_id: number;
  service_id: number;
  date_consultation: Date;
  diagnostic?: string;
  traitement?: string;
  notes?: string;
}

// Recette model
export interface Recette {
  id: number;
  patient_id?: number;
  service_id?: number;
  type_acte: string;
  montant: number;
  mode_paiement: 'especes' | 'mobile_money' | 'carte';
  date_recette: Date;
  description?: string;
  created_at: Date;
}

// Dépense model
export interface Depense {
  id: number;
  type_depense: string;
  nature?: string;
  montant: number;
  fournisseur?: string;
  description?: string;
  date_depense: Date;
  created_at: Date;
}

// Examen model
export interface Examen {
  id: number;
  patient_id: number;
  type_examen: string;
  resultat?: string;
  date_examen: Date;
  montant?: number;
  created_at: Date;
}

// Document model
export interface Document {
  id: number;
  patient_id: number;
  type_document: 'ordonnance' | 'resultat' | 'imagerie';
  fichier_url?: string;
  description?: string;
  created_at: Date;
}

// Audit log model
export interface AuditLog {
  id: number;
  user_id: number;
  action: string;
  table_name: string;
  record_id?: number;
  details?: string;
  created_at: Date;
}

// JWT Payload
export interface JWTPayload {
  id: number;
  username: string;
  role: UserRole;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// Dashboard stats
export interface DashboardStats {
  patients: {
    total: number;
    nouveaux: number;
  };
  consultations: {
    aujourdhui: number;
  };
  caisse: {
    jour: {
      recettes: number;
      depenses: number;
      solde: number;
    };
    mois: {
      recettes: number;
      depenses: number;
      solde: number;
    };
  };
  servicesActifs: Array<{ nom: string; nb_consultations: number }>;
  medecinsActifs: Array<{ nom: string; prenom: string; specialite?: string; nb_consultations: number }>;
}

// Bilan
export interface Bilan {
  periode: { debut: string; fin: string };
  recettes: Array<{ type_acte: string; total: string }>;
  depenses: Array<{ type_depense: string; total: string }>;
  totalRecettes: number;
  totalDepenses: number;
  resultatNet: number;
}