import { NextResponse } from "next/server";
import { db } from "~/db";

export async function GET() {
  try {
    console.log("=== 数据库连接诊断开始===");
    
    // 检查环境变量
    const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    console.log("DATABASE_URL存在:", !!databaseUrl);
    
    if (databaseUrl) {
      // 隐藏密码显示URL结构
      const urlParts = databaseUrl.replace(/:([^:@]+)@/, ':***@');
      console.log("数据库URL结构:", urlParts);
    }

    // 尝试简单的数据库查询
    console.log("尝试连接数据库..");
    const result = await db.execute(`SELECT version() as version, current_database() as database_name`);
    
    console.log("数据库连接成功");
    console.log("数据库版本?", result.rows[0]?.version);
    console.log("数据库名称?", result.rows[0]?.database_name);

    // 检查现有表
    const tables = await db.execute(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tableNames = tables.rows.map((row: any) => row.table_name);
    console.log("现有数据表?", tableNames);

    return NextResponse.json({
      success: true,
      message: "数据库连接成功",
      data: {
        hasConnectionString: !!databaseUrl,
        connectionTest: "通过",
        databaseVersion: result.rows[0]?.version,
        databaseName: result.rows[0]?.database_name,
        existingTables: tableNames,
        tableCount: tableNames.length
      }
    });

  } catch (error) {
    console.error("数据库连接失败", error);
    
    return NextResponse.json({
      success: false,
      error: "数据库连接失败",
      details: error instanceof Error ? error.message : "未知错误",
      data: {
        hasConnectionString: !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL),
        connectionTest: "失败",
        errorType: error instanceof Error ? error.constructor.name : "Unknown"
      }
    }, { status: 500 });
  }
} 
