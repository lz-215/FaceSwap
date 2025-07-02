import { createId } from "@paralleldrive/cuid2";
import { v4 as uuidv4 } from "uuid";

import { createClient } from "~/lib/supabase/server";
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
    const supabaseClient = await createClient();
    
    const { error } = await getStorageBucket(bucketName).remove([fileKey]);
    if (error) {
      throw error;
    }

    // 从数据库中删除记录
    const { error: dbError } = await supabaseClient
      .from("uploads")
      .delete()
      .eq("key", fileKey);

    if (dbError) {
      console.error("删除数据库记录失败:", dbError);
    }

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
    const supabaseClient = await createClient();
    
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
    const { error: dbError } = await supabaseClient
      .from("uploads")
      .insert({
        id: createId(),
        key: filePath,
        type,
        url: publicUrlData.publicUrl,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error("保存上传记录失败:", dbError);
      throw dbError;
    }

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
