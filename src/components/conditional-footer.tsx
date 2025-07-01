"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";

export function ConditionalFooter() {
  const pathname = usePathname();

  // 在历史页面时不显示footer
  if (pathname?.includes("/dashboard/history")) {
    return null;
  }

  return <Footer />;
}
