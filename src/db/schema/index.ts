export * from "./payments/relations";
export * from "./payments/tables";
export * from "./payments/types";

export * from "./uploads/relations";
// 从tables中导出表定义，但不包括relations
export { uploadsTable, faceSwapHistoryTable, faceSwapStatusEnum } from "./uploads/tables";
export * from "./uploads/types";

// 积分系统
export * from "./credits/relations";
export * from "./credits/tables";
export * from "./credits/types";

// relations
// export * from "./users/relations";

// schema
export * from "./users/tables";
// types
