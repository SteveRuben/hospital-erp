import type { UserRole } from '../types';

export interface MenuItem {
  path: string;
  icon: string;
  label: string;
  roles: UserRole[]; // which roles can see this menu item
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const ALL_ROLES: UserRole[] = ['admin', 'medecin', 'comptable', 'laborantin', 'reception', 'pharmacien', 'infirmier', 'super_admin', 'chef_pole'];

export const menuConfig: MenuGroup[] = [
  {
    label: 'Accueil',
    items: [
      { path: '/app', icon: 'bi-speedometer2', label: 'Dashboard', roles: ALL_ROLES },
    ],
  },
  {
    label: 'Clinique',
    items: [
      { path: '/app/patients', icon: 'bi-people', label: 'Patients', roles: ['admin', 'medecin', 'reception', 'super_admin', 'chef_pole'] },
      { path: '/app/medecins', icon: 'bi-person-badge', label: 'Médecins', roles: ['admin', 'medecin', 'super_admin', 'chef_pole'] },
      { path: '/app/consultations', icon: 'bi-clipboard-pulse', label: 'Consultations', roles: ['admin', 'medecin', 'super_admin', 'chef_pole'] },
      { path: '/app/rendezvous', icon: 'bi-calendar-event', label: 'Rendez-vous', roles: ['admin', 'medecin', 'reception', 'super_admin', 'chef_pole'] },
      { path: '/app/laboratoire', icon: 'bi-flask', label: 'Laboratoire', roles: ['admin', 'laborantin', 'super_admin', 'chef_pole'] },
      { path: '/app/visites', icon: 'bi-door-open', label: 'Visites actives', roles: ['admin', 'medecin', 'reception', 'super_admin', 'chef_pole'] },
      { path: '/app/file-attente', icon: 'bi-hourglass-split', label: "File d'attente", roles: ['admin', 'medecin', 'reception', 'super_admin', 'chef_pole'] },
      { path: '/app/pharmacie', icon: 'bi-capsule', label: 'Pharmacie', roles: ['admin', 'medecin', 'pharmacien', 'super_admin', 'chef_pole'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/app/finances', icon: 'bi-cash-coin', label: 'Finances', roles: ['admin', 'comptable', 'super_admin', 'chef_pole'] },
      { path: '/app/services', icon: 'bi-building', label: 'Services', roles: ['admin', 'super_admin'] },
      { path: '/app/listes-patients', icon: 'bi-list-ul', label: 'Listes patients', roles: ['admin', 'medecin', 'super_admin', 'chef_pole'] },
      { path: '/app/documentation', icon: 'bi-book', label: 'Documentation', roles: ALL_ROLES },
      { path: '/app/utilisateurs', icon: 'bi-person-gear', label: 'Utilisateurs', roles: ['admin', 'super_admin'] },
      { path: '/app/habilitations', icon: 'bi-shield-lock', label: 'Habilitations', roles: ['admin', 'super_admin'] },
      { path: '/app/import', icon: 'bi-cloud-upload', label: 'Import données', roles: ['admin', 'super_admin'] },
      { path: '/app/facilities', icon: 'bi-building', label: 'Établissements', roles: ['super_admin'] },
    ],
  },
];

// Check if a role has access to a path
export const hasAccess = (role: UserRole, path: string): boolean => {
  for (const group of menuConfig) {
    for (const item of group.items) {
      if (item.path === path && item.roles.includes(role)) return true;
    }
  }
  return false;
};

// Get filtered menu for a role
export const getMenuForRole = (role: UserRole): MenuGroup[] => {
  return menuConfig
    .map(group => ({
      ...group,
      items: group.items.filter(item => item.roles.includes(role)),
    }))
    .filter(group => group.items.length > 0);
};
