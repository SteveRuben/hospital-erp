export type UserRole = 'admin' | 'medecin' | 'comptable' | 'laborantin' | 'reception';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  nom: string;
  prenom: string;
  telephone?: string;
}

export interface Patient {
  id: number;
  nom: string;
  prenom: string;
  deuxieme_prenom?: string;
  sexe?: 'M' | 'F' | 'autre';
  date_naissance?: string;
  age_estime?: number;
  lieu_naissance?: string;
  nationalite?: string;
  numero_identite?: string;
  statut_matrimonial?: 'celibataire' | 'marie' | 'divorce' | 'veuf';
  groupe_sanguin?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  pays?: string;
  province?: string;
  ville?: string;
  commune?: string;
  quartier?: string;
  adresse?: string;
  profession?: string;
  telephone?: string;
  email?: string;
  contact_urgence_nom?: string;
  contact_urgence_relation?: string;
  contact_urgence_telephone?: string;
  photo_url?: string;
  archived: boolean;
  created_at: string;
}

export interface Medecin {
  id: number;
  nom: string;
  prenom: string;
  specialite?: string;
  telephone?: string;
}

export interface Service {
  id: number;
  nom: string;
  description?: string;
}

export interface Consultation {
  id: number;
  patient_id: number;
  medecin_id: number;
  service_id: number;
  date_consultation: string;
  diagnostic?: string;
  traitement?: string;
  notes?: string;
  patient_nom?: string;
  patient_prenom?: string;
  medecin_nom?: string;
  medecin_prenom?: string;
  specialite?: string;
  service_nom?: string;
}

export interface Recette {
  id: number;
  patient_id?: number;
  service_id?: number;
  type_acte: string;
  montant: number;
  mode_paiement: 'especes' | 'mobile_money' | 'carte';
  date_recette: string;
  description?: string;
  patient_nom?: string;
  patient_prenom?: string;
  service_nom?: string;
}

export interface Depense {
  id: number;
  type_depense: string;
  nature?: string;
  montant: number;
  fournisseur?: string;
  description?: string;
  date_depense: string;
}

export interface Examen {
  id: number;
  patient_id: number;
  type_examen: string;
  resultat?: string;
  date_examen: string;
  montant?: number;
  patient_nom?: string;
  patient_prenom?: string;
}

export interface DashboardStats {
  patients: { total: number; nouveaux: number };
  consultations: { aujourdhui: number };
  caisse: {
    jour: { recettes: number; depenses: number; solde: number };
    mois: { recettes: number; depenses: number; solde: number };
  };
  servicesActifs: Array<{ nom: string; nb_consultations: number }>;
  medecinsActifs: Array<{ nom: string; prenom: string; specialite?: string; nb_consultations: number }>;
}

export interface Bilan {
  periode: { debut: string; fin: string };
  recettes: Array<{ type_acte: string; total: string }>;
  depenses: Array<{ type_depense: string; total: string }>;
  totalRecettes: number;
  totalDepenses: number;
  resultatNet: number;
}

export type StatutRdv = 'planifie' | 'confirme' | 'en_cours' | 'termine' | 'annule' | 'absent';

export interface RendezVous {
  id: number;
  patient_id: number;
  medecin_id: number;
  service_id: number;
  date_rdv: string;
  motif?: string;
  statut: StatutRdv;
  notes?: string;
  patient_nom?: string;
  patient_prenom?: string;
  patient_telephone?: string;
  medecin_nom?: string;
  medecin_prenom?: string;
  service_nom?: string;
}