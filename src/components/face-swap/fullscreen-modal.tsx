"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

interface FullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  origin: string | null;
  result: string | null;
  split: number;
  setSplit: (split: number) => void;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  isLoading: boolean;
}

export function FullscreenModal({
  isOpen,
  onClose,
  origin,
  result,
  split,
  setSplit,
  dragging,
  setDragging,
  isLoading,
}: FullscreenModalProps) {
  const t = useTranslations("FaceSwap");
  const previewRef = useRef<HTMLDivElement>(null);

  // 拖动分割线
  const handleDrag = (e: React.MouseEvent) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let percent = (x / rect.width) * 100;
    percent = Math.max(0, Math.min(100, percent));
    setSplit(percent);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      <div className="absolute top-4 right-4">
        <button
          className="bg-card/80 text-foreground px-4 py-2 rounded-lg font-bold hover:bg-card/90 transition"
          onClick={() => {
            onClose();
            setDragging(false);
          }}
        >
          {t("close", { defaultMessage: "Close" })}
        </button>
      </div>
      <div
        ref={previewRef}
        className="relative w-[80vw] h-[80vh] bg-card rounded-2xl overflow-hidden flex items-center justify-center border-4 border-border shadow-lg"
        style={{ maxWidth: 1200, maxHeight: 800 }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="text-center">
              <span className="text-primary text-2xl animate-spin mb-2">⟳</span>
              <p className="text-muted-foreground">{t("swapping")}</p>
            </div>
          </div>
        ) : origin && result ? (
          <>
            <img
              src={origin}
              alt="before"
              className="absolute top-0 left-0 w-full h-full object-contain"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <img
              src={result}
              alt="after"
              className="absolute top-0 left-0 w-full h-full object-contain"
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            />
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
        {dragging && !isLoading && (
          <div
            className="fixed inset-0 z-50"
            style={{ cursor: "ew-resize" }}
            onMouseMove={handleDrag}
            onMouseUp={() => setDragging(false)}
          />
        )}
      </div>
    </div>
  );
}
