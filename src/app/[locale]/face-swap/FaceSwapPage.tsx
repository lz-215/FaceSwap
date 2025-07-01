"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "~/lib/hooks/use-auth";
import { useCreditsV2 } from "~/lib/hooks/use-credits-v2";
import { useSubscription } from "~/lib/hooks/use-subscription";
import { toast } from "sonner";
import {
  validateFile,
  FACE_SWAP_VALIDATION_OPTIONS,
} from "~/lib/file-validation";
import { useLoading } from "~/lib/hooks/use-loading";
import { Button } from "~/components/ui/button";
import { addLogoWatermarkToImage, cleanupBlobUrl } from "~/lib/utils/watermark";

// 导入新拆分的组件
import { ImageUploadStep } from "~/components/face-swap/image-upload-step";
import { FaceSwapStep } from "~/components/face-swap/face-swap-step";
import { ResultPreview } from "~/components/face-swap/result-preview";
import { TemplateGallery } from "~/components/face-swap/template-gallery";
import { FullscreenModal } from "~/components/face-swap/fullscreen-modal";
import { FeaturePromotion } from "~/components/face-swap/feature-promotion";
import { LoginPromptDialog } from "~/components/face-swap/login-prompt-dialog";
import { FaceSwapDebug } from "~/components/face-swap/face-swap-debug";

// API响应类型
type FaceSwapResponse = {
  result?: string;
  historyId?: string;
  processingTime?: number;
  error?: string;
  details?: string;
};

// 常量定义
const demoTemplates = [
  "/images/temp1.png",
  "/images/temp2.png",
  "/images/temp3.png",
  "/images/temp4.png",
  "/images/temp5.png",
  "/images/temp6.png",
  "/images/temp7.png",
  "/images/temp8.png",
  "/images/temp9.png",
];

export default function FaceSwapPage() {
  // 状态定义
  const [origin, setOrigin] = useState<string | null>(null);
  const [face, setFace] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [split, setSplit] = useState(50);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [templateClickStep, setTemplateClickStep] = useState<0 | 1>(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Hooks
  const searchParams = useSearchParams();
  const t = useTranslations("FaceSwap");
  const router = useRouter();
  const { isLoading, withLoading } = useLoading();

  // 使用完整版积分系统
  const {
    balance,
    isLoading: creditsLoading,
    hasEnoughCredits,
    consumeCredits,
  } = useCreditsV2();

  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // 订阅状态检查
  const { hasActiveSubscription, isLoading: subscriptionLoading } =
    useSubscription();

  // 初始化模板
  useEffect(() => {
    const template = searchParams.get("template");
    if (template) {
      setOrigin(template);
    }
  }, [searchParams]);

  // 处理图片上传
  const handleUpload = withLoading(
    "upload",
    async (e: React.ChangeEvent<HTMLInputElement>, type: "origin" | "face") => {
      const file = e.target.files?.[0];
      if (!file) return;

      toast.loading(
        t("info.validatingFile", {
          defaultMessage: "Validating file...",
        }),
        { id: `validation-${type}` }
      );

      try {
        const validationResult = await validateFile(file, {
          ...FACE_SWAP_VALIDATION_OPTIONS,
          requireFaceDetection: type === "face",
        });

        if (!validationResult.isValid) {
          toast.error(validationResult.error || "File validation failed", {
            id: `validation-${type}`,
          });
          return;
        }

        if (validationResult.warnings) {
          validationResult.warnings.forEach((warning) => {
            toast.warning(warning, { duration: 5000 });
          });
        }

        const url = URL.createObjectURL(file);
        if (type === "origin") setOrigin(url);
        else setFace(url);

        const metadata = validationResult.metadata;
        const successMessage = metadata
          ? `Image uploaded: ${metadata.width}×${metadata.height}px, ${(
              metadata.size /
              (1024 * 1024)
            ).toFixed(1)}MB`
          : "Image uploaded successfully!";

        toast.success(
          t("success.imageUploaded", {
            defaultMessage: successMessage,
          }),
          { id: `validation-${type}` }
        );
      } catch (error) {
        console.error("File validation error:", error);
        toast.error(
          t("error.validationFailed", {
            defaultMessage: "File validation failed. Please try again.",
          }),
          { id: `validation-${type}` }
        );
      }
    }
  );

  // 换脸处理
  const handleSwap = withLoading("faceSwap", async () => {
    console.log("🚀 开始人脸交换处理...");
    console.log("用户状态:", { user: !!user, authLoading, isAuthenticated });
    console.log("积分状态:", {
      balance,
      creditsLoading,
      hasEnoughCredits: hasEnoughCredits(1),
    });
    console.log("图片状态:", { origin: !!origin, face: !!face });

    if (authLoading) {
      console.log("⏳ 认证检查中...");
      toast.info(
        t("info.checkingAuth", {
          defaultMessage: "Checking authentication...",
        })
      );
      return;
    }

    if (!user) {
      console.log("❌ 用户未登录");
      setShowLoginPrompt(true);
      return;
    }

    if (balance <= 0) {
      console.log("❌ 积分不足:", balance);
      toast.error(
        t("error.noCreditsLeft", {
          defaultMessage: "No credits left, please recharge!",
        })
      );
      router.push("/pricing");
      return;
    }

    if (!origin || !face) {
      console.log("❌ 图片缺失:", { origin: !!origin, face: !!face });
      toast.error(
        t("error.missingImages", {
          defaultMessage: "Please upload both images before swapping.",
        })
      );
      return;
    }

    console.log("✅ 所有检查通过，开始调用API...");

    try {
      const originFile = await urlToFile(origin, "origin.jpg");
      const faceFile = await urlToFile(face, "face.jpg");
      const formData = new FormData();
      formData.append("origin", originFile);
      formData.append("face", faceFile);

      console.log("🚀 Starting face swap request...");

      const res = await fetch("/api/face-swap", {
        method: "POST",
        body: formData,
      });

      console.log("📡 Response received:", {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
      });

      let data: FaceSwapResponse;
      try {
        data = (await res.json()) as FaceSwapResponse;
        console.log("📄 Response data:", data);
      } catch (jsonError) {
        console.error("❌ Failed to parse response as JSON:", jsonError);

        // 尝试获取原始响应文本
        try {
          const responseText = await res.text();
          console.error("Raw response text:", responseText.substring(0, 500));

          throw new Error(
            `Server returned invalid response: ${responseText.substring(
              0,
              100
            )}`
          );
        } catch (textError) {
          throw new Error(
            "Server returned invalid response and couldn't read response text"
          );
        }
      }

      if (!res.ok) {
        console.error("❌ Face swap API error:", {
          status: res.status,
          error: data.error,
          details: data.details,
        });

        // 显示详细错误信息
        const errorMessage = data.details
          ? `${data.error} (${data.details})`
          : data.error || "Face swap failed";

        throw new Error(errorMessage);
      }

      if (data.result) {
        setResult(`data:image/jpeg;base64,${data.result}`);

        console.log("✅ Face swap completed successfully:", {
          historyId: data.historyId,
          processingTime: data.processingTime,
        });

        // 换脸成功后消费积分 - 使用完整版
        try {
          const result = await consumeCredits("face_swap", 1, "人脸交换操作");
          if (result.success) {
            toast.success(
              t("success.faceSwapComplete", {
                defaultMessage: "Face swap completed successfully!",
              })
            );
          } else {
            toast.warning(
              t("warning.creditConsumptionFailed", {
                defaultMessage:
                  "Face swap completed, but failed to update credits.",
              })
            );
          }
        } catch (creditError) {
          console.error("Failed to consume credits:", creditError);
          toast.warning(
            t("warning.creditConsumptionFailed", {
              defaultMessage:
                "Face swap completed, but failed to update credits.",
            })
          );
        }
      } else {
        throw new Error("No result returned from face swap API");
      }
    } catch (error) {
      console.error("❌ Face swap error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      // 改进的错误消息处理
      let displayMessage = t("error.faceSwapFailed", {
        defaultMessage: "Face swap failed. Please try again.",
      });

      // 在开发环境中显示详细错误信息
      if (process.env.NODE_ENV === "development") {
        displayMessage = `${displayMessage}\n\n🔧 调试信息: ${errorMessage}`;

        // 显示详细的调试信息
        console.group("🔧 Face Swap Debug Information");
        console.log("Error details:", error);
        console.log("Origin image:", origin ? "✅ Available" : "❌ Missing");
        console.log("Face image:", face ? "✅ Available" : "❌ Missing");
        console.log("User authenticated:", user ? "✅ Yes" : "❌ No");
        console.log("Credits available:", balance);
        console.groupEnd();
      }

      // 根据错误类型提供不同的建议
      if (errorMessage.includes("API not configured")) {
        displayMessage =
          "⚙️ 系统配置问题：AI服务 API 未正确配置。请检查环境变量设置。";
      } else if (errorMessage.includes("temporarily unavailable")) {
        displayMessage = "🌐 服务暂时不可用，请稍后重试。";
      } else if (errorMessage.includes("clear faces")) {
        displayMessage = "😊 请确保两张图片都包含清晰的人脸。";
      } else if (errorMessage.includes("Network error")) {
        displayMessage = "🌐 网络连接问题，请检查网络后重试。";
      } else if (errorMessage.includes("invalid response")) {
        displayMessage = "📡 服务器响应异常，请稍后重试。";
      }

      toast.error(displayMessage, {
        duration: 6000, // 延长显示时间
      });
    }
  });

  // 下载图片（支持水印功能）
  const handleDownload = withLoading("download", async () => {
    if (!result) return;

    // 检查用户认证状态
    if (!isAuthenticated) {
      toast.error(t("error.loginRequired"));
      setShowLoginPrompt(true);
      return;
    }

    // 检查订阅状态加载中
    if (subscriptionLoading) {
      toast.info(t("info.checkingSubscription"));
      return;
    }

    try {
      let downloadUrl = result;
      let filename = "face-swap-result.png";

      // 如果用户没有有效订阅，添加水印
      if (!hasActiveSubscription) {
        toast.info(t("info.addingWatermark"), { id: "watermark-processing" });

        try {
          // 添加水印
          const watermarkedUrl = await addLogoWatermarkToImage(result, {
            logoUrl: "/logo.png",
            opacity: 0.8,
            position: "bottom-right",
            margin: 30,
            maxWidth: Math.max(
              80,
              Math.min(150, Math.floor(window.innerWidth * 0.08))
            ),
            maxHeight: Math.max(
              30,
              Math.min(60, Math.floor(window.innerHeight * 0.03))
            ),
            rotation: 0,
          });

          downloadUrl = watermarkedUrl;
          filename = "face-swap-result-watermarked.png";

          toast.success(t("success.watermarkAdded"), {
            id: "watermark-processing",
          });

          // 显示升级提示
          toast.info(t("info.nonMemberWatermark"), {
            duration: 5000,
            action: {
              label: t("pro.button"),
              onClick: () => router.push("/pricing"),
            },
          });
        } catch (watermarkError) {
          console.error("添加水印失败:", watermarkError);
          toast.error(t("error.watermarkFailed"));
          // 如果水印添加失败，仍然允许下载原图
        }
      } else {
        toast.success(t("info.memberNoWatermark"));
      }

      // 创建下载链接
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 清理blob URL（如果是水印图片）
      if (downloadUrl !== result) {
        setTimeout(() => cleanupBlobUrl(downloadUrl), 1000);
      }

      toast.success(t("info.downloadStarting"));
    } catch (error) {
      console.error("下载失败:", error);
      toast.error(t("error.downloadFailed"));
    }
  });

  // 模板点击处理
  const handleTemplateClick = (tpl: string) => {
    if (templateClickStep === 0) {
      setOrigin(tpl);
      setTemplateClickStep(1);
    } else {
      setFace(tpl);
      setTemplateClickStep(0);
    }
  };

  // 升级按钮处理
  const handleUpgrade = () => {
    router.push("/pricing");
  };

  // 辅助函数：URL转File
  async function urlToFile(url: string, filename: string): Promise<File> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
  }

  return (
    <div className="w-full bg-[lch(98_3.66_242.49)] text-gray-800 flex flex-col items-center font-sans">
      {/* 标题部分 */}
      <h1 className="text-5xl font-extrabold text-blue-600 mb-2 text-center drop-shadow-lg">
        {t("mainTitle")}
      </h1>
      <p className="text-lg text-gray-600 mb-6 max-w-2xl text-center font-medium">
        {t("mainDesc")}
      </p>

      {/* 标签页 */}
      <div className="flex flex-row gap-3 mb-8">
        <button className="bg-blue-600 text-white font-bold px-5 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition">
          {t("tabPhoto")}
        </button>
      </div>

      {/* 主要卡片 */}
      <div className="flex flex-row gap-8 bg-white rounded-3xl p-4 shadow-xl mb-8 border-2 border-gray-200 max-w-5xl w-full">
        {/* 左侧步骤 */}
        <div className="flex flex-col gap-6 w-[254px]">
          {/* 步骤1：上传原图 */}
          <ImageUploadStep
            stepNumber={1}
            title={t("step1Title")}
            image={origin}
            onUpload={(e) => handleUpload(e, "origin")}
            acceptTypes="image/png,image/jpeg,image/webp,image/gif"
            uploadFormats={t("uploadFormats")}
            isLoading={isLoading("upload")}
          />

          {/* 步骤2：上传人脸 */}
          <ImageUploadStep
            stepNumber={2}
            title={t("step2Title")}
            image={face}
            onUpload={(e) => handleUpload(e, "face")}
            acceptTypes="image/png,image/jpeg,image/webp"
            uploadFormats="PNG/JPG/JPEG/WEBP"
            disabled={!origin}
            isLoading={isLoading("upload")}
          />

          {/* 步骤3：换脸 */}
          <FaceSwapStep
            stepNumber={3}
            title={t("step3Title")}
            onSwap={handleSwap}
            canSwap={!!(origin && face)}
            isLoading={isLoading("faceSwap")}
            buttonText={t("swapBtn")}
          />
        </div>

        {/* 右侧预览 */}
        <ResultPreview
          origin={origin}
          result={result}
          split={split}
          setSplit={setSplit}
          dragging={dragging}
          setDragging={setDragging}
          isLoading={isLoading("faceSwap")}
          onZoom={() => setFullscreen(true)}
          onDownload={handleDownload}
          className="w-[680px] h-[416px] p-4"
        />
      </div>

      {/* 升级到Pro的推广 */}
      <FeaturePromotion
        onClick={handleUpgrade}
        title={t("pro.title")}
        description={t("pro.description")}
        features={[t("pro.feature1"), t("pro.feature2"), t("pro.feature3")]}
        buttonText={t("pro.button")}
      />

      {/* 模板库 */}
      <TemplateGallery
        templates={demoTemplates}
        onTemplateClick={handleTemplateClick}
        className="mt-2 mb-8"
      />

      {/* 全屏预览模态框 */}
      <FullscreenModal
        isOpen={fullscreen}
        onClose={() => setFullscreen(false)}
        origin={origin}
        result={result}
        split={split}
        setSplit={setSplit}
        dragging={dragging}
        setDragging={setDragging}
        isLoading={isLoading("faceSwap")}
      />

      {/* 登录提示对话框 */}
      <LoginPromptDialog
        open={showLoginPrompt}
        onOpenChange={setShowLoginPrompt}
      />
    </div>
  );
}
