import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { SYSTEM_CONFIG } from "~/app";
import { createClient } from "~/lib/supabase/server";

// 处理 Supabase Auth 重定向回调
export async function GET(request: NextRequest) {
  const t = await getTranslations('Auth');
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // 如果没有授权码，重定向到登录页面
  if (!code) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  try {
    const supabase = await createClient();

    // 交换授权码获取会话
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code);

    // 如果交换会话成功并且获取到了用户信息
    if (user) {
        try {
          console.log("🔍 Auth callback - User data received:", {
            id: user.id,
            email: user.email,
            metadata: user.user_metadata,
            emailConfirmed: user.email_confirmed_at
          });

          // 使用 Supabase 客户端直接操作数据库（绕过 Drizzle 连接问题）
          const userData = {
            id: user.id,
            email: user.email || "",
            name: user.user_metadata.name || user.user_metadata.full_name || user.email?.split('@')[0] || "Unnamed User",
            image: user.user_metadata.avatar_url || user.user_metadata.picture || null,
            email_verified: user.email_confirmed_at ? true : false,
            first_name: user.user_metadata.first_name || null,
            last_name: user.user_metadata.last_name || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          // 使用 Supabase 的 upsert 功能
          const { data: upsertResult, error: upsertError } = await supabase
            .from('user')
            .upsert(userData, {
              onConflict: 'id',
              ignoreDuplicates: false
            })
            .select();

          if (upsertError) {
            console.error("❌ Auth callback - Supabase upsert error:", upsertError);
          } else {
            console.log("✅ Auth callback - User upsert successful via Supabase:", upsertResult);
            
            // 新用户或现有用户都尝试初始化积分系统（函数内部会检查是否已存在）
            try {
              const { data: creditResult, error: creditError } = await supabase
                .rpc('get_or_create_user_credit_balance', {
                  user_id: user.id
                });

              if (creditError) {
                console.error("❌ Auth callback - Credit initialization error:", creditError);
              } else {
                console.log("✅ Auth callback - Credit balance initialized:", creditResult);
              }
            } catch (creditError) {
              console.error("❌ Auth callback - Credit initialization failed:", creditError);
            }
          }

        } catch (dbError) {
          console.error("❌ Auth callback - Database error:", dbError);
          // 即使数据库操作失败，我们也不应该阻止用户登录
          // 只记录错误，继续执行重定向逻辑
        }
    } else {
      console.warn("⚠️ Auth callback - No user data received from Supabase");
    }

    // 检查是否有保存的重定向路径
    // 由于这是服务端代码，我们需要通过URL参数或其他方式传递重定向信息
    // 这里我们添加一个脚本来处理客户端的重定向逻辑
    const redirectScript = `
      <script>
        (function() {
          const savedRedirect = localStorage.getItem('redirectAfterLogin');
          if (savedRedirect) {
            localStorage.removeItem('redirectAfterLogin');
            window.location.href = savedRedirect;
          } else {
            window.location.href = '${SYSTEM_CONFIG.redirectAfterSignIn}';
          }
        })();
      </script>
    `;

    // 返回包含重定向脚本的HTML页面
    return new Response(
      `<!DOCTYPE html>
       <html>
         <head>
           <title>Redirecting...</title>
         </head>
         <body>
           <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
             <div style="text-align: center;">
               <div style="margin-bottom: 20px;">${t('redirecting')}</div>
               <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
             </div>
           </div>
           <style>
             @keyframes spin {
               0% { transform: rotate(0deg); }
               100% { transform: rotate(360deg); }
             }
           </style>
           ${redirectScript}
         </body>
       </html>`,
      {
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
        },
      }
    );
  } catch (error) {
    console.error("Auth callback error:", error);
    // 授权失败重定向到登录页面
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=callback_error", request.url),
    );
  }
}
