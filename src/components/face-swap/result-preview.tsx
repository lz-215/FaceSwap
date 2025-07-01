"use client";

import { useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

interface ResultPreviewProps {
  origin: string | null;
  result: string | null;
  split: number;
  setSplit: (split: number) => void;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  isLoading: boolean;
  onZoom: () => void;
  onDownload: () => void;
  className?: string;
}

export function ResultPreview({
  origin,
  result,
  split,
  setSplit,
  dragging,
  setDragging,
  isLoading,
  onZoom,
  onDownload,
  className = "",
}: ResultPreviewProps) {
  const t = useTranslations("FaceSwap");
  const previewRef = useRef<HTMLDivElement>(null);

  // 拖动分割?
  const handleDrag = (e: React.MouseEvent) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let percent = (x / rect.width) * 100;
    percent = Math.max(0, Math.min(100, percent));
    setSplit(percent);
  };

  // 处理拖拽事件
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging && previewRef.current) {
        const rect = previewRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        let percent = (x / rect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));
        setSplit(percent);
      }
    };

    const handleMouseUp = () => {
      if (dragging) {
        setDragging(false);
      }
    };

    if (dragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, setSplit, setDragging]);

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        ref={previewRef}
        className="relative w-full h-full bg-card rounded-2xl overflow-hidden flex items-center justify-center border-4 border-border shadow-lg"
        style={{ transition: "transform 0.2s" }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="flex flex-col items-center">
              <span className="text-primary text-2xl animate-spin mb-2">⟳</span>
              <p className="text-muted-foreground">{t("swapping")}</p>
            </div>
          </div>
        ) : origin && result ? (
          <>
            {/* Before图层 */}
            <img
              src={origin}
              alt="before"
              className="absolute top-0 left-0 w-full h-full object-contain"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            {/* After图层 */}
            <img
              src={result}
              alt="after"
              className="absolute top-0 left-0 w-full h-full object-contain"
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            />
            {/* 分割线 */}
            <div
              className="absolute top-0 left-0 h-full w-0.5 bg-primary z-10"
              style={{
                left: `${split}%`,
                width: "3px",
                marginLeft: "-1.5px",
                cursor: "ew-resize",
              }}
              onMouseDown={() => setDragging(true)}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary rounded-full w-8 h-8 flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-lg border-2 border-background cursor-ew-resize select-none">
                ↔
              </div>
            </div>
            {/* Before/After 标签 */}
            <span className="absolute top-2 left-4 bg-card/80 px-2 py-1 rounded text-xs font-bold text-card-foreground">
              {t("before", { defaultMessage: "Before" })}
            </span>
            <span className="absolute top-2 right-4 bg-card/80 px-2 py-1 rounded text-xs font-bold text-card-foreground">
              {t("after", { defaultMessage: "After" })}
            </span>
          </>
        ) : origin ? (
          <img
            src={origin}
            alt="origin-preview"
            className="w-full h-full object-contain"
          />
        ) : (
          <span className="text-muted-foreground text-lg">
            {t("pleaseUpload")}
          </span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-row gap-4 mt-4">
        <button
          className="bg-card/80 text-foreground px-4 py-2 rounded-lg font-bold hover:bg-card/90 transition"
          onClick={onZoom}
          disabled={isLoading}
        >
          🔍 {t("zoomIn", { defaultMessage: "Zoom In" })}
        </button>
        {origin && result && !isLoading && (
          <button
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold hover:bg-primary/90 transition flex items-center gap-2"
            onClick={onDownload}
          >
            <span>{t("download", { defaultMessage: "Download" })}</span>
          </button>
        )}
      </div>
    </div>
  );
}
