"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Globe, Check } from "lucide-react";
import { useLocale } from "next-intl";
import { setStoredLocale, type Locale } from "~/i18n/i18nConfig";

const languages = [
  { code: "en" as Locale, name: "English", flag: "🇺🇸" },
  { code: "zh" as Locale, name: "中文", flag: "🇨🇳" },
];

export function LanguageSwitcher() {
  const currentLocale = useLocale() as Locale;
  const [isChanging, setIsChanging] = useState(false);

  const handleLanguageChange = async (locale: Locale) => {
    if (locale === currentLocale || isChanging) return;

    setIsChanging(true);

    try {
      // 保存语言偏好到本地存储和cookie
      setStoredLocale(locale);

      // 刷新页面以应用新语言
      window.location.reload();
    } catch (error) {
      console.error("Failed to change language:", error);
      setIsChanging(false);
    }
  };

  const currentLanguage =
    languages.find((lang) => lang.code === currentLocale) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 min-w-0 px-3 h-9"
          disabled={isChanging}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">
            {currentLanguage.flag} {currentLanguage.name}
          </span>
          <span className="sm:hidden">{currentLanguage.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className="cursor-pointer flex items-center justify-between"
            disabled={isChanging}
          >
            <div className="flex items-center gap-2">
              <span>{language.flag}</span>
              <span>{language.name}</span>
            </div>
            {currentLocale === language.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
