import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "AIFaceSwap",
      version: "1.0.0",
    });
  } catch (error) {
    return NextResponse.json(
      { 
        status: "error",
        timestamp: new Date().toISOString(),
        error: "Health check failed"
      },
      { status: 500 }
    );
  }
} 
