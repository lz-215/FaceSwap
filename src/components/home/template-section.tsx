"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const templates = Array.from({ length: 9 }, (_, idx) => ({
  img: `/images/temp${idx + 1}.png`,
  alt: `Template ${idx + 1}`,
}));

export function TemplateSection() {
  const router = useRouter();
  const t = useTranslations("TemplateSection");

  const handleTemplateClick = (img: string) => {
    router.push(`/face-swap?template=${encodeURIComponent(img)}`);
  };

  return (
    <section className="bg-card py-16">
      <div className="container mx-auto px-4">
        <h2 className="text-center text-3xl md:text-4xl font-extrabold mb-10 text-primary">
          {t("title")}
        </h2>
        <div
          className="grid grid-cols-3 gap-x-[55px] gap-y-8 mx-auto"
          style={{ width: 3 * 284 + 2 * 55, maxWidth: 3 * 284 + 2 * 55 }}
        >
          {templates.map((tpl, idx) => (
            <div
              key={idx}
              className="rounded-xl overflow-hidden shadow-lg transition-transform hover:scale-105 bg-card cursor-pointer"
              style={{ width: 284, minWidth: 284, height: 378, minHeight: 378 }}
              onClick={() => handleTemplateClick(tpl.img)}
            >
              <Image
                src={tpl.img}
                alt={t("alt", { index: idx + 1 })}
                width={284}
                height={378}
                className="object-cover w-full h-full"
                priority={idx < 2}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
