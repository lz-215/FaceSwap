import { NextRequest, NextResponse } from "next/server";

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;

export async function GET() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    config: {
      hasApiKey: !!FACEPP_API_KEY,
      hasApiSecret: !!FACEPP_API_SECRET,
      apiKeyLength: FACEPP_API_KEY?.length || 0,
      apiSecretLength: FACEPP_API_SECRET?.length || 0,
    },
    tests: [] as any[],
    recommendations: [] as string[],
  };

  try {
    // 1. 检查环境变量
    if (!FACEPP_API_KEY || !FACEPP_API_SECRET) {
      diagnostics.tests.push({
        name: "环境变量检查",
        status: "失败",
        error: "Face++ API密钥未配置",
        details: {
          missingApiKey: !FACEPP_API_KEY,
          missingApiSecret: !FACEPP_API_SECRET,
        }
      });
      
      diagnostics.recommendations.push(
        "请在环境变量中设置 FACEPP_API_KEY 和 FACEPP_API_SECRET",
        "获取密钥地址: https://console.faceplusplus.com.cn/"
      );
      
      return NextResponse.json(diagnostics);
    }

    // 2. 测试API连接 - 使用正确的端点
    try {
      console.log("🧪 开始测试Face++ API连接...");
      
      const testForm = new FormData();
      testForm.append("api_key", FACEPP_API_KEY);
      testForm.append("api_secret", FACEPP_API_SECRET);

      // 使用不需要图片的简单API端点进行测试
      const response = await fetch("https://api-cn.faceplusplus.com/facepp/v3/detect", {
        method: "POST",
        body: testForm,
        signal: AbortSignal.timeout(10000),
      });

      const responseText = await response.text();
      
      diagnostics.tests.push({
        name: "Face++ API连接测试",
        status: response.ok ? "成功" : "失败",
        details: {
          status: response.status,
          statusText: response.statusText,
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200),
        }
      });

      // 3. 解析响应
      try {
        const parsedResponse = JSON.parse(responseText);
        
        if (parsedResponse.error_message) {
          diagnostics.tests.push({
            name: "API响应验证",
            status: "失败",
            error: parsedResponse.error_message,
            details: parsedResponse
          });
          
          // 根据错误类型提供建议
          if (parsedResponse.error_message.includes("INVALID_API_KEY")) {
            diagnostics.recommendations.push("API密钥无效，请检查FACEPP_API_KEY是否正确");
          } else if (parsedResponse.error_message.includes("INVALID_API_SECRET")) {
            diagnostics.recommendations.push("API密钥密码无效，请检查FACEPP_API_SECRET是否正确");
          } else if (parsedResponse.error_message.includes("IMAGE_ERROR")) {
            diagnostics.recommendations.push("这是正常的测试错误，因为我们没有提供图片进行检测");
            diagnostics.tests[diagnostics.tests.length - 1].status = "正常";
          }
        } else {
          diagnostics.tests.push({
            name: "API响应验证",
            status: "成功",
            details: parsedResponse
          });
        }
      } catch (parseError) {
        diagnostics.tests.push({
          name: "响应解析",
          status: "失败",
          error: "无法解析API响应",
          details: {
            parseError: parseError instanceof Error ? parseError.message : "未知解析错误",
            responseText: responseText.substring(0, 500)
          }
        });
      }

    } catch (networkError) {
      diagnostics.tests.push({
        name: "网络连接测试",
        status: "失败",
        error: "网络连接失败",
        details: {
          errorMessage: networkError instanceof Error ? networkError.message : "未知网络错误",
          errorType: networkError instanceof TypeError ? "Network/Fetch Error" : "Other Error",
        }
      });
      
      diagnostics.recommendations.push(
        "检查网络连接是否正常",
        "检查防火墙是否阻止了对Face++ API的访问",
        "尝试重启应用服务"
      );
    }

    // 4. 生成总体建议
    const failedTests = diagnostics.tests.filter(test => test.status === "失败");
    
    if (failedTests.length === 0) {
      diagnostics.recommendations.push("✅ Face++ API配置正常，可以正常使用");
    } else {
      diagnostics.recommendations.push(
        `❌ 发现 ${failedTests.length} 个问题需要解决`,
        "🔧 请按照上述建议逐一修复问题"
      );
    }

    return NextResponse.json(diagnostics);

  } catch (error) {
    return NextResponse.json({
      ...diagnostics,
      fatalError: {
        message: "诊断过程中发生致命错误",
        error: error instanceof Error ? error.message : "未知错误",
        stack: error instanceof Error ? error.stack : undefined,
      }
    }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({
    message: "此端点用于诊断Face++ API问题，请使用GET方法访问"
  }, { status: 405 });
} 