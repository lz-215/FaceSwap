"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

export function HowToSwapSection() {
  const t = useTranslations("HowToSwap");
  return (
    <section className="w-full flex flex-col items-center pt-24 pb-16 px-4 bg-background">
      <h2 className="text-4xl md:text-5xl font-extrabold text-primary mb-3 text-center drop-shadow-[0_4px_24px_rgba(var(--primary-rgb),0.4)]">
        {t("title")}
      </h2>
      <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-3xl text-center font-light">
        {t("desc")}
      </p>
      <div className="flex flex-col md:flex-row justify-center items-center gap-12 w-full max-w-6xl">
        {/* Left: Steps */}
        <div className="flex-1 min-w-[320px] max-w-xl">
          <div className="mb-12">
            <h3 className="text-primary text-2xl font-extrabold mb-2">
              {t("step1Title")}
            </h3>
            <p className="text-foreground text-base leading-relaxed">
              {t("step1Desc")}
            </p>
          </div>
          <div className="mb-12">
            <h3 className="text-primary text-2xl font-extrabold mb-2">
              {t("step2Title")}
            </h3>
            <p className="text-foreground text-base leading-relaxed">
              {t("step2Desc")}
            </p>
          </div>
          <div className="mb-4">
            <h3 className="text-primary text-2xl font-extrabold mb-2">
              {t("step3Title")}
            </h3>
            <p className="text-foreground text-base leading-relaxed">
              {t("step3Desc")}
            </p>
          </div>
        </div>
        {/* Right: Single Image */}
        <div className="flex-1 flex items-center justify-center min-w-[320px]">
          <div className="relative w-[485px] h-[298px] rounded-3xl overflow-hidden shadow-2xl border-4 border-primary">
            <Image
              src="/images/origin1.png"
              alt="Face Swap Result"
              fill
              className="object-cover rounded-3xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
