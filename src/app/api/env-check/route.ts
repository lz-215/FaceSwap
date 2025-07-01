import { NextResponse } from "next/server";

export async function GET() {
  try {
    const envStatus = {
      database: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        SUPABASE_DB_URL: !!process.env.SUPABASE_DB_URL,
        hasAnyDatabase: !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL)
      },
      supabase: {
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      facepp: {
        FACEPP_API_KEY: !!process.env.FACEPP_API_KEY,
        FACEPP_API_SECRET: !!process.env.FACEPP_API_SECRET,
        hasFaceAPI: !!(process.env.FACEPP_API_KEY && process.env.FACEPP_API_SECRET)
      },
      app: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL
      }
    };

    const recommendations = [];
    
    if (!envStatus.database.hasAnyDatabase) {
      recommendations.push("❌ 需要配置数据库连接 (DATABASE_URL 或 SUPABASE_DB_URL)");
    } else {
      recommendations.push("✅ 数据库连接已配置");
    }

    if (!envStatus.facepp.hasFaceAPI) {
      recommendations.push("❌ 需要配置AI服务API密钥 (FACEPP_API_KEY 和 FACEPP_API_SECRET)");
    } else {
      recommendations.push("✅ AI服务API已配置");
    }

    if (envStatus.supabase.NEXT_PUBLIC_SUPABASE_URL) {
      recommendations.push("✅ Supabase配置已设置");
    }

    return NextResponse.json({
      success: true,
      envStatus,
      recommendations,
      message: "环境变量检查完成",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "环境变量检查失败",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 
