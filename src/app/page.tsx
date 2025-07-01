import { redirect } from "next/navigation";
import { defaultLocale } from "~/i18n/i18nConfig";

export default function RootPage() {
  // 重定向到默认语言页面（URL中不会显示语言前缀）
  redirect(`/${defaultLocale}`);
}
