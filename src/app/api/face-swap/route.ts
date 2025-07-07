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

  // 统一创建 supabase 实例，后续复用
  const supabase = await createClient();

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
    let apiForm = new FormData();
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

    // 添加重试机制
    let faceppRes;
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logDebugInfo(`Face++ API attempt ${attempt}/${maxRetries}`);
        
        faceppRes = await fetch(FACEPP_MERGEFACE_URL, {
          method: "POST",
          body: apiForm,
          headers: {
            // 移除Content-Type，让浏览器自动设置multipart/form-data边界
          },
          signal: AbortSignal.timeout(30000), // 30秒超时
        });
        
        break; // 成功则跳出重试循环
      } catch (fetchError) {
        lastError = fetchError;
        logDebugInfo(`Face++ API attempt ${attempt} failed`, {
          error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
          willRetry: attempt < maxRetries
        });
        
        if (attempt < maxRetries) {
          // 等待1秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 重新创建FormData，避免流被消费的问题
          const retryApiForm = new FormData();
          retryApiForm.append("api_key", FACEPP_API_KEY);
          retryApiForm.append("api_secret", FACEPP_API_SECRET);
          retryApiForm.append("template_file", origin);
          retryApiForm.append("merge_file", face);
          retryApiForm.append("merge_rate", "100");
          apiForm = retryApiForm;
        }
      }
    }
    
    if (!faceppRes) {
      console.error("❌ Face++ API所有重试都失败了", lastError);
      return NextResponse.json(
        { 
          error: "Face++ API连接失败，请稍后重试",
          details: lastError instanceof Error ? lastError.message : "网络连接错误",
          processingTime: Date.now() - startTime,
        },
        { status: 503 }
      );
    }

    const processingTime = Date.now() - startTime;
    logDebugInfo("Face++ API response received", {
      status: faceppRes.status,
      statusText: faceppRes.statusText,
      processingTime,
      contentType: faceppRes.headers.get("content-type"),
    });

    if (!faceppRes.ok) {
      // 获取更详细的错误信息
      let errorText = "";
      let errorData: any = null;
      
      try {
        errorText = await faceppRes.text();
        
        // 尝试解析为JSON获取更多错误信息
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          // 不是JSON，使用原始文本
        }
      } catch (e) {
        errorText = "Could not read error response";
      }
      
      console.error(`❌ Face++ API HTTP error: ${faceppRes.status}`);
      console.error("Response text:", errorText);
      console.error("Error data:", errorData);

      // 根据状态码提供更具体的错误信息
      let userFriendlyError = "Face swap service temporarily unavailable";
      if (faceppRes.status === 400) {
        userFriendlyError = "请求参数错误，请检查图片格式和大小";
      } else if (faceppRes.status === 401) {
        userFriendlyError = "API认证失败，请检查API密钥配置";
      } else if (faceppRes.status === 403) {
        userFriendlyError = "API访问被拒绝，请检查账户余额或权限";
      } else if (faceppRes.status === 429) {
        userFriendlyError = "API调用频率过高，请稍后重试";
      }

      return NextResponse.json(
        { 
          error: userFriendlyError,
          details: errorData?.error_message || `HTTP ${faceppRes.status}: ${faceppRes.statusText}`,
          processingTime,
          debugInfo: {
            status: faceppRes.status,
            statusText: faceppRes.statusText,
            errorText: errorText.substring(0, 200),
            apiUrl: FACEPP_MERGEFACE_URL,
          }
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

    // 1. Face++ 成功后，先扣除积分
    const { data: creditResult, error: creditError } = await supabase.rpc('consume_credits_v2', {
      p_user_id: user.id,
      action_type: 'face_swap',
      amount_override: 1,
      transaction_description: '人脸交换操作'
    });
    if (creditError || !creditResult?.success) {
      return NextResponse.json({
        error: "Failed to consume credits",
        details: creditError?.message || "扣除积分失败",
        processingTime,
      }, { status: 500 });
    }

    // 🎉 Face++ 成功！现在开始消费积分
    logDebugInfo("Face++ API success, now consuming credits", {
      resultLength: faceppData.result.length,
      processingTime
    });

    let resultImagePath = null;
    try {
      // 2. 上传换脸结果图片到 Supabase Storage
      const fileName = `face-swap/${user.id}/${Date.now()}.jpg`;
      const buffer = Buffer.from(faceppData.result, "base64");
      const { data: storageData, error: storageError } = await supabase.storage
        .from("swap-after")
        .upload(fileName, buffer, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (storageError) {
        throw new Error("Failed to upload image to storage: " + storageError.message);
      }
      resultImagePath = fileName;
    } catch (err) {
      console.error("❌ Failed to upload face swap result to storage:", err);
      return NextResponse.json({
        error: "Face swap succeeded, but failed to save result image.",
        details: err instanceof Error ? err.message : String(err),
        processingTime,
      }, { status: 500 });
    }

    // 3. 写入历史记录表
    try {
      const { error: insertError } = await supabase
        .from("face_swap_histories")
        .insert([
          {
            user_id: user.id,
            result_image_path: resultImagePath,
            origin_image_url: null, // 如需存储原图，可上传后填写URL
            description: "AI换脸结果",
          },
        ]);
      if (insertError) {
        throw new Error(insertError.message);
      }
    } catch (err) {
      console.error("❌ Failed to insert face swap history:", err);
      // 不影响主流程，返回警告
      return NextResponse.json({
        result: faceppData.result,
        success: true,
        processingTime,
        warning: "Face swap completed, but failed to record history.",
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
