"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function AISwapFaceCasesSection() {
  const router = useRouter();
  const t = useTranslations("AISwapFaceCases");

  return (
    <section className="w-full bg-background py-16">
      {/* 顶部介绍 Section */}
      <section className="w-full flex flex-col items-center mb-6 ">
        <h2 className="text-5xl font-extrabold text-primary mb-3 text-center drop-shadow-lg">
          {t("mainTitle")}
        </h2>
        <p className="text-lg text-muted-foreground mb-6 max-w-3xl text-center">
          {t("mainDesc")}
        </p>
      </section>

      {/* Painting Face Swap Section */}
      <section className="w-full flex flex-col md:flex-row items-center justify-center gap-10 mt-10 mb-16 px-4">
        {/* Left: Painting Images */}
        <div className="relative w-[485px] h-[325px] rounded-2xl overflow-hidden bg-card flex items-center justify-center border-4 border-primary">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[300px] rounded-xl overflow-hidden border-2 border-primary shadow-lg">
            <Image
              src="/images/demo5.jpg"
              alt="painting after"
              fill
              className="object-cover"
            />
            <span className="absolute right-2 top-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded">
              NEW
            </span>
          </div>
        </div>
        {/* Right: Painting Text */}
        <div className="flex-1 max-w-xl flex flex-col justify-center items-start">
          <h3 className="text-2xl font-extrabold text-foreground mb-2">
            {t("paintingTitle")}
          </h3>
          <p className="text-base text-foreground mb-8">{t("paintingDesc")}</p>
          <Link href="/face-swap" passHref legacyBehavior>
            <a className="w-48 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 text-lg cursor-pointer">
              {t("swapNow")} <span className="text-xl">→</span>
            </a>
          </Link>
        </div>
      </section>

      {/* Gender Swap Section */}
      <section className="w-full flex flex-col md:flex-row items-center justify-center gap-10 mt-10 mb-20 px-4 bg-card py-12 rounded-2xl">
        {/* Left: Gender Text */}
        <div className="flex-1 max-w-xl flex flex-col justify-center items-start">
          <h3 className="text-2xl font-extrabold text-foreground mb-2">
            {t("genderTitle")}
          </h3>
          <p className="text-base text-foreground mb-8">{t("genderDesc")}</p>
          <Link href="/face-swap" passHref legacyBehavior>
            <a className="w-48 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 text-lg cursor-pointer">
              {t("swapNow")} <span className="text-xl">→</span>
            </a>
          </Link>
        </div>
        {/* Right: Gender Images */}
        <div className="relative w-[485px] h-[325px] rounded-2xl overflow-hidden bg-card flex items-center justify-center border-4 border-primary">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[300px] rounded-xl overflow-hidden border-2 border-primary shadow-lg">
            <Image
              src="/images/demo4.jpg"
              alt="gender after"
              fill
              className="object-cover"
            />
            <span className="absolute right-2 top-2 text-2xl bg-primary rounded-full px-2 py-1">
              🔄
            </span>
          </div>
        </div>
      </section>

      {/* Time and Space Travel Section */}
      <section className="w-full flex flex-col md:flex-row items-center justify-center gap-10 mt-10 mb-16 px-4">
        {/* Left: Time Images */}
        <div className="relative w-[485px] h-[325px] rounded-2xl overflow-hidden bg-card flex items-center justify-center border-4 border-primary">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[300px] rounded-xl overflow-hidden border-2 border-primary shadow-lg">
            <Image
              src="/images/demo8.jpg"
              alt="time after"
              fill
              className="object-cover"
            />
          </div>
        </div>
        {/* Right: Time Text */}
        <div className="flex-1 max-w-xl flex flex-col justify-center items-start">
          <h3 className="text-2xl font-extrabold text-foreground mb-2">
            {t("timeTitle")}
          </h3>
          <p className="text-base text-foreground mb-8">{t("timeDesc")}</p>
          <Link href="/face-swap" passHref legacyBehavior>
            <a className="w-48 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 text-lg cursor-pointer">
              {t("swapNow")} <span className="text-xl">→</span>
            </a>
          </Link>
        </div>
      </section>

      {/* Visual Makeup Experiments Section */}
      <section className="w-full flex flex-col md:flex-row items-center justify-center gap-10 mt-10 mb-20 px-4 bg-card py-12 rounded-2xl">
        {/* Left: Makeup Text */}
        <div className="flex-1 max-w-xl flex flex-col justify-center items-start">
          <h3 className="text-2xl font-extrabold text-foreground mb-2">
            {t("makeupTitle")}
          </h3>
          <p className="text-base text-foreground mb-8">{t("makeupDesc")}</p>
          <Link href="/face-swap" passHref legacyBehavior>
            <a className="w-48 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 text-lg cursor-pointer">
              {t("swapNow")} <span className="text-xl">→</span>
            </a>
          </Link>
        </div>
        {/* Right: Makeup Images */}
        <div className="relative w-[485px] h-[325px] rounded-2xl overflow-hidden bg-card flex items-center justify-center border-4 border-primary">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[300px] rounded-xl overflow-hidden border-2 border-primary shadow-lg">
            <Image
              src="/images/demo6.jpg"
              alt="makeup after"
              fill
              className="object-cover"
            />
            <span className="absolute right-2 top-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded">
              NEW
            </span>
          </div>
        </div>
      </section>

      {/* Festive Costume Dress-Up Section */}
      <section className="w-full flex flex-col md:flex-row items-center justify-center gap-10 mt-10 mb-20 px-4">
        {/* Left: Costume Images */}
        <div className="relative w-[485px] h-[325px] rounded-2xl overflow-hidden bg-card flex items-center justify-center border-4 border-primary">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[300px] rounded-xl overflow-hidden border-2 border-primary shadow-lg">
            <Image
              src="/images/demo7.jpg"
              alt="costume after"
              fill
              className="object-cover"
            />
          </div>
        </div>
        {/* Right: Costume Text */}
        <div className="flex-1 max-w-xl flex flex-col justify-center items-start">
          <h3 className="text-2xl font-extrabold text-foreground mb-2">
            {t("costumeTitle")}
          </h3>
          <p className="text-base text-foreground mb-8">{t("costumeDesc")}</p>
          <Link href="/face-swap" passHref legacyBehavior>
            <a className="w-48 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 text-lg cursor-pointer">
              {t("swapNow")} <span className="text-xl">→</span>
            </a>
          </Link>
        </div>
      </section>
    </section>
  );
}
