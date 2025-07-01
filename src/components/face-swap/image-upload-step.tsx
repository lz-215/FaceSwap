"use client";

import { useTranslations } from "next-intl";

interface ImageUploadStepProps {
  stepNumber: number;
  title: string;
  image: string | null;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  acceptTypes: string;
  uploadFormats: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function ImageUploadStep({
  stepNumber,
  title,
  image,
  onUpload,
  acceptTypes,
  uploadFormats,
  disabled = false,
  isLoading = false,
}: ImageUploadStepProps) {
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
        <div className="flex items-center gap-2 mt-2 mb-1">
          {image && (
            <img
              src={image}
              alt={`step-${stepNumber}-thumb`}
              className="w-10 h-10 rounded-full object-cover border-2 border-blue-500"
            />
          )}
          <label
            className={`w-[150px] ${
              !disabled && !isLoading
                ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                : "bg-gray-200 text-gray-500 cursor-not-allowed opacity-60"
            } font-bold py-2 rounded-lg flex items-center justify-center gap-2 shadow-md text-[15px] whitespace-nowrap transition`}
          >
            {image ? t("changeImage") : t("uploadImage")}{" "}
            <span className="text-lg">⬆️</span>
            <input
              type="file"
              accept={acceptTypes}
              className="hidden"
              onChange={onUpload}
              disabled={disabled || isLoading}
            />
          </label>
        </div>
        <div className="text-xs text-gray-500">{uploadFormats}</div>
      </div>
    </div>
  );
}
