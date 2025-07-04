import { NextRequest, NextResponse } from "next/server";

import { getCurrentSupabaseUser } from "~/lib/supabase-auth";
import { createClient } from "~/lib/supabase/server";

// 从环境变量获取Face++ API配置
const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;
const FACEPP_MERGEFACE_URL = process.env.FACEPP_MERGEFACE_URL || "https://api-cn.faceplusplus.com/imagepp/v1/mergeface";

// 验证环境变量配置
if (!FACEPP_API_KEY || !FACEPP_API_SECRET) {
  console.error("⚠️ Face++ API credentials not configured");
  console.error("Please set FACEPP_API_KEY and FACEPP_API_SECRET in your environment variables");
  console.error("You can get these from: https://console.faceplusplus.com.cn/");
}

// 调试信息输出函数
function logDebugInfo(message: string, data?: any) {
  if (process.env.NODE_ENV === "development") {
    console.log(`🔧 [Face++ Debug] ${message}`);
    if (data) {
      console.log(data);
    }
  }
}

// 将File转换为base64 URL用于存储（服务端实现）
async function fileToDataUrl(file: File): Promise<string> {
  try {
    // 在Node.js环境中，直接使用arrayBuffer()方法
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    // 根据文件类型确定MIME类型
    const mimeType = file.type || 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error converting file to data URL:', error);
    throw new Error('Failed to convert file to data URL');
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    logDebugInfo("Face swap request started");
    
    // 验证API配置
    if (!FACEPP_API_KEY || !FACEPP_API_SECRET) {
      logDebugInfo("API credentials missing", {
        hasApiKey: !!FACEPP_API_KEY,
        hasApiSecret: !!FACEPP_API_SECRET,
      });
      
      return NextResponse.json(
        { 
          error: "Face++ API not configured. Please check your environment variables.",
          details: "Missing FACEPP_API_KEY or FACEPP_API_SECRET",
          helpUrl: "https://console.faceplusplus.com.cn/"
        }, 
        { status: 500 }
      );
    }

    // 验证用户认证
    const user = await getCurrentSupabaseUser();
    if (!user) {
      logDebugInfo("User not authenticated");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    logDebugInfo("User authenticated", { userId: user.id });

    // 检查积分余额（但不消费）
    try {
      const supabase = await createClient();
      const { data: balanceData, error: balanceError } = await supabase.rpc('get_user_credits_v2', {
        p_user_id: user.id,
      });

      if (balanceError) {
        throw new Error(balanceError.message);
      }

      if ((balanceData.balance || 0) < 1) {
        logDebugInfo("Insufficient credits", { 
          userId: user.id, 
          currentBalance: balanceData.balance
        });
        return NextResponse.json({ 
          error: "Insufficient credits",
          currentBalance: balanceData.balance,
          required: 1
        }, { status: 402 }); // 402 Payment Required
      }

      logDebugInfo("Credits check passed", { 
        userId: user.id, 
        currentBalance: balanceData.balance
      });
    } catch (error: any) {
      logDebugInfo("Failed to check credits", { userId: user.id, error: error.message });
      return NextResponse.json({ error: "Failed to check credits" }, { status: 500 });
    }

    const formData = await request.formData();
    const origin = formData.get("origin") as File;
    const face = formData.get("face") as File;
    
    if (!origin || !face) {
      logDebugInfo("Missing image files", {
        hasOrigin: !!origin,
        hasFace: !!face,
      });
      
      return NextResponse.json(
        { error: "Missing required image files" }, 
        { status: 400 }
      );
    }

    logDebugInfo("Files received", {
      originSize: origin.size,
      originType: origin.type,
      faceSize: face.size,
      faceType: face.type,
    });

    // 验证文件类型和大小
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(origin.type) || !allowedTypes.includes(face.type)) {
      logDebugInfo("Invalid file type", {
        originType: origin.type,
        faceType: face.type,
        allowedTypes,
      });
      
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP are supported" },
        { status: 400 }
      );
    }

    if (origin.size > maxSize || face.size > maxSize) {
      logDebugInfo("File size too large", {
        originSize: origin.size,
        faceSize: face.size,
        maxSize,
      });
      
      return NextResponse.json(
        { error: "File size too large. Maximum size is 10MB" },
        { status: 400 }
      );
    }

    // 构造Face++ API请求
    const apiForm = new FormData();
    apiForm.append("api_key", FACEPP_API_KEY);
    apiForm.append("api_secret", FACEPP_API_SECRET);
    apiForm.append("template_file", origin);
    apiForm.append("merge_file", face);
    apiForm.append("merge_rate", "100"); // 合成比例100%

    logDebugInfo("Calling Face++ API", {
      url: FACEPP_MERGEFACE_URL,
      apiKeyLength: FACEPP_API_KEY.length,
      templateFileSize: origin.size,
      mergeFileSize: face.size,
    });

    const faceppRes = await fetch(FACEPP_MERGEFACE_URL, {
      method: "POST",
      body: apiForm,
      // 添加超时控制
      signal: AbortSignal.timeout(30000), // 30秒超时
    });

    const processingTime = Date.now() - startTime;
    logDebugInfo("Face++ API response received", {
      status: faceppRes.status,
      statusText: faceppRes.statusText,
      processingTime,
    });

    if (!faceppRes.ok) {
      // 获取更详细的错误信息
      let errorText = "";
      try {
        errorText = await faceppRes.text();
      } catch (e) {
        errorText = "Could not read error response";
      }
      
      console.error(`❌ Face++ API HTTP error: ${faceppRes.status}`);
      console.error("Response text:", errorText);

      return NextResponse.json(
        { 
          error: "Face swap service temporarily unavailable",
          details: `HTTP ${faceppRes.status}: ${faceppRes.statusText}`,
          processingTime,
        },
        { status: 502 }
      );
    }

    let faceppData;
    let responseText = "";
    
    // 先克隆响应，以防JSON解析失败时还能读取原始文本
    const responseClone = faceppRes.clone();
    
    try {
      faceppData = (await faceppRes.json()) as { 
        result?: string; 
        error_message?: string;
        error?: string;
      };
      
      logDebugInfo("Face++ API JSON response", {
        hasResult: !!faceppData.result,
        hasError: !!(faceppData.error_message || faceppData.error),
        resultLength: faceppData.result?.length || 0,
      });
    } catch (jsonError) {
      console.error("❌ Failed to parse Face++ API response as JSON:", jsonError);
      
      // 使用克隆的响应获取原始文本
      try {
        responseText = await responseClone.text();
        console.error("Raw response:", responseText.substring(0, 500));
        
        // 记录更详细的调试信息
        logDebugInfo("Face++ API response parsing failed", {
          responseLength: responseText.length,
          responseStart: responseText.substring(0, 100),
          isHTML: responseText.includes("<!DOCTYPE") || responseText.includes("<html"),
          contentType: faceppRes.headers.get("content-type"),
          status: faceppRes.status,
          statusText: faceppRes.statusText,
        });
        
      } catch (e) {
        console.error("Could not read response text:", e);
        responseText = "Could not read response text";
      }

      return NextResponse.json(
        { 
          error: "Face swap service returned invalid response",
          details: `Expected JSON but got: ${responseText.substring(0, 100)}`,
          processingTime,
          debugInfo: {
            responseLength: responseText.length,
            isHTML: responseText.includes("<!DOCTYPE") || responseText.includes("<html"),
            contentType: faceppRes.headers.get("content-type"),
            status: faceppRes.status,
          }
        },
        { status: 502 }
      );
    }

    if (!faceppData.result) {
      const errorMsg = faceppData.error_message || faceppData.error || "Face swap processing failed";
      console.error("❌ Face++ API error:", errorMsg);

      return NextResponse.json(
        { 
          error: "Face swap failed. Please ensure both images contain clear faces.",
          details: errorMsg,
          processingTime,
        },
        { status: 422 }
      );
    }

    // 🎉 Face++ 成功！现在开始消费积分
    logDebugInfo("Face++ API success, now consuming credits", {
      resultLength: faceppData.result.length,
      processingTime
    });

    try {
      const supabase = await createClient();
      const { data: creditResult, error: creditError } = await supabase.rpc('consume_credits_v2', {
        user_id: user.id,
        action_type: 'face_swap',
        transaction_description: '人脸交换操作'
      });

      if (creditError) {
        // 积分消费失败，但Face++已经成功，这是个问题，但我们仍然返回结果
        console.error("❌ Failed to consume credits after successful face swap:", creditError);
        logDebugInfo("Credit consumption failed after successful face swap", { 
          userId: user.id, 
          error: creditError.message
        });
        
        // 仍然返回成功结果，但带警告
        return NextResponse.json({ 
          result: faceppData.result,
          success: true,
          processingTime,
          warning: "Face swap completed but failed to update credits"
        });
      }

      if (!creditResult.success) {
        // 理论上不应该发生，因为我们之前检查过余额
        console.error("❌ Credit consumption failed after successful face swap:", creditResult);
        return NextResponse.json({ 
          result: faceppData.result,
          success: true,
          processingTime,
          warning: "Face swap completed but failed to update credits"
        });
      }

      logDebugInfo("Credits consumed successfully", { 
        userId: user.id, 
        amountConsumed: creditResult.amountConsumed,
        balanceAfter: creditResult.balanceAfter
      });
    } catch (error: any) {
      console.error("❌ Exception during credit consumption:", error);
      return NextResponse.json({ 
        result: faceppData.result,
        success: true,
        processingTime,
        warning: "Face swap completed but failed to update credits"
      });
    }

    logDebugInfo("Face swap completed successfully", {
      processingTime,
      resultSize: faceppData.result.length,
    });

    // 返回成功结果，新增 balanceAfter 字段
    return NextResponse.json({ 
      result: faceppData.result,
      success: true,
      processingTime,
      balanceAfter: creditResult.balanceAfter
    });

  } catch (err) {
    console.error("❌ Face swap API error:", err);
    
    const processingTime = Date.now() - startTime;

    if (err instanceof TypeError && err.message.includes("fetch")) {
      return NextResponse.json(
        { 
          error: "Network error. Please try again later.",
          details: err.message,
          processingTime,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { 
        error: "Internal server error. Please try again later.",
        details: err instanceof Error ? err.message : "Unknown error",
        processingTime,
      },
      { status: 500 }
    );
  }
} 
