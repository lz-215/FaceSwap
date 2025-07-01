import { type NextRequest, NextResponse } from "next/server";

import { createCreditRecharge } from "~/api/credits/credit-service";
import { getCurrentSupabaseUser } from "~/lib/supabase-auth";

export async function POST(request: NextRequest) {
  try {
    // 获取用户会话
    const user = await getCurrentSupabaseUser();
    if (!user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 },
      );
    }

    const userId = user.id;
    const { packageId }: any = await request.json();

    if (!packageId) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 },
      );
    }

    // 创建积分充值
    const result = await createCreditRecharge(userId, packageId);

    return NextResponse.json({
      clientSecret: result.clientSecret,
      rechargeId: result.recharge.id,
      success: true,
    });
  } catch (error: any) {
    console.error("创建积分充值失败:", error);
    return NextResponse.json(
      { error: error.message || "创建积分充值失败" },
      { status: 500 },
    );
  }
}
