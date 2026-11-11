import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsPlatformAdmin } from "@/lib/platform.functions";
import {
  UserCircle2,
  LogOut,
  Menu,
  X,
  ShieldAlert,
  ShieldCheck,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CompanyChatWidget } from "@/components/chat/CompanyChatWidget";
import { GlobalAssistant } from "@/components/GlobalAssistant";
import logoDailyBrief from "@/assets/logo-dailybrief.png";
import { getMyProfile } from "@/lib/reports.functions";
import { getMyModules } from "@/lib/modules.functions";
import { moduleForPath, visibleModules } from "@/lib/modules/registry";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const LAUNCHER_ITEM = {
  to: "/apps",
  label: "Applications",
  icon: LayoutGrid,
} as const;



const COLLAPSE_KEY = "sidebar:collapsed";

/** Pages "système" affichées en plein écran, sans barre latérale. */
const CHROMELESS_PATHS = ["/apps", "/company/applications"];

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = router.state.location.pathname;
  const chromeless = CHROMELESS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  const modulesFn = useServerFn(getMyModules);
  const { data: moduleState } = useQuery({
    queryKey: ["my-modules"],
    queryFn: () => modulesFn(),
    staleTime: 60_000,
  });

  // Une application désactivée n'est plus accessible par URL directe.
  const currentModule = moduleForPath(pathname);
  const moduleBlocked =
    !!currentModule &&
    !currentModule.core &&
    (moduleState?.disabled ?? []).includes(currentModule.code);

  useEffect(() => {
    if (!moduleBlocked) return;
    toast.info("Cette application est désactivée pour votre entreprise");
    router.navigate({ to: "/apps", replace: true });
  }, [moduleBlocked, router]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(COLLAPSE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [router.state.location.pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  async function handleSignOut() {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Déconnecté");
      router.navigate({ to: "/auth", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur de déconnexion");
    }
  }

  if (chromeless) {
    return (
      <div className="min-h-dvh bg-muted/30 flex flex-col">
        <TopBar email={user.email ?? ""} onSignOut={handleSignOut} />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
        <CommandPalette />
        <CompanyChatWidget />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      {/* Sidebar desktop — fixed */}
      <aside
        className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-30 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] overflow-hidden",
          collapsed ? "w-16" : "w-64",
        )}

      >
        <SidebarInner
          email={user.email ?? ""}
          onSignOut={handleSignOut}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shadow-xl animate-fade-in">

            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">Menu</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarInner
              email={user.email ?? ""}
              onSignOut={handleSignOut}
              collapsed={false}
            />
          </aside>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col min-h-dvh min-w-0 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "md:pl-16" : "md:pl-64",
        )}

      >
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-4 py-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link to="/apps" className="flex items-center gap-2 font-semibold">
            <img src={logoDailyBrief} alt="DailyBrief" className="h-6 w-6 rounded" />
            DailyBrief
          </Link>
        </header>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
        <CommandPalette />
        <CompanyChatWidget />
      </div>

    </div>
  );
}

function TopBar({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    staleTime: 60_000,
  });
  const displayName = profile?.full_name ?? email;
  const initials = (profile?.full_name ?? email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
      <Link to="/apps" className="flex min-w-0 items-center gap-2 font-semibold">
        <img
          src={logoDailyBrief}
          alt="DailyBrief"
          className="h-7 w-7 shrink-0 rounded"
        />
        <span className="truncate">DailyBrief</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Rechercher (⌘K)"
          title="Rechercher (⌘K)"
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true }),
            )
          }
        >
          <Search className="h-4 w-4" />
        </Button>
        <NotificationsBell collapsed />
        <GlobalAssistant collapsed />
        <Link
          to="/profile"
          className="rounded-md p-1 hover:bg-accent"
          title={displayName}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Link>
        <Button
          size="icon"
          variant="ghost"
          onClick={onSignOut}
          aria-label="Se déconnecter"
          title="Se déconnecter"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

function SidebarInner({
  email,
  onSignOut,
  collapsed,
  onToggleCollapsed,
}: {
  email: string;
  onSignOut: () => void;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}) {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const checkFn = useServerFn(checkIsPlatformAdmin);
  const profileFn = useServerFn(getMyProfile);
  const { data: isAdmin } = useQuery({
    queryKey: ["is-platform-admin"],
    queryFn: () => checkFn(),
    staleTime: 60_000,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    staleTime: 60_000,
  });
  const adminOnly = (profile as any)?.admin_only === true;
  const modulesFn = useServerFn(getMyModules);
  const { data: moduleState } = useQuery({
    queryKey: ["my-modules"],
    queryFn: () => modulesFn(),
    staleTime: 60_000,
  });

  // Redirect admin-only accounts to /admin (allow /admin and /profile)
  useEffect(() => {
    if (!adminOnly) return;
    if (!pathname.startsWith("/admin") && !pathname.startsWith("/profile")) {
      router.navigate({ to: "/admin", replace: true });
    }
  }, [adminOnly, pathname, router]);

  const avatarUrl = profile?.avatar_url ?? undefined;
  const displayName = profile?.full_name ?? email;
  const initials = (profile?.full_name ?? email ?? "?").slice(0, 2).toUpperCase();
  const mods = visibleModules(moduleState?.disabled);
  const current =
    mods.find((m) => m.code === moduleForPath(pathname)?.code) ?? mods[0];
  const moduleScreens = (current?.screens ?? []).filter(
    (s) => s.to !== "/company/applications" || moduleState?.isOwner,
  );
  const navItems: { to: string; label: string; icon: typeof UserCircle2 }[] =
    adminOnly
      ? [
          { to: "/admin", label: "Admin plateforme", icon: ShieldAlert },
          { to: "/profile", label: "Profil", icon: UserCircle2 },
        ]
      : [
          { ...LAUNCHER_ITEM },
          ...moduleScreens,
          ...(isAdmin
            ? [{ to: "/admin", label: "Admin plateforme", icon: ShieldAlert }]
            : []),
        ];

  return (
    <>
      <div
        className={cn(
          "flex items-center pt-4 pb-3",
          collapsed ? "px-2 justify-center" : "px-4 justify-between gap-2",
        )}
      >
        <Link
          to="/apps"
          className="flex items-center gap-2 min-w-0"
          title="DailyBrief"
        >
          <img
            src={logoDailyBrief}
            alt="DailyBrief"
            className="h-9 w-9 shrink-0 rounded-lg object-cover"
          />
          <div
            className={cn(
              "min-w-0 transition-[opacity,max-width,transform] duration-300 ease-out overflow-hidden",
              collapsed
                ? "opacity-0 -translate-x-1 max-w-0"
                : "opacity-100 translate-x-0 max-w-[10rem]",
            )}
            aria-hidden={collapsed}
          >
            <div className="font-semibold leading-tight truncate">DailyBrief</div>
            <div className="text-xs text-muted-foreground leading-tight truncate">
              Team reports made simple
            </div>
          </div>
        </Link>
        {onToggleCollapsed && !collapsed && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={onToggleCollapsed}
            aria-label="Réduire le menu"
            title="Réduire le menu"
          >
            <ChevronsLeft className="h-4 w-4 transition-transform duration-300" />
          </Button>
        )}

      </div>
      {onToggleCollapsed && collapsed && (
        <div className="px-2 pb-2 flex justify-center">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onToggleCollapsed}
            aria-label="Agrandir le menu"
            title="Agrandir le menu"
          >
            <ChevronsRight className="h-4 w-4 transition-transform duration-300" />
          </Button>
        </div>
      )}
      {!adminOnly && (
        <div className={cn("mb-2", collapsed ? "px-2" : "px-3")}>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true }),
              );
            }}
            title="Rechercher (⌘K)"
            className={cn(
              "flex items-center rounded-md text-sm text-muted-foreground border border-border/60 bg-background/50 hover:bg-sidebar-accent/60 transition-colors w-full",
              collapsed ? "justify-center h-9" : "gap-2 px-3 py-1.5",
            )}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <span className={cn("truncate flex-1 text-left transition-[opacity,max-width] duration-300 overflow-hidden", collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-full")}>Rechercher…</span>
            <kbd className={cn("text-xs bg-muted px-1.5 rounded transition-[opacity,max-width] duration-300 overflow-hidden", collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-full")}>⌘K</kbd>
          </button>
        </div>
      )}

      <nav
        className={cn(
          "space-y-1 flex-1 overflow-y-auto",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {!adminOnly && !collapsed && current && (
          <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
            {current.name}
          </div>
        )}
        {navItems.map((item) => {
          const active =
            item.to === "/reports"
              ? pathname === "/reports"
              : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-md text-sm transition-colors",
                collapsed
                  ? "justify-center h-10 w-10 mx-auto"
                  : "gap-3 px-3 py-2",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-sidebar-accent/60",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span
                className={cn(
                  "truncate transition-[opacity,max-width,transform] duration-300 ease-out overflow-hidden",
                  collapsed
                    ? "opacity-0 -translate-x-1 max-w-0"
                    : "opacity-100 translate-x-0 max-w-[10rem]",
                )}
                aria-hidden={collapsed}
              >
                {item.label}
              </span>

            </Link>
          );
        })}

      </nav>
      <div
        className={cn(
          "border-t border-sidebar-border space-y-2",
          collapsed ? "p-2" : "p-3",
        )}
      >
        <Link
          to="/profile"
          className={cn(
            "flex items-center rounded-md hover:bg-sidebar-accent/60 transition-colors",
            collapsed ? "justify-center p-1" : "gap-2 px-2 py-1.5",
          )}
          title={collapsed ? displayName : "Voir mon profil"}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1 animate-fade-in">
              <div className="text-sm font-medium truncate leading-tight">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate leading-tight" title={email}>{email}</div>
            </div>
          )}
        </Link>
        {!adminOnly && <NotificationsBell collapsed={collapsed} />}
        {!adminOnly && <GlobalAssistant collapsed={collapsed} />}
        {!adminOnly && (
          <Link
            to="/profile"
            hash="verification"
            className={cn(
              "flex items-center rounded-md text-sm transition-colors hover:bg-sidebar-accent/60",
              collapsed ? "justify-center h-9 w-9 mx-auto" : "gap-2 px-2 py-1.5",
            )}
            title={collapsed ? "Vérifier mon identité" : undefined}
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            {!collapsed && <span className="truncate">Vérifier mon identité</span>}
          </Link>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className={cn(collapsed ? "mx-auto flex" : "w-full justify-start")}
          onClick={onSignOut}
          title={collapsed ? "Se déconnecter" : undefined}
          aria-label="Se déconnecter"
        >
          <LogOut className={cn("h-4 w-4 shrink-0", !collapsed && "mr-2")} />
          <span
            className={cn(
              "transition-[opacity,max-width] duration-300 ease-out overflow-hidden whitespace-nowrap",
              collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[10rem]",
            )}
            aria-hidden={collapsed}
          >
            Se déconnecter
          </span>
        </Button>

      </div>
    </>
  );
}
