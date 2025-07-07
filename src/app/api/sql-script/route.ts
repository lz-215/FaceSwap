import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(request: NextRequest) {
  try {
    // 读取新的清理和修复脚本
    const sqlPath = join(process.cwd(), 'src/db/sql/clean-and-fix-auth.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');
    
    return new NextResponse(sqlContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="clean-and-fix-auth.sql"'
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      error: 'Failed to read SQL script',
      details: errorMessage
    }, { status: 500 });
  }
} 