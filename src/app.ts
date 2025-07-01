export const siteConfig = {
  description: {
    zh: "AIFaceSwap 是一款基于先进AI技术的人脸交换平台，提供高质量人脸交换、实时预览和安全处理服务。",
    en: "AIFaceSwap is an AI-powered face swapping platform based on advanced AI technology, providing high-quality face swapping, real-time preview, and secure processing services.",
  },
  name: "AIFaceSwap",
  themeColor: "#000000",
  url: process.env.NEXT_PUBLIC_VERCEL_URL || "http://localhost:3000",
}

export const meta = {
  author: "AIFaceSwap",
  description: {
    en: "Professional AI-driven face swapping experience",
    zh: "专业AI驱动的人脸交换体验",
  },
  title: {
    en: "AIFaceSwap | AI Face Swapping Platform",
    zh: "AIFaceSwap | AI人脸交换平台",
  },
}

export const SEO_CONFIG = {
  description: {
    en: "AIFaceSwap is an AI-powered face swap platform using advanced artificial intelligence technology, offering high-quality face swapping with real-time preview and secure processing.",
    zh: "AIFaceSwap 是一款基于先进人工智能技术的AI人脸交换平台，提供高质量人脸交换、实时预览和安全处理服务。",
  },
  fullName: {
    en: "AIFaceSwap - Professional AI Face Swap Platform",
    zh: "AIFaceSwap - 专业AI人脸交换平台",
  },
  name: {
    en: "AIFaceSwap",
    zh: "AIFaceSwap",
  },
  slogan: {
    en: "Professional AI-powered face swap experience",
    zh: "专业AI驱动的人脸交换体验",
  },
  keywords: {
    en: "AI face swap, artificial intelligence, face exchange, portrait editing, AI photography, face morph, AIFaceSwap, deep learning",
    zh: "AI换脸, 人工智能, 人脸交换, 人像编辑, AI摄影, 面部合成, AIFaceSwap, 深度学习",
  },
};

export const SYSTEM_CONFIG = {
  redirectAfterSignIn: "/face-swap",
  redirectAfterSignUp: "/face-swap",
  repoName: "ai-face-swap",
  repoOwner: "your-username",
  repoStars: true,
};

const ADMIN_CONFIG = {
  displayEmails: false,
};

export const DB_DEV_LOGGER = false;
