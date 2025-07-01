"use client";
import Image from "next/image";
import { useState } from "react";
import SectionFaceSwapTypes from "./SectionFaceSwapTypes";
import FaceSwapPage from "./FaceSwapPage";

const demoOrigin = "/face-demo-origin.jpg";
const demoFace = "/face-demo-face.jpg";
const demoResult = "/face-demo-result.jpg";
const demoTemplates = [
  "/face-tpl-1.jpg",
  "/face-tpl-2.jpg",
  "/face-tpl-3.jpg",
  "/face-tpl-4.jpg",
  "/face-tpl-5.jpg",
  "/face-tpl-6.jpg",
  "/face-tpl-7.jpg",
  "/face-tpl-8.jpg",
];

export default function Page() {
  return (
    <div className="w-full bg-background text-foreground flex flex-col items-center py-10 font-sans">
      <FaceSwapPage />
      <SectionFaceSwapTypes />
      {/* <SectionHowToSwap />
      <SectionCelebrityIntro />
      <UserTestimonialsSection />
      <ExploreToolsSection />
      <FAQSection />
      <FinalVideoSection /> */}
    </div>
  );
}
