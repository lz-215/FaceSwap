import { NextRequest, NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";

/**
 * 处理积分过期的API端点
 * 支持手动触发和定时任务调用
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 验证请求授权
    const authHeader = request.headers.get('authorization');
    const isManualTrigger = request.headers.get('x-manual-trigger') === 'true';
    
    // 如果不是手动触发，验证API密钥
    if (!isManualTrigger) {
      const expectedApiKey = process.env.CREDIT_EXPIRY_API_KEY;
      if (!expectedApiKey || authHeader !== `Bearer ${expectedApiKey}`) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    console.log('[expire-api] 开始执行积分过期处理...');

    // 1. 执行积分过期处理
    const { data: expireResult, error: expireError } = await supabase.rpc('scheduled_expire_credits');
    
    if (expireError) {
      console.error('[expire-api] 积分过期处理失败:', expireError);
      throw expireError;
    }

    console.log('[expire-api] 积分过期处理完成:', expireResult);

    // 2. 同步订阅时间戳
    const { data: syncResult, error: syncError } = await supabase.rpc('sync_subscription_credits_timestamps');
    
    if (syncError) {
      console.warn('[expire-api] 订阅时间戳同步失败:', syncError);
      // 不抛出错误，这不是关键操作
    }

    console.log('[expire-api] 订阅时间戳同步完成:', syncResult);

    return NextResponse.json({
      success: true,
      expireResult,
      syncResult,
      processedAt: new Date().toISOString(),
      isManualTrigger
    });

  } catch (error) {
    console.error('[expire-api] 处理失败:', error);
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '处理失败',
        success: false,
        processedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * 获取积分过期状态的API端点
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    console.log('[expire-api] 查询积分状态:', { userId });

    if (userId) {
      // 获取特定用户的积分详情
      const { data: userDetails, error: userError } = await supabase.rpc('get_user_credit_details', {
        p_user_id: userId
      });

      if (userError) {
        throw userError;
      }

      return NextResponse.json({
        success: true,
        userDetails,
        queriedAt: new Date().toISOString()
      });
    } else {
      // 获取系统整体积分状态
      const { data: statusData, error: statusError } = await supabase
        .from('subscription_status_monitor')
        .select('*')
        .limit(100);

      if (statusError) {
        throw statusError;
      }

      // 获取统计信息
      const { data: stats, error: statsError } = await supabase.rpc('scheduled_expire_credits');
      
      return NextResponse.json({
        success: true,
        subscriptionStatus: statusData,
        systemStats: stats?.health_check || null,
        queriedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('[expire-api] 查询失败:', error);
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '查询失败',
        success: false,
        queriedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 