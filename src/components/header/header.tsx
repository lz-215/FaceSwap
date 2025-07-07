"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SEO_CONFIG } from "~/app";
import { useSupabaseSession } from "~/lib/supabase-auth-client";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";

import { LanguageSwitcher } from "../language-switcher";
import { NotificationsWidget } from "../notifications/notifications-widget";
import { ThemeToggle } from "../theme-toggle";
import { HeaderUserDropdown } from "./header-user";

interface HeaderProps {
  children?: React.ReactNode;
  showAuth?: boolean;
}

export function Header({ showAuth = true }: HeaderProps) {
  const pathname = usePathname();
  const { loading: isPending, user } = useSupabaseSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = useTranslations("Navbar");

  const navigation = [
    { href: "/face-swap", name: t("faceSwap") },
    { href: "/pricing", name: t("pricing") },
  ];

  const isDashboard = user && pathname.startsWith("/dashboard");

  const renderContent = () => (
    <header
      className={`
        sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur
        supports-[backdrop-filter]:bg-background/60
      `}
    >
      <div
        className={`
          container mx-auto max-w-7xl px-4
          sm:px-6
          lg:px-8
        `}
      >
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link className="flex items-center gap-2" href="/">
              <span className={cn("text-xl font-bold text-primary")}>
                Swapify.AI
              </span>
            </Link>
            <nav
              className={`
                hidden
                md:flex
              `}
            >
              <ul className="flex items-center gap-6">
                {isPending
                  ? Array.from({ length: navigation.length }).map((_, i) => (
                      <li key={i}>
                        <Skeleton className="h-6 w-20" />
                      </li>
                    ))
                  : navigation.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== "/" && pathname?.startsWith(item.href));

                      return (
                        <li key={item.name}>
                          <Link
                            className={cn(
                              `
                              text-sm font-medium transition-colors
                              hover:text-primary text-white
                            `,
                              isActive
                                ? "font-semibold text-primary"
                                : "text-muted-foreground"
                            )}
                            href={item.href}
                          >
                            {item.name}
                          </Link>
                        </li>
                      );
                    })}
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {showAuth && (
              <div
                className={`
                  hidden
                  md:block
                `}
              >
                {user ? (
                  <HeaderUserDropdown
                    isDashboard={!!isDashboard}
                    userEmail={user.email || ""}
                    userImage={""}
                    userName={""}
                  />
                ) : isPending ? (
                  <Skeleton className="h-10 w-32" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Link href="/auth/sign-in">
                      <Button size="sm" variant="ghost">
                        {t("login")}
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
            <LanguageSwitcher />
            {/* Mobile menu button */}
            <Button
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              size="icon"
              variant="ghost"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden">
          {showAuth && !user && (
            <div className="space-y-1 border-b px-4 py-3">
              <Link
                className={`
                  block rounded-md px-3 py-2 text-base font-medium
                  hover:bg-muted/50
                `}
                href="/auth/sign-in"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t("login")}
              </Link>
            </div>
          )}
          {user && (
            <div className="space-y-1 border-b px-4 py-3">
              <HeaderUserDropdown
                isDashboard={!!isDashboard}
                userEmail={user.email || ""}
                userImage={""}
                userName={""}
              />
            </div>
          )}
          <div className="space-y-1 border-b px-4 py-3">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-base font-medium">{t("language")}</span>
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      )}
    </header>
  );

  return renderContent();
}
