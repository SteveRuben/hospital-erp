import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getBranding, type Branding } from '../services/api';

interface BrandingContextValue {
  branding: Branding;
  reload: () => Promise<void>;
}

const DEFAULT: Branding = { nom_etablissement: 'Hospital ERP', logo_url: null, theme: 'cds-blue' };

const BrandingContext = createContext<BrandingContextValue>({ branding: DEFAULT, reload: async () => {} });

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}

/**
 * Loads the public /settings/branding endpoint at mount and applies the
 * theme to <html data-theme="..."> so the CSS variable overrides in
 * index.css kick in immediately. Also updates the document title and
 * favicon to match the establishment identity. Falls back to defaults
 * if the endpoint fails (e.g. backend unreachable on first paint).
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT);

  const apply = useCallback((b: Branding) => {
    document.documentElement.setAttribute('data-theme', b.theme);
    document.title = b.nom_etablissement;
    // Update favicon when a logo is set. Keep the default favicon when not —
    // we don't want a broken icon if logo_url is null.
    if (b.logo_url) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = b.logo_url;
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const { data } = await getBranding();
      setBranding(data);
      apply(data);
    } catch {
      // Network or backend down — keep defaults; app still functions.
      apply(DEFAULT);
    }
  }, [apply]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <BrandingContext.Provider value={{ branding, reload }}>
      {children}
    </BrandingContext.Provider>
  );
}
