"use client";

import Image from "next/image";

interface TemplateGalleryProps {
  templates: string[];
  onTemplateClick: (template: string) => void;
  className?: string;
}

export function TemplateGallery({
  templates,
  onTemplateClick,
  className = "",
}: TemplateGalleryProps) {
  return (
    <div className={`flex flex-row gap-5 ${className}`}>
      {templates.map((template, index) => (
        <div
          key={index}
          className="w-[81px] h-[81px] rounded-xl overflow-hidden bg-neutral-700 flex items-center justify-center border-2 border-neutral-600 hover:border-lime-400 transition cursor-pointer"
          onClick={() => onTemplateClick(template)}
        >
          <Image
            src={template}
            alt={`template${index + 1}`}
            width={81}
            height={81}
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
