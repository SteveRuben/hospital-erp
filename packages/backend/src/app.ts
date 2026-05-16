/**
 * Express app construction.
 *
 * Lives separately from index.ts so tests (supertest) can import the app
 * without triggering `initDB()` or `app.listen()`. index.ts is now the
 * thin process entry point that boots the DB and starts listening.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { enforceHttps, sanitizeInput, globalRateLimit, authRateLimit, validateContentType, errorHandler } from './middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import authRoutes from './routes/auth.js';
import patientsRoutes from './routes/patients.js';
import medecinsRoutes from './routes/medecins.js';
import servicesRoutes from './routes/services.js';
import consultationsRoutes from './routes/consultations.js';
import financesRoutes from './routes/finances.js';
import laboratoireRoutes from './routes/laboratoire.js';
import dashboardRoutes from './routes/dashboard.js';
import rendezvousRoutes from './routes/rendezvous.js';
import vitauxRoutes from './routes/vitaux.js';
import allergiesRoutes from './routes/allergies.js';
import pathologiesRoutes from './routes/pathologies.js';
import prescriptionsRoutes from './routes/prescriptions.js';
import ordonnancesRoutes from './routes/ordonnances.js';
import vaccinationsRoutes from './routes/vaccinations.js';
import notesRoutes from './routes/notes.js';
import alertesRoutes from './routes/alertes.js';
import visitesRoutes from './routes/visites.js';
import fileAttenteRoutes from './routes/file-attente.js';
import listesPatientsRoutes from './routes/listes-patients.js';
import litsRoutes from './routes/lits.js';
import programmesRoutes from './routes/programmes.js';
import facturationRoutes from './routes/facturation.js';
import notificationsRoutes from './routes/notifications.js';
import printRoutes from './routes/print.js';
import importRoutes from './routes/import.js';
import habilitationsRoutes from './routes/habilitations.js';
import exportRoutes from './routes/export.js';
import portailRoutes from './routes/portail.js';
import imagerieRoutes from './routes/imagerie.js';
import conceptsRoutes from './routes/concepts.js';
import encountersRoutes from './routes/encounters.js';
import ordersRoutes from './routes/orders.js';
import pharmacieRoutes from './routes/pharmacie.js';
import patientMergeRoutes from './routes/patient-merge.js';
import reportsRoutes from './routes/reports.js';
import planningRoutes from './routes/planning.js';
import settingsRoutes from './routes/settings.js';
import referenceListsRoutes from './routes/reference-lists.js';
import adminRoutes from './routes/admin.js';

const app = express();

// Trust Railway reverse proxy
app.set('trust proxy', 1);

// OWASP A05 - CORS (must be BEFORE helmet)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(s => s.trim());
// OWASP A04: auth runs through Authorization: Bearer (localStorage), not cookies.
// credentials:false removes a latent CSRF surface if a future feature adds a cookie.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
}));

// OWASP A05 - Security headers (after CORS)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// OWASP A02 - Enforce HTTPS in production
app.use(enforceHttps);

// OWASP A04 - Rate limiting global
app.use(globalRateLimit);

// Body parsing with size limit (OWASP A08)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// OWASP A03 - Input sanitization
app.use(sanitizeInput);

// OWASP A08 - Content-Type validation
app.use(validateContentType);

// Disable X-Powered-By
app.disable('x-powered-by');

// Rate limit on auth routes (brute force protection)
app.use('/api/auth/login', authRateLimit);

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/medecins', medecinsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/consultations', consultationsRoutes);
app.use('/api/finances', financesRoutes);
app.use('/api/laboratoire', laboratoireRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rendezvous', rendezvousRoutes);
app.use('/api/vitaux', vitauxRoutes);
app.use('/api/allergies', allergiesRoutes);
app.use('/api/pathologies', pathologiesRoutes);
app.use('/api/prescriptions', prescriptionsRoutes);
app.use('/api/ordonnances', ordonnancesRoutes);
app.use('/api/vaccinations', vaccinationsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/alertes', alertesRoutes);
app.use('/api/visites', visitesRoutes);
app.use('/api/file-attente', fileAttenteRoutes);
app.use('/api/listes-patients', listesPatientsRoutes);
app.use('/api/lits', litsRoutes);
app.use('/api/programmes', programmesRoutes);
app.use('/api/facturation', facturationRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/print', printRoutes);
app.use('/api/import', importRoutes);
app.use('/api/habilitations', habilitationsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/portail', portailRoutes);
app.use('/api/imagerie', imagerieRoutes);
app.use('/api/concepts', conceptsRoutes);
app.use('/api/encounters', encountersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/pharmacie', pharmacieRoutes);
app.use('/api/patients', patientMergeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reference-lists', referenceListsRoutes);
app.use('/api/admin', adminRoutes);

// Serve uploaded files
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files in production
const frontendPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// SPA fallback — all non-API, non-asset routes serve index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/assets/') || req.path.match(/\.(js|css|map|png|jpg|svg|ico|woff|woff2|ttf)$/)) {
    res.status(404).end();
    return;
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global error handler (catches unhandled errors from asyncHandler)
app.use(errorHandler);

export default app;
