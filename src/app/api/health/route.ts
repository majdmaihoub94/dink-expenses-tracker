import { NextResponse } from "next/server";

/** Railway health check. Deliberately does not touch the database. */
export async function GET() {
  return NextResponse.json({ status: "ok", app: "dinx", time: new Date().toISOString() });
}
