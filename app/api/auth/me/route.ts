import { NextResponse } from "next/server";
import { withTeamApi } from "@/lib/team-auth";
export const GET = withTeamApi(async (_req, user) => NextResponse.json({ user }), "member");
