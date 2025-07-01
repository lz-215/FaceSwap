import { BarChart, LogOut } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { supabaseAuth } from "~/lib/supabase-auth-client";
import { cn } from "~/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

import { CurrentUserAvatar } from "../current-user-avatar";

interface HeaderUserDropdownProps {
  isDashboard: boolean;
  userEmail: string;
  userImage?: null | string;
  userName: string;
}

export function HeaderUserDropdown({
  isDashboard = false,
  userEmail,
  userImage,
  userName,
}: HeaderUserDropdownProps) {
  const t = useTranslations("Navbar");

  const handleSignOut = async () => {
    try {
      await supabaseAuth.signOutWithRedirect();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="relative overflow-hidden rounded-full"
          size="icon"
          variant="ghost"
        >
          <CurrentUserAvatar />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            {userName && <p className="font-medium">{userName}</p>}
            {userEmail && (
              <p className="w-[200px] truncate text-sm text-muted-foreground">
                {userEmail}
              </p>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <BarChart className="mr-2 h-4 w-4" />
            {t("dashboard")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
