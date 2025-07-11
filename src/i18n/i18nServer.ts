import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

import { defaultLocale, type Locale, LOCALE_STORAGE_KEY, locales } from './i18nConfig';

// 从Cookie获取语言设置
async function getLocaleFromCookie(): Promise<Locale | null> {
  try {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get(LOCALE_STORAGE_KEY);

    if (localeCookie && locales.includes(localeCookie.value as Locale)) {
      return localeCookie.value as Locale;
    }
  } catch (error) {
    console.warn('Failed to read locale from cookie:', error);
  }

  return null;
}

// 从请求头获取语言偏好 - 只作为备选，不优先使用
async function getLocaleFromHeaders(): Promise<Locale | null> {
  try {
    const headersList = await headers();
    
    // 首先检查中间件设置的语言信息
    const localeFromMiddleware = headersList.get('X-Locale');
    if (localeFromMiddleware && locales.includes(localeFromMiddleware as Locale)) {
      return localeFromMiddleware as Locale;
    }

    // Accept-Language 头只在没有其他设置时作为参考，且不自动应用
    // 让用户明确选择语言，而不是根据浏览器语言自动切换
  } catch (error) {
    console.warn('Failed to read locale from headers:', error);
  }

  return null;
}

export default getRequestConfig(async () => {
  // 优先使用Cookie中的设置，如果没有则使用默认语言（英文）
  const cookieLocale = await getLocaleFromCookie();
  const headerLocale = await getLocaleFromHeaders();
  
  // 只有在明确设置了cookie的情况下才使用非默认语言
  const locale = cookieLocale || headerLocale || defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
