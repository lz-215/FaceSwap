"use client";

import { useTranslations } from "next-intl";

interface FaceSwapStepProps {
  stepNumber: number;
  title: string;
  onSwap: () => Promise<void>;
  canSwap: boolean;
  isLoading: boolean;
  buttonText: string;
}

export function FaceSwapStep({
  stepNumber,
  title,
  onSwap,
  canSwap,
  isLoading,
  buttonText,
}: FaceSwapStepProps) {
  const t = useTranslations("FaceSwap");

  return (
    <div className="bg-white rounded-xl flex flex-row p-4 border border-gray-200">
      <div className="flex flex-col items-center justify-start pr-4 pt-1">
        <span className="w-9 h-9 rounded-full border-2 border-blue-500 text-blue-600 flex items-center justify-center font-extrabold text-lg bg-blue-100">
          {stepNumber}
        </span>
      </div>
      <div className="flex-1 flex flex-col gap-1 justify-center">
        <span className="font-extrabold text-base text-gray-800 leading-tight">
          {title}
        </span>
        <button
          className={`w-[180px] ml-0 font-bold py-2 rounded-lg mt-2 flex items-center justify-center gap-2 shadow-md text-base transition ${
            canSwap && !isLoading
              ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
          onClick={canSwap && !isLoading ? onSwap : undefined}
          disabled={!canSwap || isLoading}
        >
          {isLoading ? <span className="animate-spin mr-2">⟳</span> : null}
          {buttonText}
        </button>
      </div>
    </div>
  );
}
