import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function success(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function failure(error: unknown, status = 500) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ error: "Unknown error." }, { status });
}
