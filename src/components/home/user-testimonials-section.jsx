"use client";

import React from "react";
import { useTranslations } from 'next-intl';

export function UserTestimonialsSection() {
  const t = useTranslations('Testimonials');
  const testimonials = [
    {
      stars: 5,
      title: t('testimonial1Title'),
      content: t('testimonial1Content'),
      author: t('testimonial1Author'),
    },
    {
      stars: 5,
      title: t('testimonial2Title'),
      content: t('testimonial2Content'),
      author: t('testimonial2Author'),
    },
    {
      stars: 5,
      title: t('testimonial3Title'),
      content: t('testimonial3Content'),
      author: t('testimonial3Author'),
    },
  ];

  function StarIcon() {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 20 20"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "inline", marginRight: 2 }}
        className="text-primary"
      >
        <path d="M10 15.27L16.18 19l-1.64-7.03L20 7.24l-7.19-.61L10 0 7.19 6.63 0 7.24l5.46 4.73L3.82 19z" />
      </svg>
    );
  }

  return (
    <section
      className="w-full py-12 flex flex-col items-center bg-card text-card-foreground"
    >
      <h2 className="text-3xl md:text-4xl font-bold text-primary mb-10 text-center">
        {t('userTestimonialsTitle')}
      </h2>
      <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full max-w-6xl px-4">
        {testimonials.map((tItem, idx) => (
          <div
            key={idx}
            className="bg-card border rounded-lg shadow-lg p-7 flex-1 min-w-[300px] max-w-md flex flex-col"
          >
            <div className="mb-3 flex flex-row">
              {Array.from({ length: tItem.stars }).map((_, i) => (
                <StarIcon key={i} />
              ))}
            </div>
            <h3 className="text-xl font-bold mb-2">{tItem.title}</h3>
            <p className="text-base mb-6 text-muted-foreground">{tItem.content}</p>
            <span className="font-semibold text-card-foreground mt-auto">- {tItem.author}</span>
          </div>
        ))}
      </div>
    </section>
  );
} 