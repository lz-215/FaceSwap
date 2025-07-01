import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const locales = ['en', 'zh'];
export const defaultLocale = 'en';

export type Locale = (typeof locales)[number];

// 定义路由配置，不在URL中显示语言前缀
export const routing = defineRouting({
  defaultLocale,
  localePrefix: 'never', // 不在URL中显示语言前缀
  locales,
});

// 创建导航函数
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);

// 本地存储的键名
export const LOCALE_STORAGE_KEY = 'preferred-locale';

// 获取浏览器语言偏好
export function getBrowserLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  const browserLang = navigator.language.split('-')[0];
  return locales.includes(browserLang as Locale) ? (browserLang as Locale) : defaultLocale;
}

// 获取当前应该使用的语言
export function getCurrentLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  // 优先使用本地存储的设置
  const stored = getStoredLocale();
  if (stored) {
    return stored;
  }

  // 其次检查cookie
  const cookieLocale = getCookieLocale();
  if (cookieLocale) {
    return cookieLocale;
  }

  // 默认使用英文，不自动根据浏览器语言切换
  // 让用户明确选择语言，而不是根据浏览器语言自动切换
  return defaultLocale;
}

// 获取cookie中的语言设置
export function getCookieLocale(): Locale | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cookies = document.cookie.split(';');
    const localeCookie = cookies.find(cookie => 
      cookie.trim().startsWith(`${LOCALE_STORAGE_KEY}=`)
    );
    
    if (localeCookie) {
      const localeValue = localeCookie.split('=')[1]?.trim();
      if (localeValue && locales.includes(localeValue as Locale)) {
        return localeValue as Locale;
      }
    }
  } catch (error) {
    console.warn('Failed to read locale from cookie:', error);
  }

  return null;
}

// 获取本地存储的语言设置
export function getStoredLocale(): Locale | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && locales.includes(stored as Locale)) {
      return stored as Locale;
    }
  } catch (error) {
    console.warn('Failed to read locale from localStorage:', error);
  }

  return null;
}

// 设置本地存储的语言设置
export function setStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    // 同时设置cookie
    document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  } catch (error) {
    console.warn('Failed to save locale:', error);
  }
}
