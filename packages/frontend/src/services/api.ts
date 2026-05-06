import axios from 'axios';
import type { User, Patient, Medecin, Service, Consultation, Recette, Depense, Examen, DashboardStats, Bilan, RendezVous } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login?expired=1';
    }
    return Promise.reject(err);
  }
);

export const login = (data: { username: string; password: string }) => api.post('/auth/login', data);
export const getMe = () => api.get<User>('/auth/me');
export const getUsers = () => api.get<User[]>('/auth/users');
export const createUser = (data: unknown) => api.post('/auth/users', data);

export const getPatients = (params?: { search?: string; archived?: string; page?: string; limit?: string }) => api.get<{ data: Patient[]; total: number; page: number; limit: number; totalPages: number }>('/patients', { params });
export const getPatient = (id: number) => api.get<Patient>(`/patients/${id}`);
export const createPatient = (data: unknown) => api.post<Patient>('/patients', data);
export const updatePatient = (id: number, data: unknown) => api.put<Patient>(`/patients/${id}`, data);
export const deletePatient = (id: number) => api.delete(`/patients/${id}`);
export const getPatientHistorique = (id: number) => api.get(`/patients/${id}/historique`);

export const getMedecins = () => api.get<Medecin[]>('/medecins');
export const createMedecin = (data: unknown) => api.post<Medecin>('/medecins', data);
export const updateMedecin = (id: number, data: unknown) => api.put<Medecin>(`/medecins/${id}`, data);
export const deleteMedecin = (id: number) => api.delete(`/medecins/${id}`);

export const getServices = () => api.get<Service[]>('/services');
export const createService = (data: unknown) => api.post<Service>('/services', data);
export const updateService = (id: number, data: unknown) => api.put<Service>(`/services/${id}`, data);
export const deleteService = (id: number) => api.delete(`/services/${id}`);

export const getConsultations = (params?: unknown) => api.get<Consultation[]>('/consultations', { params });
export const createConsultation = (data: unknown) => api.post<Consultation>('/consultations', data);
export const updateConsultation = (id: number, data: unknown) => api.put<Consultation>(`/consultations/${id}`, data);
export const deleteConsultation = (id: number) => api.delete(`/consultations/${id}`);

export const getRecettes = (params?: unknown) => api.get<Recette[]>('/finances/recettes', { params });
export const createRecette = (data: unknown) => api.post<Recette>('/finances/recettes', data);
export const deleteRecette = (id: number) => api.delete(`/finances/recettes/${id}`);

export const getDepenses = (params?: unknown) => api.get<Depense[]>('/finances/depenses', { params });
export const createDepense = (data: unknown) => api.post<Depense>('/finances/depenses', data);
export const deleteDepense = (id: number) => api.delete(`/finances/depenses/${id}`);

export const getCaisse = () => api.get('/finances/caisse');
export const getBilan = (params?: { annee?: number; mois?: number }) => api.get<Bilan>('/finances/bilan', { params });

export const getExamens = (params?: unknown) => api.get<Examen[]>('/laboratoire', { params });
export const createExamen = (data: unknown) => api.post<Examen>('/laboratoire', data);
export const updateExamen = (id: number, data: unknown) => api.put<Examen>(`/laboratoire/${id}`, data);
export const deleteExamen = (id: number) => api.delete(`/laboratoire/${id}`);

export const getDashboard = () => api.get<DashboardStats>('/dashboard');

export default api;

// Rendez-vous
export const getRendezVous = (params?: unknown) => api.get<RendezVous[]>('/rendezvous', { params });
export const getRendezVousToday = () => api.get<RendezVous[]>('/rendezvous/today');
export const createRendezVous = (data: unknown) => api.post<RendezVous>('/rendezvous', data);
export const updateRendezVous = (id: number, data: unknown) => api.put<RendezVous>(`/rendezvous/${id}`, data);
export const updateRendezVousStatut = (id: number, statut: string) => api.put(`/rendezvous/${id}/statut`, { statut });
export const deleteRendezVous = (id: number) => api.delete(`/rendezvous/${id}`);

// Signes vitaux
export const getVitaux = (patientId: number) => api.get(`/vitaux/${patientId}`);
export const createVitaux = (data: unknown) => api.post('/vitaux', data);

// Allergies
export const getAllergies = (patientId: number) => api.get(`/allergies/${patientId}`);
export const createAllergie = (data: unknown) => api.post('/allergies', data);
export const updateAllergie = (id: number, data: unknown) => api.put(`/allergies/${id}`, data);
export const deleteAllergie = (id: number) => api.delete(`/allergies/${id}`);

// Pathologies
export const getPathologies = (patientId: number) => api.get(`/pathologies/${patientId}`);
export const createPathologie = (data: unknown) => api.post('/pathologies', data);
export const updatePathologie = (id: number, data: unknown) => api.put(`/pathologies/${id}`, data);
export const deletePathologie = (id: number) => api.delete(`/pathologies/${id}`);

// Prescriptions
export const getPrescriptions = (patientId: number) => api.get(`/prescriptions/${patientId}`);
export const createPrescription = (data: unknown) => api.post('/prescriptions', data);
export const updatePrescriptionStatut = (id: number, statut: string) => api.put(`/prescriptions/${id}/statut`, { statut });

// Ordonnances
export const getOrdonnances = (patientId: number) => api.get(`/ordonnances/${patientId}`);
export const createOrdonnance = (data: unknown) => api.post('/ordonnances', data);
export const updateOrdonnanceStatut = (id: number, statut: string) => api.put(`/ordonnances/${id}/statut`, { statut });

// Vaccinations
export const getVaccinations = (patientId: number) => api.get(`/vaccinations/${patientId}`);
export const createVaccination = (data: unknown) => api.post('/vaccinations', data);

// Notes
export const getNotes = (patientId: number) => api.get(`/notes/${patientId}`);
export const createNote = (data: unknown) => api.post('/notes', data);
export const deleteNote = (id: number) => api.delete(`/notes/${id}`);

// Alertes
export const getAlertes = (patientId: number, active?: boolean) => api.get(`/alertes/${patientId}`, { params: { active } });
export const createAlerte = (data: unknown) => api.post('/alertes', data);
export const toggleAlerte = (id: number) => api.put(`/alertes/${id}/toggle`);

// Formulaires
export const getFormulaires = () => api.get('/formulaires');
export const createFormulaire = (data: unknown) => api.post('/formulaires', data);
export const getFormulaireReponses = (patientId: number) => api.get(`/formulaires/reponses/${patientId}`);
export const submitFormulaireReponse = (data: unknown) => api.post('/formulaires/reponses', data);

// Visites actives
export const getVisites = (params?: unknown) => api.get('/visites', { params });
export const getVisitesStats = () => api.get('/visites/stats');
export const createVisite = (data: unknown) => api.post('/visites', data);
export const terminerVisite = (id: number) => api.put(`/visites/${id}/terminer`);

// File d'attente
export const getFileAttente = (params?: unknown) => api.get('/file-attente', { params });
export const getFileAttenteStats = () => api.get('/file-attente/stats');
export const addToFileAttente = (data: unknown) => api.post('/file-attente', data);
export const updateFileAttenteStatut = (id: number, statut: string) => api.put(`/file-attente/${id}/statut`, { statut });
export const removeFromFileAttente = (id: number) => api.delete(`/file-attente/${id}`);

// Listes de patients
export const getListesPatients = () => api.get('/listes-patients');
export const getListePatients = (id: number) => api.get(`/listes-patients/${id}`);
export const createListePatients = (data: unknown) => api.post('/listes-patients', data);
export const deleteListePatients = (id: number) => api.delete(`/listes-patients/${id}`);
export const addPatientToListe = (listeId: number, patient_id: number) => api.post(`/listes-patients/${listeId}/patients`, { patient_id });
export const removePatientFromListe = (listeId: number, patientId: number) => api.delete(`/listes-patients/${listeId}/patients/${patientId}`);

// Lits & Hospitalisations
export const getPavillons = () => api.get('/lits/pavillons');
export const createPavillon = (data: unknown) => api.post('/lits/pavillons', data);
export const getLits = (params?: unknown) => api.get('/lits', { params });
export const createLit = (data: unknown) => api.post('/lits', data);
export const updateLitStatut = (id: number, statut: string) => api.put(`/lits/${id}/statut`, { statut });
export const getHospitalisations = (params?: unknown) => api.get('/lits/hospitalisations', { params });
export const createHospitalisation = (data: unknown) => api.post('/lits/hospitalisations', data);
export const sortieHospitalisation = (id: number) => api.put(`/lits/hospitalisations/${id}/sortie`);
export const getLitsStats = () => api.get('/lits/stats');

// Programmes de soins
export const getProgrammes = () => api.get('/programmes');
export const getProgramme = (id: number) => api.get(`/programmes/${id}`);
export const createProgramme = (data: unknown) => api.post('/programmes', data);
export const addPatientToProgramme = (progId: number, patient_id: number) => api.post(`/programmes/${progId}/patients`, { patient_id });
export const deleteProgramme = (id: number) => api.delete(`/programmes/${id}`);

// Facturation
export const getTarifs = (params?: unknown) => api.get('/facturation/tarifs', { params });
export const createTarif = (data: unknown) => api.post('/facturation/tarifs', data);
export const updateTarif = (id: number, data: unknown) => api.put(`/facturation/tarifs/${id}`, data);
export const getFactures = (params?: unknown) => api.get('/facturation/factures', { params });
export const getFacture = (id: number) => api.get(`/facturation/factures/${id}`);
export const createFacture = (data: unknown) => api.post('/facturation/factures', data);
export const createPaiement = (data: unknown) => api.post('/facturation/paiements', data);

// Notifications
export const sendNotificationToPatient = (data: { patient_id: number; subject: string; message: string }) => api.post('/notifications/send', data);
export const sendRappelRdv = (rdvId: number) => api.post(`/notifications/rappel-rdv/${rdvId}`);
export const sendResultatLabo = (examenId: number) => api.post(`/notifications/resultat-labo/${examenId}`);
export const getNotificationLog = (patientId: number) => api.get(`/notifications/log/${patientId}`);

// Print (returns HTML)
export const printFacture = (id: number) => window.open(`${API_URL}/print/facture/${id}?token=${localStorage.getItem('token')}`, '_blank');
export const printOrdonnance = (patientId: number, medecinId?: number) => window.open(`${API_URL}/print/ordonnance/${patientId}?medecin_id=${medecinId || ''}&token=${localStorage.getItem('token')}`, '_blank');
export const printResultatLabo = (patientId: number) => window.open(`${API_URL}/print/labo/${patientId}?token=${localStorage.getItem('token')}`, '_blank');

// Impersonation
export const impersonateUser = (userId: number) => api.post(`/auth/impersonate/${userId}`);
export const stopImpersonate = (adminId: number) => api.post('/auth/stop-impersonate', { admin_id: adminId });

// Import
export const importFile = (type: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/import/${type}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const downloadTemplate = (type: string) => window.open(`${API_URL}/import/template/${type}?token=${localStorage.getItem('token')}`, '_blank');

// Habilitations
export const getHabilitations = () => api.get('/habilitations');
export const getMyHabilitations = () => api.get('/habilitations/me');
export const updateHabilitation = (data: { role: string; module: string; acces: boolean }) => api.put('/habilitations', data);
export const getMenuConfig = () => api.get('/habilitations/menu');
export const updateMenuItem = (id: number, data: unknown) => api.put(`/habilitations/menu/${id}`, data);
export const updateMenuOrder = (items: Array<{ id: number; groupe: string; groupe_ordre: number; ordre: number }>) => api.put('/habilitations/menu-order', { items });

// Quick search
export const quickSearchPatients = (q: string) => api.get('/patients/search/quick', { params: { q } });
export const advancedSearchPatients = (params: unknown) => api.get('/patients/search/advanced', { params });

// Change password
export const changePassword = (data: { old_password: string; new_password: string }) => api.post('/auth/change-password', data);

// Export CSV
export const exportRecettes = (params?: { debut?: string; fin?: string }) => window.open(`${API_URL}/export/recettes?debut=${params?.debut || ''}&fin=${params?.fin || ''}&token=${localStorage.getItem('token')}`, '_blank');
export const exportDepenses = (params?: { debut?: string; fin?: string }) => window.open(`${API_URL}/export/depenses?debut=${params?.debut || ''}&fin=${params?.fin || ''}&token=${localStorage.getItem('token')}`, '_blank');
export const exportPatients = () => window.open(`${API_URL}/export/patients?token=${localStorage.getItem('token')}`, '_blank');

// Étiquette patient
export const printEtiquette = (patientId: number) => window.open(`${API_URL}/export/etiquette/${patientId}?token=${localStorage.getItem('token')}`, '_blank');

// Concepts
export const getConcepts = (params?: unknown) => api.get('/concepts', { params });
export const getConcept = (id: number) => api.get(`/concepts/${id}`);
export const createConcept = (data: unknown) => api.post('/concepts', data);
export const updateConcept = (id: number, data: unknown) => api.put(`/concepts/${id}`, data);
export const addConceptMapping = (id: number, data: unknown) => api.post(`/concepts/${id}/mappings`, data);

// Encounters
export const getEncounterTypes = () => api.get('/encounters/types');
export const getPatientEncounters = (patientId: number) => api.get(`/encounters/patient/${patientId}`);
export const getEncounter = (id: number) => api.get(`/encounters/${id}`);
export const createEncounter = (data: unknown) => api.post('/encounters', data);
export const addObservation = (encounterId: number, data: unknown) => api.post(`/encounters/${encounterId}/observations`, data);

// Orders
export const getPatientOrders = (patientId: number, params?: unknown) => api.get(`/orders/patient/${patientId}`, { params });
export const getOrders = (params?: unknown) => api.get('/orders', { params });
export const createOrder = (data: unknown) => api.post('/orders', data);
export const updateOrderStatut = (id: number, data: { statut: string; resultat?: string }) => api.put(`/orders/${id}/statut`, data);

// Pharmacie
export const getMedicaments = (params?: unknown) => api.get('/pharmacie/medicaments', { params });
export const createMedicament = (data: unknown) => api.post('/pharmacie/medicaments', data);
export const getStock = () => api.get('/pharmacie/stock');
export const createStock = (data: unknown) => api.post('/pharmacie/stock', data);
export const createMouvement = (data: unknown) => api.post('/pharmacie/mouvements', data);
export const getMouvements = () => api.get('/pharmacie/mouvements');
export const createDispensation = (data: unknown) => api.post('/pharmacie/dispensations', data);
export const getPharmacieAlertes = () => api.get('/pharmacie/alertes');

// Patient merge
export const getPatientDuplicates = () => api.get('/patients/duplicates');
export const mergePatients = (keep_id: number, merge_id: number) => api.post('/patients/merge', { keep_id, merge_id });

// Carte patient
export const printCartePatient = (patientId: number) => window.open(`${API_URL}/export/carte/${patientId}?token=${localStorage.getItem('token')}`, '_blank');