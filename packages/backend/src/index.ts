import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { enforceHttps, sanitizeInput, globalRateLimit, authRateLimit, validateContentType, auditLog, errorHandler } from './middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import initDB from './config/init.js';
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
import formulairesRoutes from './routes/formulaires.js';
import visitesRoutes from './routes/visites.js';
import fileAttenteRoutes from './routes/file-attente.js';
import listesPatientsRoutes from './routes/listes-patients.js';

const app = express();
const PORT = process.env.PORT || 5000;

// OWASP A05 - Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// OWASP A05 - CORS
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(s => s.trim());
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
  credentials: true,
  maxAge: 86400,
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

// OWASP A09 - Audit logging
app.use(auditLog);

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
app.use('/api/formulaires', formulairesRoutes);
app.use('/api/visites', visitesRoutes);
app.use('/api/file-attente', fileAttenteRoutes);
app.use('/api/listes-patients', listesPatientsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OWASP A05 - 404 handler
app.use(((_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'Route non trouvée' });
}) as unknown as express.RequestHandler);

// OWASP A09 - Global error handler (no stack trace leak)
app.use(errorHandler as unknown as express.ErrorRequestHandler);

const start = async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();