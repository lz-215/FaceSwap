import { NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";

export async function GET() {
  try {
    console.log("=== 数据库连接诊断开始===");

    // 检查环境变量
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    console.log("SUPABASE_URL存在:", !!supabaseUrl);
    console.log("SUPABASE_ANON_KEY存在:", !!supabaseKey);

    if (supabaseUrl && supabaseKey) {
      // 隐藏 key 显示 URL 结构
      const urlParts = supabaseUrl.replace(/(\w{6})\w+(\w{4})/, '$1***$2');
      console.log("Supabase URL结构:", urlParts);
    }

    // 尝试简单的数据库查询
    console.log("尝试连接 Supabase 数据库..");
    const supabase = await createClient();
    // 查询表名
    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (error) {
      throw error;
    }

    const tableNames = tables?.map((row: any) => row.table_name) || [];
    console.log("现有数据表?", tableNames);

    return NextResponse.json({
      success: true,
      message: "Supabase HTTP API 连接成功",
      data: {
        hasConnectionString: !!supabaseUrl && !!supabaseKey,
        connectionTest: "通过",
        existingTables: tableNames,
        tableCount: tableNames.length
      }
    });
  } catch (error) {
    console.error("数据库连接失败:", error);
    return NextResponse.json({
      success: false,
      message: "数据库连接失败",
      error: String(error)
    }, { status: 500 });
  }
} 
