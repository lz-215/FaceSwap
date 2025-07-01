import { NextRequest, NextResponse } from "next/server";

// Face++ API 响应类型定义
interface FacePPResponse {
  error_message?: string;
  [key: string]: unknown;
}

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;

export async function GET() {
  try {
    // 检查环境变量
    if (!FACEPP_API_KEY || !FACEPP_API_SECRET) {
      return NextResponse.json({
        success: false,
        error: "API credentials not configured",
        details: {
          hasApiKey: !!FACEPP_API_KEY,
          hasApiSecret: !!FACEPP_API_SECRET,
        }
      });
    }

    // 测试Face++ API连接
    const testForm = new FormData();
    testForm.append("api_key", FACEPP_API_KEY);
    testForm.append("api_secret", FACEPP_API_SECRET);

    console.log("🧪 Testing Face++ API connection...");
    
    const response = await fetch("https://api-cn.faceplusplus.com/facepp/v3/detect", {
      method: "POST",
      body: testForm,
      signal: AbortSignal.timeout(10000), // 10秒超时
    });

    const data = await response.text();
    
    console.log("📡 Face++ API test response:", {
      status: response.status,
      statusText: response.statusText,
      responseLength: data.length,
    });

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: "Face++ API connection failed",
        details: {
          status: response.status,
          statusText: response.statusText,
          response: data.substring(0, 200),
        }
      });
    }

    // 尝试解析JSON响应
    let parsedData: FacePPResponse;
    try {
      parsedData = JSON.parse(data) as FacePPResponse;
    } catch (jsonError) {
      return NextResponse.json({
        success: false,
        error: "Face++ API returned invalid JSON",
        details: {
          response: data.substring(0, 200),
          jsonError: jsonError instanceof Error ? jsonError.message : "Unknown JSON error"
        }
      });
    }

    // 检查API响应
    if (parsedData.error_message) {
      return NextResponse.json({
        success: false,
        error: "Face++ API error",
        details: {
          errorMessage: parsedData.error_message,
          fullResponse: parsedData,
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: "Face++ API connection successful",
      details: {
        status: response.status,
        apiVersion: "facepp/v3",
        responseTime: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error("❌ Face++ API test failed:", error);
    
    return NextResponse.json({
      success: false,
      error: "Face++ API test failed",
      details: {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof TypeError ? "Network/Fetch Error" : "Other Error",
      }
    }, { status: 500 });
  }
} 
