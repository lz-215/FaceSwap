import { HowToSwapSection } from "~/components/home/how-to-swap";
import { HeroSection } from "~/components/home/hero-section";
import { AISwapFaceCasesSection } from "~/components/home/AISwapFaceCases-section";
import { TemplateSection } from "~/components/home/template-section";
import { UserTestimonialsSection } from "~/components/home/user-testimonials-section";
import { FAQSection } from "~/components/home/faq-section";
import { FinalVideoSection } from "~/components/home/final-video";

export default function HomePage() {
  return (
    <>
      <main
        className={`
          flex min-h-screen flex-col gap-y-0  from-muted/50  bg-[#181818]
          via-muted/25 to-background
        `}
      >
        {/* Hero Section bg-gradient-to-b*/}
        <HeroSection />

        <TemplateSection />

        <HowToSwapSection />

        {/* Home Testimonials Section */}
        <AISwapFaceCasesSection />

        {/* User Testimonials Section */}
        <UserTestimonialsSection />

        {/* AI Colorization Gallery 
        <ExploreToolsSection /> */}

        {/* FAQ Section */}
        <FAQSection />

        {/* Final CTA Section */}
        <FinalVideoSection />
      </main>

      {/* 示例：如何引用multiple-face-swap页面 */}
      {/* <MultipleFaceSwapPage /> */}
    </>
  );
}
