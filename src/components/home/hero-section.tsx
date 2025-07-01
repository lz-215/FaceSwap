"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState, useRef } from "react";
import React from "react";

import { Link } from "~/i18n/i18nConfig";
import { Button } from "~/components/ui/button";
// 示例图片数据
const sampleImages = [
  {
    alt: "Sample 1",
    src: "https://zvcxdyuidlhzvmhsviwc.supabase.co/storage/v1/object/public/images/simple-1.png",
  },
  {
    alt: "Sample 2",
    src: "https://zvcxdyuidlhzvmhsviwc.supabase.co/storage/v1/object/public/images/simple-2.png",
  },
  {
    alt: "Sample 3",
    src: "https://zvcxdyuidlhzvmhsviwc.supabase.co/storage/v1/object/public/images/simple-3.png",
  },
  {
    alt: "Sample 4",
    src: "https://zvcxdyuidlhzvmhsviwc.supabase.co/storage/v1/object/public/images/simple-4.png",
  },
];

export function HeroSection() {
  const t = useTranslations("Home");
  const [activePhoto, setActivePhoto] = useState<null | number>(null);
  const [divider, setDivider] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDragStart = (e: React.MouseEvent) => {
    dragging.current = true;
    document.body.style.userSelect = "none";
  };
  const onDrag = (e: React.MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    setDivider((x / rect.width) * 100);
  };
  const onDragEnd = () => {
    dragging.current = false;
    document.body.style.userSelect = "";
  };

  React.useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(x, rect.width));
      setDivider((x / rect.width) * 100);
    };
    const handleUp = () => onDragEnd();
    if (dragging.current) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging.current]);

  return (
    <section className="bg-background w-full py-16">
      <div className="mx-auto flex max-w-7xl flex-col-reverse items-center gap-8 px-4 lg:flex-row lg:gap-16">
        {/* 左侧文案区 */}
        <div className="flex-1 flex flex-col justify-center items-start gap-4 text-left">
          <h1 className="text-3xl md:text-4xl lg:text-4xl font-extrabold leading-tight text-primary">
            {t("heroTitle")}
          </h1>
          <div className="text-base md:leading-loose text-muted-foreground space-y-1">
            <p>{t("heroDesc1")}</p>
            <p>{t("heroDesc2")}</p>
            <p>{t("heroDesc3")}</p>
          </div>
          <a href="/face-swap">
            <button
              className="mt-4 rounded-md bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
              type="button"
            >
              {t("swapNow")}
              <span className="ml-2">&rarr;</span>
            </button>
          </a>
        </div>
        {/* 右侧对比图区 */}
        <div className="flex-1 flex items-center justify-center min-w-[320px]">
          <div
            className="relative w-full max-w-xl aspect-[4/3] bg-card rounded-xl overflow-hidden flex items-center justify-center select-none"
            ref={containerRef}
            onMouseDown={(e) => e.preventDefault()}
          >
            {/* Before 图（左侧，裁剪到分割线） */}
            <img
              src="/images/before1.png"
              alt="Before"
              className="absolute left-0 top-0 h-full object-cover"
              style={{
                width: "100%",
                clipPath: `inset(0 ${100 - divider}% 0 0)`,
                borderRadius: "0.75rem",
              }}
            />
            {/* After 图（右侧，裁剪到分割线右侧） */}
            <img
              src="/images/after1.png"
              alt="After"
              className="absolute left-0 top-0 h-full object-cover"
              style={{
                width: "100%",
                clipPath: `inset(0 0 0 ${divider}%)`,
                borderRadius: "0.75rem",
              }}
            />
            {/* 分割线（可拖动） */}
            <div
              className="absolute top-0 h-full w-1.5 bg-primary z-10 flex flex-col items-center cursor-ew-resize"
              style={{ left: `calc(${divider}% - 0.75rem/2)` }}
              onMouseDown={onDragStart}
              onMouseMove={onDrag}
              onMouseUp={onDragEnd}
            >
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-primary rounded-full w-10 h-10 flex items-center justify-center shadow-lg border-4 border-card cursor-ew-resize">
                <span className="text-primary-foreground text-2xl font-bold">
                  ↔
                </span>
              </div>
            </div>
            {/* Before/After 标签 */}
            <span className="absolute left-3 top-3 bg-card text-card-foreground text-xs px-3 py-1 rounded-md opacity-80">
              {t("before")}
            </span>
            <span className="absolute right-3 top-3 bg-card text-card-foreground text-xs px-3 py-1 rounded-md opacity-80">
              {t("after")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
