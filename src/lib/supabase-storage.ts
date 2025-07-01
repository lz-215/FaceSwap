import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db } from "~/db";
import { uploadsTable } from "~/db/schema";
import { supabase } from "~/lib/supabase-client";

// 默认存储桶名称
const BUCKET_NAME = "media";

// 创建一个存储桶的引用
export const getStorageBucket = (bucketName: string = BUCKET_NAME) => {
  return supabase.storage.from(bucketName);
};

// 删除文件
export async function deleteFile(
  fileKey: string,
  bucketName: string = BUCKET_NAME,
) {
  try {
    const { error } = await getStorageBucket(bucketName).remove([fileKey]);
    if (error) {
      throw error;
    }

    // 从数据库中删除记录
    await db.delete(uploadsTable).where(eq(uploadsTable.key, fileKey));

    return { success: true };
  } catch (error) {
    console.error("文件删除失败:", error);
    throw error;
  }
}

// 上传文件
export async function uploadFile(
  file: File,
  userId: string,
  type: "image" | "video" = "image",
  bucketName: string = BUCKET_NAME,
) {
  try {
    // 生成唯一文件名
    const fileExt = file.name.split(".").pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // 上传到 Supabase 存储
    const { error } = await getStorageBucket(bucketName).upload(
      filePath,
      file,
      {
        cacheControl: "3600",
        upsert: false,
      },
    );

    if (error) {
      throw error;
    }

    // 获取公共 URL
    const { data: publicUrlData } =
      getStorageBucket(bucketName).getPublicUrl(filePath);

    // 保存上传记录到数据库
    await db.insert(uploadsTable).values({
      id: createId(),
      key: filePath,
      type,
      url: publicUrlData.publicUrl,
      userId,
    });

    return {
      fileKey: filePath,
      fileUrl: publicUrlData.publicUrl,
      uploadedBy: userId,
    };
  } catch (error) {
    console.error("文件上传失败:", error);
    throw error;
  }
}
