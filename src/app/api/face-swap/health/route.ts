import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 检查环境变量配置
    const apiKey = process.env.FACEPP_API_KEY;
    const apiSecret = process.env.FACEPP_API_SECRET;
    const apiUrl = process.env.FACEPP_MERGEFACE_URL || "https://api-cn.faceplusplus.com/imagepp/v1/mergeface";

    const configured = !!(apiKey && apiSecret);

    return NextResponse.json({
      configured,
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      apiUrl,
      status: configured ? "ready" : "not_configured",
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json(
      { 
        configured: false,
        error: "Health check failed",
        status: "error"
      },
      { status: 500 }
    );
  }
} 
