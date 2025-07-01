"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "~/components/ui/button";

export function FinalVideoSection() {
  const t = useTranslations("Home");

  return (
    <section
      className={`
        from-primary to-primary/80 py-20
        bg-background
      `}
    >
      <div className="container mx-auto px-4 flex flex-col items-center">
        {/* 顶部大标题和副标题 */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-primary mb-2 text-center">
          {t("finalVideoTitle")}
        </h1>
        <p className="text-base md:text-lg text-muted-foreground mb-10 text-center max-w-2xl">
          {t("finalVideoDesc")}
        </p>
        {/* 视频区域 */}
        <div className="w-full max-w-3xl bg-card rounded-2xl shadow-lg p-6 flex flex-col items-center mb-10">
          <video
            src="https://www.w3schools.com/html/mov_bbb.mp4"
            controls
            className="rounded-xl w-full max-h-[420px] bg-black"
            poster="https://zvcxdyuidlhzvmhsviwc.supabase.co/storage/v1/object/public/images/colorized-2.png"
          />
        </div>
        {/* 底部按钮 */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
          <Link
            href="/face-swap"
            className="inline-flex h-10 items-center justify-center rounded-md bg-gradient-to-r from-primary to-secondary px-6 text-lg font-semibold text-primary-foreground shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
          >
            {t("getStartNow")}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center justify-center rounded-md border-2 border-primary bg-transparent px-6 text-lg font-semibold text-primary transition-all duration-300 hover:scale-105 hover:bg-primary hover:text-primary-foreground"
          >
            {t("getPremium")}
          </Link>
        </div>
      </div>
    </section>
  );
}
