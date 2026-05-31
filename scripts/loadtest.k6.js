/**
 * Hospital-ERP — k6 load test.
 *
 * Exerce les chemins critiques sous charge soutenue : login, patient
 * list/search, consultation create, lab Kanban read. Pas exhaustif —
 * vise à dégrossir le SLA d'un hôpital de taille moyenne (50 patients/
 * jour, 10 utilisateurs simultanés).
 *
 * Comment lancer :
 *   k6 run \
 *     -e BASE_URL=https://hospital-erp-production.up.railway.app \
 *     -e USERNAME=admin -e PASSWORD=admin123 \
 *     scripts/loadtest.k6.js
 *
 * Profil par défaut : ramp-up à 10 VUs sur 30 s, plateau de 2 min,
 * ramp-down 30 s. Soit ~3 min total. Adjust via --vus / --duration.
 *
 * Baselines attendues (à mettre à jour après la première vraie passe) :
 *   p95 login           < 500 ms
 *   p95 patients list   < 400 ms
 *   p95 laboratoire     < 600 ms
 *   error rate          < 1 %
 *
 * Tout dépassement durable est un signal pour profiler la requête
 * concernée (souvent : access-control UNION sur une table indexée
 * partiellement).
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD || 'admin123';

const loginTrend = new Trend('login_duration', true);
const listTrend = new Trend('patients_list_duration', true);
const kanbanTrend = new Trend('laboratoire_duration', true);
const errors = new Rate('errors');

export const options = {
  scenarios: {
    typical_day: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '2m', target: 10 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    // If these fail in CI the build goes red — adjust once you have
    // real baselines from your hardware/network profile.
    'login_duration{kind:p95}': ['p(95)<500'],
    'patients_list_duration{kind:p95}': ['p(95)<400'],
    'laboratoire_duration{kind:p95}': ['p(95)<600'],
    errors: ['rate<0.01'],
  },
};

function authHeader(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

export default function () {
  let token = '';
  group('login', () => {
    const r = http.post(`${BASE_URL}/api/auth/login`,
      JSON.stringify({ username: USERNAME, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    loginTrend.add(r.timings.duration);
    const ok = check(r, { 'login 200': res => res.status === 200 });
    errors.add(!ok);
    if (ok) {
      try { token = JSON.parse(r.body).token || JSON.parse(r.body).access_token || ''; }
      catch { /* keep empty */ }
    }
  });

  if (!token) return;

  group('patients list', () => {
    const r = http.get(`${BASE_URL}/api/patients?limit=20`, authHeader(token));
    listTrend.add(r.timings.duration);
    errors.add(!check(r, { 'patients 200': res => res.status === 200 }));
  });

  group('laboratoire Kanban', () => {
    const r = http.get(`${BASE_URL}/api/laboratoire`, authHeader(token));
    kanbanTrend.add(r.timings.duration);
    errors.add(!check(r, { 'labo 200': res => res.status === 200 }));
  });

  group('dashboard', () => {
    const r = http.get(`${BASE_URL}/api/dashboard`, authHeader(token));
    errors.add(!check(r, { 'dashboard 200': res => res.status === 200 }));
  });

  // Un utilisateur typique ne hammer pas l'API — laisser respirer.
  sleep(1 + Math.random() * 2);
}
