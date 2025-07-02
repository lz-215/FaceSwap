"use client";

import { useEffect, createElement } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Coins, Zap } from "lucide-react";

export default function PricingPage() {
  const tPage = useTranslations("PricingPage");
  const locale = useLocale();

  useEffect(() => {
    // 加载Stripe Pricing Table脚本
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/pricing-table.js";
    script.async = true;
    document.head.appendChild(script);

    // 等待Stripe组件加载后再应用样式
    const applyCustomStyles = () => {
      const styleElement = document.createElement("style");
      styleElement.textContent = `
        /* 强制覆盖Stripe样式 */
        stripe-pricing-table * {
          font-family: inherit !important;
        }
        
        /* 使用更强的选择器覆盖按钮样式 */
        stripe-pricing-table button,
        stripe-pricing-table [role="button"],
        stripe-pricing-table input[type="submit"],
        stripe-pricing-table .stripe-button {
          background: oklch(0.6 0.15 260) !important;
          background-color: oklch(0.6 0.15 260) !important;
          border: 1px solid oklch(0.6 0.15 260) !important;
          color: white !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          transition: all 0.2s ease !important;
          box-shadow: none !important;
        }
        
        stripe-pricing-table button:hover,
        stripe-pricing-table [role="button"]:hover,
        stripe-pricing-table input[type="submit"]:hover,
        stripe-pricing-table .stripe-button:hover {
          background: oklch(0.55 0.15 260) !important;
          background-color: oklch(0.55 0.15 260) !important;
          border-color: oklch(0.55 0.15 260) !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 12px oklch(0.6 0.15 260 / 0.3) !important;
        }
        
        /* 覆盖卡片样式 */
        stripe-pricing-table > div,
        stripe-pricing-table .pricing-card,
        stripe-pricing-table [data-testid="pricing-table-card"] {
          border-radius: 12px !important;
          border: 1px solid oklch(0.9 0.02 240) !important;
          box-shadow: 0 1px 3px oklch(0.1 0.01 240 / 0.1) !important;
          background: white !important;
        }
        
        /* 确保文字颜色正确 */
        stripe-pricing-table h1,
        stripe-pricing-table h2,
        stripe-pricing-table h3,
        stripe-pricing-table .price,
        stripe-pricing-table .amount {
          color: oklch(0.1 0.01 240) !important;
        }
        
        /* 尝试深度样式穿透 */
        stripe-pricing-table::part(button) {
          background-color: oklch(0.6 0.15 260) !important;
        }
        
        /* 使用CSS变量 */
        stripe-pricing-table {
          --stripe-color-primary: oklch(0.6 0.15 260);
          --stripe-color-background: oklch(0.98 0.01 240);
          --stripe-color-text: oklch(0.1 0.01 240);
          --stripe-border-radius: 8px;
        }
      `;
      document.head.appendChild(styleElement);

      // 定期检查并重新应用样式
      const observer = new MutationObserver(() => {
        const buttons = document.querySelectorAll(
          'stripe-pricing-table button, stripe-pricing-table [role="button"]'
        );
        buttons.forEach((button) => {
          (button as HTMLElement).style.cssText += `
            background-color: oklch(0.6 0.15 260) !important;
            border-color: oklch(0.6 0.15 260) !important;
            color: white !important;
          `;
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });

      return () => {
        observer.disconnect();
        if (styleElement && document.head.contains(styleElement)) {
          document.head.removeChild(styleElement);
        }
      };
    };

    // 延迟应用样式，确保Stripe组件已加载
    const timer = setTimeout(applyCustomStyles, 1000);

    // 监听Stripe组件加载
    script.onload = () => {
      setTimeout(applyCustomStyles, 500);
    };

    return () => {
      clearTimeout(timer);
      const existingScript = document.querySelector(
        'script[src="https://js.stripe.com/v3/pricing-table.js"]'
      );
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="mb-4 text-4xl font-bold text-foreground">
          {tPage("choosePlan")}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {tPage("subtitle")}
        </p>
      </div>

      {/* Stripe Pricing Table */}
      <div
        className="w-full max-w-4xl mx-auto"
        style={
          {
            // 尝试通过内联样式影响子组件
            "--stripe-color-primary": "oklch(0.6 0.15 260)",
            "--stripe-color-background": "oklch(0.98 0.01 240)",
          } as React.CSSProperties
        }
      >
        {createElement("stripe-pricing-table", {
          "pricing-table-id": "prctbl_1RfcfrP9YNEyAXtbdnk9VKvw",
          "publishable-key":
            "pk_test_51RR7rMP9YNEyAXtb8NSf2BNWkL0qepSqdJKuTNMNrSJoGOVoRjeuqTh2HoRDUCaMiuuhAaoB3WkjUNNHczHmezrA00BXOxxszr",
          "client-reference-id": `locale-${locale}`,
        })}
      </div>

      {/* 积分说明 */}
      <div className="mt-8 max-w-2xl mx-auto">
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-6 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-300">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            {locale === "zh" ? "积分详情" : "Credits Included"}
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 bg-background/80 rounded-lg border border-border/50 hover:border-primary/30 transition-colors duration-200">
              <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-primary font-bold text-sm">M</span>
              </div>
              <div>
                <h4 className="font-medium text-foreground">
                  {tPage("credits.monthly")}
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {tPage("credits.monthlyDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-background/80 rounded-lg border border-border/50 hover:border-primary/30 transition-colors duration-200">
              <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">
                  {tPage("credits.yearly")}
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {tPage("credits.yearlyDesc")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 附加信息 */}
      <div className="mt-12 max-w-3xl mx-auto text-center">
        <div className="grid md:grid-cols-3 gap-6 text-sm text-muted-foreground">
          <div className="flex flex-col items-center p-4 rounded-lg hover:bg-muted/20 transition-colors duration-200">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors duration-200">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              {tPage("features.watermarkFree")}
            </h3>
            <p>{tPage("features.watermarkFreeDesc")}</p>
          </div>

          <div className="flex flex-col items-center p-4 rounded-lg hover:bg-muted/20 transition-colors duration-200">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              {tPage("features.priorityProcessing")}
            </h3>
            <p>{tPage("features.priorityProcessingDesc")}</p>
          </div>

          <div className="flex flex-col items-center p-4 rounded-lg hover:bg-muted/20 transition-colors duration-200">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              {tPage("features.support247")}
            </h3>
            <p>{tPage("features.support247Desc")}</p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-muted/50 rounded-lg border border-border/30">
          <p className="text-xs text-muted-foreground">{tPage("disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
