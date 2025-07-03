import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { SYSTEM_CONFIG } from "~/app";
import { createClient } from "~/lib/supabase/server";

// 处理 Supabase Auth 重定向回调
export async function GET(request: NextRequest) {
  console.log('进入了 /auth/callback 路由');
  const t = await getTranslations('Auth');
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // 如果没有授权码，重定向到登录页面
  if (!code) {
    console.log('未获取到 code，重定向到登录页');
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  try {
    // 创建服务角色客户端
    const supabase = await createClient();
    const adminAuthClient = supabase.auth.admin;

    // 交换授权码获取会话
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code);
    console.log('exchangeCodeForSession 返回 user:', user);

    // 如果交换会话成功并且获取到了用户信息
    if (user) {
      try {
        console.log("🔍 Auth callback - User data received:", {
          id: user.id,
          email: user.email,
          metadata: user.user_metadata,
          emailConfirmed: user.email_confirmed_at
        });

        // 使用服务角色客户端操作数据库
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
        console.log('准备 upsert user 表:', userData);
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
          
          // 新用户或现有用户都尝试初始化积分系统
          try {
            const { data: creditResult, error: creditError } = await supabase
              .rpc('get_or_create_user_credit_balance', {
                p_user_id: user.id
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
      }
    } else {
      console.warn("⚠️ Auth callback - No user data received from Supabase");
    }

    // 添加重定向脚本
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

    return new Response(redirectScript, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error("❌ Auth callback - Error:", error);
    return NextResponse.redirect(new URL("/auth/error", request.url));
  }
}
