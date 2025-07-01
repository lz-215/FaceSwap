import { type NextRequest, NextResponse } from "next/server";

import { getCurrentSupabaseUser } from "~/lib/supabase-auth";
import { uploadFile } from "~/lib/supabase-storage";
import { createClient } from "~/lib/supabase/server";

export const config = {
  api: {
    // 禁用默认的 bodyParser，以便接收 multipart/form-data
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    // 认证检查
    // 使用更安全的 getCurrentSupabaseUser 方法获取验证过的用户数据
    const user = await getCurrentSupabaseUser()
    if (!user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 提取文件
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "没有找到文件" }, { status: 400 });
    }

    // 文件类型验证
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
    }

    // 文件大小验证（最大 10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "文件大小超出限制" }, { status: 400 });
    }

    // 上传到 Supabase
    const result = await uploadFile(
      file,
      user!.id,
      isImage ? "image" : "video",
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("上传错误:", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
