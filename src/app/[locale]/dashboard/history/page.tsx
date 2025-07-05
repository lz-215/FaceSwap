"use client";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "~/lib/supabase/client";
import { useEffect, useState } from "react";
import { useAuth } from "~/lib/hooks/use-auth";

function FaceSwapHistory() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const t = useTranslations("History");
  // 调试：打印 selectedCount 的翻译结果
  console.log("t(selectedCount):", t("selectedCount", { count: 1 }));
  const { user } = useAuth();
  console.log("当前登录用户ID:", user?.id);

  const fetchHistory = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("face_swap_histories")
      .select("id, result_image_path, description, created_at, user_id")
      .order("created_at", { ascending: false });
    if (data) {
      const paths = data
        .map((item) => item.result_image_path)
        .filter((p) => typeof p === "string" && p.length > 0);
      if (paths.length !== data.length) {
        console.warn(
          "部分历史记录的result_image_path无效，已自动过滤:",
          data.filter((item) => !item.result_image_path)
        );
      }
      let signedUrls: any[] = [];
      let error = null;
      if (paths.length > 0) {
        const res = await supabase.storage
          .from("swap-after")
          .createSignedUrls(paths, 60 * 60); // 1小时有效
        signedUrls = res.data ?? [];
        error = res.error;
        if (error) {
          console.error("签名URL生成失败:", error);
        }
      } else {
        signedUrls = [];
      }
      const itemsWithUrls = data.map((item) => {
        const idx = paths.indexOf(item.result_image_path);
        return {
          ...item,
          signedUrl:
            idx !== -1 && signedUrls ? signedUrls[idx]?.signedUrl || "" : "",
        };
      });
      setItems(itemsWithUrls);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // 删除 Storage 图片辅助函数
  const deleteStorageImage = async (path: string) => {
    try {
      const supabase = createClient();
      await supabase.storage.from("swap-after").remove([path]);
    } catch (e) {
      // 忽略 Storage 删除失败
    }
  };

  // 单条删除
  const handleDelete = async (id: string, path: string) => {
    if (!confirm("确定要删除这条历史记录吗？")) return;
    setDeletingIds((ids) => [...ids, id]);
    await deleteStorageImage(path);
    const supabase = createClient();
    await supabase.from("face_swap_histories").delete().eq("id", id);
    setDeletingIds((ids) => ids.filter((x) => x !== id));
    fetchHistory();
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`确定要删除选中的${selectedIds.length}条历史记录吗？`)) return;
    setDeletingIds((ids) => [...ids, ...selectedIds]);
    const toDelete = items.filter((item) => selectedIds.includes(item.id));
    for (const item of toDelete) {
      await deleteStorageImage(item.result_image_path);
    }
    const supabase = createClient();
    await supabase.from("face_swap_histories").delete().in("id", selectedIds);
    setDeletingIds((ids) => ids.filter((x) => !selectedIds.includes(x)));
    setSelectedIds([]);
    fetchHistory();
  };

  // 选择切换
  const toggleSelect = (id: string) => {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  };

  if (!items.length)
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t("noHistory")}
      </div>
    );

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <button
          className="px-4 py-2 bg-slate-200 text-slate-700 rounded border border-slate-300 hover:bg-slate-300 transition disabled:opacity-50"
          onClick={() => {
            if (selectedIds.length === items.length) {
              setSelectedIds([]);
            } else {
              setSelectedIds(items.map((item) => item.id));
            }
          }}
          disabled={loading || !items.length}
        >
          {selectedIds.length === items.length
            ? t("unselectAll")
            : t("selectAll")}
        </button>
        <button
          className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
          onClick={handleBatchDelete}
          disabled={!selectedIds.length || deletingIds.length > 0}
        >
          {t("batchDelete")}
        </button>
        <span className="text-sm text-gray-500">
          {t("selectedCount", { count: selectedIds.length })}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
        {items.map((item) => (
          <div
            key={item.id}
            className="border rounded-lg p-3 bg-white shadow-sm flex flex-col items-center relative max-w-xs w-full mx-auto"
          >
            {/* 卡片头部：选择框和删除按钮横向排列 */}
            <div className="w-full flex items-center justify-between mb-2">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => toggleSelect(item.id)}
                disabled={deletingIds.includes(item.id)}
                className="mr-2"
              />
              {user?.id === item.user_id && (
                <button
                  className="text-red-500 hover:text-red-700 text-lg"
                  onClick={() => handleDelete(item.id, item.result_image_path)}
                  disabled={deletingIds.includes(item.id)}
                  title={t("delete")}
                >
                  {deletingIds.includes(item.id) ? "..." : "×"}
                </button>
              )}
            </div>
            {/* 图片容器，9:16比例，点击可全屏 */}
            <div
              className="w-full aspect-[9/16] mb-2 overflow-hidden rounded bg-gray-100 flex items-center justify-center cursor-pointer"
              onClick={() => setPreviewUrl(item.signedUrl)}
            >
              <img
                src={item.signedUrl}
                alt={t("resultAlt")}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
            <div className="text-xs text-gray-500 mb-1">
              {item.description === "AI换脸结果" ||
              item.description === "Face swap result"
                ? t("faceSwapResult")
                : item.description || "-"}
            </div>
            <div className="text-xs text-gray-400">
              {new Date(item.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      {/* 全屏图片预览 */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute top-2 right-2 text-white text-3xl font-bold z-10 bg-black/50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-black/80"
              onClick={() => setPreviewUrl(null)}
              aria-label="关闭预览"
            >
              ×
            </button>
            <img
              src={previewUrl}
              alt="预览"
              className="max-h-[90vh] max-w-[90vw] rounded shadow-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const tHistory = useTranslations("History");
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Card className="border border-slate-200 shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-slate-100 rounded-xl text-slate-700">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">
                {tHistory("title")}
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FaceSwapHistory />
        </CardContent>
      </Card>
    </div>
  );
}
