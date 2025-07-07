import { type CookieOptions, createServerClient } from '@supabase/ssr'
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from "next/server";
import { routing, LOCALE_STORAGE_KEY } from '~/i18n/i18nConfig';

// 创建中间件实例
const intlMiddleware = createMiddleware(routing);

// 中间件处理函数
export async function middleware(request: NextRequest) {
  // 检查cookie中的语言设置，并将其添加到请求中
  const cookieLocale = request.cookies.get(LOCALE_STORAGE_KEY)?.value;
  if (cookieLocale) {
    // 将语言信息添加到请求头中，供Next-intl使用
    request.headers.set('X-Locale', cookieLocale);
  }

  // First, let next-intl handle the request to get the response with locale information
  let response = intlMiddleware(request);

  // 获取环境变量
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 检查环境变量是否存在
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️  Middleware: Missing Supabase environment variables');
    console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
    console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
    // 如果环境变量缺失，跳过Supabase处理，只返回intl响应
    return response;
  }

  try {
    // Now, create a Supabase client and refresh the session
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({ name, value: '', ...options })
          },
        },
      },
    );

    await supabase.auth.getUser();
  } catch (error) {
    console.error('❌ Middleware: Error with Supabase client:', error);
    // 即使Supabase出错，也继续返回响应，不阻塞页面加载
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
