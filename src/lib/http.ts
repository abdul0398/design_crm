import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export async function endpoint(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError)
      return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError)
      return Response.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (e instanceof SyntaxError)
      return Response.json({ error: "Invalid request data" }, { status: 400 });
    console.error(e);
    return Response.json(
      { error: "The request could not be completed. Please retry." },
      { status: 500 },
    );
  }
}
export async function limitedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length") || 0) > limit)
    fail(413, "Upload exceeds the allowed size");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        fail(413, "Upload exceeds the allowed size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
export async function bodyJson(req: Request) {
  return JSON.parse(
    new TextDecoder().decode(await limitedBody(req, 32 * 1024)),
  );
}
