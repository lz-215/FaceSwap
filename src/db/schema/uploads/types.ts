import type { uploadsTable, faceSwapHistoryTable } from "./tables";

export type MediaUpload = typeof uploadsTable.$inferSelect;
// export type NewMediaUpload = typeof uploadsTable.$inferInsert;

// 人脸交换历史记录类型
export type FaceSwapHistory = typeof faceSwapHistoryTable.$inferSelect;
export type NewFaceSwapHistory = typeof faceSwapHistoryTable.$inferInsert;

// 人脸交换状态类型
export type FaceSwapStatus = "processing" | "completed" | "failed";

// 人脸交换历史记录带元数据类型
export interface FaceSwapHistoryWithMetadata extends Omit<FaceSwapHistory, 'metadata'> {
  metadata?: {
    originImageSize?: number;
    faceImageSize?: number;
    resultImageSize?: number;
    faceDetected?: boolean;
    processingDuration?: number;
  };
}
