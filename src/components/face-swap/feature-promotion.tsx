"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";

interface FeaturePromotionProps {
  title: string;
  description: string;
  features: string[];
  buttonText: string;
  buttonHref?: string;
  onClick?: () => void;
  gradient?: string;
  icon?: string;
}

export function FeaturePromotion({
  title,
  description,
  features,
  buttonText,
  buttonHref,
  onClick,
  gradient = "from-indigo-600 via-purple-600 to-pink-600",
  icon = "⭐",
}: FeaturePromotionProps) {
  const router = useRouter();
  const t = useTranslations("FaceSwap.pro");
  const checkmarkIconClasses = "text-green-600 mr-3 text-base font-bold";

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (buttonHref) {
      router.push(buttonHref);
    }
  };

  // 准备所有特性（过滤掉"无限制AI换脸次数"，确保只有4个特性）
  const filteredFeatures = features.filter(
    (feature) => feature !== t("feature1") // 使用翻译键过滤
  );
  const allFeatures = [
    ...filteredFeatures,
    t("qualityAssurance"),
    t("privacyProtection"),
  ].slice(0, 4);

  // 将特性分为两列
  const midPoint = Math.ceil(allFeatures.length / 2);
  const leftColumnFeatures = allFeatures.slice(0, midPoint);
  const rightColumnFeatures = allFeatures.slice(midPoint);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div
        className="rounded-2xl p-6 shadow-xl"
        style={{ backgroundColor: "lch(98 3.66 242.49)", color: "#374151" }}
      >
        <div className="flex flex-col gap-5">
          {/* 上方：按钮 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            {/* 左侧：升级按钮 */}
            <div className="flex justify-center md:justify-start">
              <Button
                onClick={handleClick}
                className="bg-indigo-600 text-white hover:bg-indigo-700 font-bold px-6 py-3 rounded-xl shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
              >
                {buttonText}
              </Button>
            </div>

            {/* 右侧：立即体验 */}
            <div className="flex items-center justify-center md:justify-start mt-3 md:mt-0">
              <div className="flex items-center text-gray-600">
                <span className="text-base">🚀</span>
                <span className="ml-2 text-base font-semibold">
                  {t("tryNow")}
                </span>
              </div>
            </div>
          </div>

          {/* 下方：特性列表（左右两列） */}
          <div className="bg-gray-50 rounded-xl p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {/* 左列 */}
              <div className="space-y-2">
                {leftColumnFeatures.map((feature, index) => (
                  <div key={`left-${index}`} className="flex items-center">
                    <span className={checkmarkIconClasses}>✓</span>
                    <span className="text-gray-700 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              {/* 右列 */}
              <div className="space-y-2">
                {rightColumnFeatures.map((feature, index) => (
                  <div key={`right-${index}`} className="flex items-center">
                    <span className={checkmarkIconClasses}>✓</span>
                    <span className="text-gray-700 text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
