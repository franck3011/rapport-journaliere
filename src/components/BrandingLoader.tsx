import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyCompanyBranding } from "@/lib/branding.functions";
import { setBrandingLogo } from "@/lib/branding";

/** Charge le logo de l'entreprise une fois pour toutes (utilise par les PDF). */
export function BrandingLoader() {
  const fn = useServerFn(getMyCompanyBranding);
  useEffect(() => {
    fn()
      .then((branding) => setBrandingLogo(branding?.logoUrl ?? null))
      .catch(() => setBrandingLogo(null));
  }, [fn]);
  return null;
}
