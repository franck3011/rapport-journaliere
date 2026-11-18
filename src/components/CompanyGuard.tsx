import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCompanyBranding } from "@/lib/branding.functions";

/** Pages accessibles sans entreprise (sinon on renvoie vers la création). */
const ALLOWED = ["/company", "/profile", "/plans", "/admin", "/auth", "/apps"];

/**
 * Parcours d'inscription autonome : un nouvel utilisateur n'a pas encore
 * d'entreprise. Plutôt que de le laisser devant un tableau de bord vide, on
 * l'amène directement au formulaire de création.
 */
export function CompanyGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const brandingFn = useServerFn(getMyCompanyBranding);

  const { data } = useQuery({
    queryKey: ["company-branding"],
    queryFn: () => brandingFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    if (data.companyId) return;

    const path = location.pathname;
    if (ALLOWED.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))) return;

    navigate({ to: "/company", replace: true });
  }, [data, location.pathname, navigate]);

  return null;
}
