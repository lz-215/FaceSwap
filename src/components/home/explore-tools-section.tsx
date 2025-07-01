"use client";

import React from "react";
import { useTranslations } from "next-intl";

const cardData = Array.from({ length: 15 }, (_, i) => ({
  id: i + 1,
  titleKey: "cardTitle",
  link: `#tool${i + 1}`,
  img: "https://via.placeholder.com/284x184?text=AI+Tool", // 占位图片，后续替�?
}));

export function ExploreToolsSection() {
  const t = useTranslations("ExploreTools");
  return (
    <section className="py-20 bg-background">
      <div className="mx-auto px-1 max-w-7xl">
        <h2 className="text-4xl font-bold text-primary text-center mb-10">
          {t("title")}
        </h2>
        <div className="grid grid-cols-3 gap-8 justify-center">
          {cardData.map((card, idx) => (
            <div key={card.id} className="flex flex-col items-center">
              <a
                href={card.link}
                className="block rounded-lg overflow-hidden shadow-lg bg-card hover:scale-105 transition-transform duration-200"
                style={{ width: 284, height: 184 }}
              >
                <img
                  src={card.img}
                  alt={t(card.titleKey, { index: card.id })}
                  width={284}
                  height={184}
                  className="object-cover w-full h-full"
                />
              </a>
              <div
                className="mt-3 text-center text-foreground text-base font-medium w-full"
                style={{ width: 284 }}
              >
                {t(card.titleKey, { index: card.id })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
