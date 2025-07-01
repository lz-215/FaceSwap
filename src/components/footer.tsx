import Link from "next/link";
import { useTranslations } from "next-intl";

export function Footer({ className }: { className?: string }) {
  const t = useTranslations();
  return (
    <footer className={`w-full border-t bg-primary py-2 ${className ?? ""}`}>
      <div className="container mx-auto flex flex-col items-center justify-center">
        <div className="flex flex-row gap-6 text-sm text-primary-foreground">
          <Link
            href="/terms"
            className="hover:text-primary-foreground/80"
            target="_blank"
            rel="noopener noreferrer"
            legacyBehavior
          >
            {t("TermsOfService.title")}
          </Link>
          <span>|</span>
          <Link
            href="/privacy"
            className="hover:text-primary-foreground/80"
            target="_blank"
            rel="noopener noreferrer"
            legacyBehavior
          >
            {t("PrivacyPolicy.title")}
          </Link>
        </div>
        <p className="mt-2 text-xs text-primary-foreground/80">
          &copy; {new Date().getFullYear()} All rights reserved.
        </p>
      </div>
    </footer>
  );
}
