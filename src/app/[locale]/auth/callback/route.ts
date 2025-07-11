import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { SYSTEM_CONFIG } from "~/app";
import { createClient } from "~/lib/supabase/server";
import { createId } from "@paralleldrive/cuid2";

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

    // 交换授权码获取会话
    const { data: { user }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    if (exchangeError) {
      console.error('❌ Auth callback - Exchange code error:', exchangeError);
      return NextResponse.redirect(new URL("/auth/error", request.url));
    }

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

        // auth.users 表由 Supabase 自动管理，我们只需要维护 user_profiles 表
        console.log("🔍 开始创建/更新用户配置...");
        
        // 提取用户配置信息
        const displayName = user.user_metadata.name || 
                           user.user_metadata.full_name || 
                           user.email?.split('@')[0] || 
                           "Unnamed User";
        
        const firstName = user.user_metadata.first_name || null;
        const lastName = user.user_metadata.last_name || null;
        const avatarUrl = user.user_metadata.avatar_url || 
                         user.user_metadata.picture || 
                         null;

        // 使用 upsert_user_profile 函数创建或更新用户配置
        const { data: profileResult, error: profileError } = await supabase
          .rpc('upsert_user_profile', {
            p_user_id: user.id, // Supabase auth user.id is already UUID format
            p_display_name: displayName,
            p_first_name: firstName,
            p_last_name: lastName,
            p_avatar_url: avatarUrl,
            p_project_id: '0616faceswap'
          });

        if (profileError) {
          console.error("❌ Auth callback - Profile upsert error:", {
            error: profileError,
            message: profileError.message,
            details: profileError.details,
            hint: profileError.hint,
            code: profileError.code
          });
          
          // 如果是函数不存在的错误，尝试直接插入到 user_profiles 表
          if (profileError.code === '42883' || profileError.message?.includes('function') || profileError.message?.includes('does not exist')) {
            console.log("🔄 Function not found, trying direct table insert...");
            try {
              const { data: directResult, error: directError } = await supabase
                .from('user_profiles')
                .upsert({
                  id: user.id,
                  display_name: displayName,
                  first_name: firstName,
                  last_name: lastName,
                  avatar_url: avatarUrl,
                  project_id: '0616faceswap',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'id'
                });

              if (directError) {
                console.error("❌ Direct insert also failed:", directError);
                // 继续执行，但记录错误
              } else {
                console.log("✅ Direct user profile insert successful:", directResult);
              }
            } catch (directInsertError) {
              console.error("❌ Direct insert error:", directInsertError);
            }
          }
        } else {
          console.log("✅ Auth callback - User profile upserted successfully:", profileResult);
        }

        // 初始化新用户赠送积分
        try {
          console.log("🔍 检查是否需要为新用户赠送积分...");

          // 检查用户是否已有赠送积分
          const { data: existingBonus, error: checkError } = await supabase
            .from('subscription_status_monitor')
            .select('subscription_id')
            .eq('user_id', user.id)
            .eq('price_id', 'bonus_5_credits') // 使用一个特殊的 price_id 来标识
            .single();

          if (checkError && checkError.code !== 'PGRST116') { // 忽略 'not found' 错误
             console.error("❌ Auth callback - 检查赠送积分时出错:", checkError);
          }

          if (!existingBonus) {
            console.log(`✨ 为新用户 ${user.id} 赠送5个初始积分...`);
            const bonusSubscriptionId = `bonus_${createId()}`;
            const now = new Date();
            // 创建一个“永不过期”的订阅记录来代表赠送的积分
            const { error: bonusError } = await supabase
              .from('subscription_status_monitor')
              .insert({
                user_id: user.id,
                subscription_id: bonusSubscriptionId,
                status: 'active',
                total_credits: 5,
                remaining_credits: 5,
                start_date: now.toISOString(),
                end_date: new Date('9999-12-31').toISOString(), // 设置一个极远的未来日期
                price_id: 'bonus_5_credits', // 特殊标识
                product_id: 'system_bonus',
                stripe_customer_id: null,
              });

            if (bonusError) {
              console.error("❌ Auth callback - 赠送初始积分失败:", bonusError);
            } else {
              console.log("✅ Auth callback - 成功赠送5积分。");
            }
          } else {
            console.log("✅ 用户已有初始积分，跳过赠送。");
          }
        } catch (creditError) {
          console.error("❌ Auth callback - 处理初始积分时出错:", creditError);
        }

      } catch (dbError) {
        console.error("❌ Auth callback - Database error:", dbError);
        // 返回详细的错误信息到错误页面
        return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(dbError instanceof Error ? dbError.message : 'Unknown database error')}`, request.url));
      }
    } else {
      console.warn("⚠️ Auth callback - No user data received from Supabase");
      return NextResponse.redirect(new URL("/auth/error?error=no_user_data", request.url));
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
    return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`, request.url));
  }
}
