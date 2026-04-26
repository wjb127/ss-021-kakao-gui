// 카테고리 설정/해제
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setCategory } from "@/lib/store";
import type { Category } from "@/lib/types";

const VALID: Category[] = ["bot", "client", "casual"];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      chatId?: string;
      category?: Category | null;
    };
    if (!body.chatId) {
      return NextResponse.json(
        { error: "chatId 가 필요함" },
        { status: 400 },
      );
    }
    if (
      body.category !== null &&
      body.category !== undefined &&
      !VALID.includes(body.category)
    ) {
      return NextResponse.json(
        { error: "유효하지 않은 카테고리" },
        { status: 400 },
      );
    }
    await setCategory(body.chatId, body.category ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
