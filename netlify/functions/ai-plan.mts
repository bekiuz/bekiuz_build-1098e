import process from "process";
import OpenAI from "openai";

declare const Netlify: {
  env: { get(name: string): string | undefined };
};

const ALLOWED_ORIGINS = new Set([
  "https://bekiuz.github.io",
  "https://bekiuz-build.netlify.app",
  "https://delightful-stroopwafel-31f3ff.netlify.app",
  "https://bekiuz-ai-build.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost"
]);

type Project = {
  houseWidth: number;
  houseLength: number;
  slabThicknessCm: number;
  wallHeight: number;
  wallThicknessCm: number;
  floors: number;
  rooms: number;
  doorCount: number;
  windowCount: number;
  roofType: "gable" | "hip" | "flat";
  roofCover: "shifer" | "profnastil";
};

type Room = { name: string; x: number; y: number; width: number; length: number };

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "600",
    "vary": "Origin"
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function jsonResponse(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function validateProject(value: unknown): Project {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const roofType = input.roofType === "hip" || input.roofType === "flat" ? input.roofType : "gable";
  return {
    houseWidth: boundedNumber(input.houseWidth, 7, 3, 30),
    houseLength: boundedNumber(input.houseLength, 5, 3, 40),
    slabThicknessCm: boundedNumber(input.slabThicknessCm, 30, 8, 60),
    wallHeight: boundedNumber(input.wallHeight, 2.8, 2, 5),
    wallThicknessCm: boundedNumber(input.wallThicknessCm, 25, 10, 60),
    floors: Math.round(boundedNumber(input.floors, 1, 1, 3)),
    rooms: Math.round(boundedNumber(input.rooms, 3, 2, 8)),
    doorCount: Math.round(boundedNumber(input.doorCount, 1, 1, 8)),
    windowCount: Math.round(boundedNumber(input.windowCount, 4, 0, 20)),
    roofType,
    roofCover: input.roofCover === "profnastil" ? "profnastil" : "shifer"
  };
}

function fallbackRooms(count: number): Room[] {
  const names = ["Mehmonxona", "Oshxona", "Yotoqxona", "Yotoqxona 2", "Sanuzel", "Dahliz", "Ish xonasi", "Ombor"];
  if (count === 2) return [
    { name: names[0], x: 0, y: 0, width: 0.5, length: 1 },
    { name: names[2], x: 0.5, y: 0, width: 0.5, length: 1 }
  ];
  if (count === 3) return [
    { name: names[0], x: 0, y: 0, width: 0.5, length: 0.52 },
    { name: names[1], x: 0.5, y: 0, width: 0.5, length: 0.52 },
    { name: names[2], x: 0, y: 0.52, width: 1, length: 0.48 }
  ];
  if (count === 4) return [
    { name: names[0], x: 0, y: 0, width: 0.5, length: 0.5 },
    { name: names[1], x: 0.5, y: 0, width: 0.5, length: 0.5 },
    { name: names[2], x: 0, y: 0.5, width: 0.5, length: 0.5 },
    { name: names[3], x: 0.5, y: 0.5, width: 0.5, length: 0.5 }
  ];
  if (count === 5) return [
    { name: names[0], x: 0, y: 0, width: 1 / 3, length: 0.5 },
    { name: names[1], x: 1 / 3, y: 0, width: 1 / 3, length: 0.5 },
    { name: names[2], x: 2 / 3, y: 0, width: 1 / 3, length: 0.5 },
    { name: names[3], x: 0, y: 0.5, width: 0.5, length: 0.5 },
    { name: names[4], x: 0.5, y: 0.5, width: 0.5, length: 0.5 }
  ];
  const columns = count <= 6 ? 3 : 4;
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) => ({
    name: names[i] || ("Xona " + (i + 1)),
    x: (i % columns) / columns,
    y: Math.floor(i / columns) / rows,
    width: 1 / columns,
    length: 1 / rows
  }));
}

function validateRooms(value: unknown, count: number): Room[] {
  if (!Array.isArray(value) || value.length !== count) return fallbackRooms(count);
  const rooms: Array<Room | null> = value.map((item: unknown) => {
    if (!item || typeof item !== "object") return null;
    const room = item as Record<string, unknown>;
    const x = Number(room.x), y = Number(room.y), width = Number(room.width), length = Number(room.length);
    const name = typeof room.name === "string" ? room.name.trim().slice(0, 36) : "";
    if (!name || ![x, y, width, length].every(Number.isFinite)) return null;
    if (x < 0 || y < 0 || width < 0.12 || length < 0.12 || x + width > 1.001 || y + length > 1.001) return null;
    return { name, x, y, width, length };
  });
  if (rooms.some((room) => room === null)) return fallbackRooms(count);
  const valid = rooms as Room[];
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const a = valid[i], b = valid[j];
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.length, b.y + b.length) - Math.max(a.y, b.y);
      if (overlapX > 0.025 && overlapY > 0.025) return fallbackRooms(count);
    }
  }
  const covered = valid.reduce((sum, room) => sum + room.width * room.length, 0);
  return covered < 0.72 || covered > 1.05 ? fallbackRooms(count) : valid;
}

function parseJsonReply(reply: string): Record<string, unknown> {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI JSON formatida javob bermadi.");
  const parsed: unknown = JSON.parse(reply.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object") throw new Error("AI javobi noto‘g‘ri formatda.");
  return parsed as Record<string, unknown>;
}

const getModel = () => process.env.BEKIUZ_BUILD_AI_MODEL || "gpt-4.1-mini";

export default async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(request, { ok: false, error: "Bu manbadan so‘rov qabul qilinmaydi.", code: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

  if (request.method === "GET") {
    const gatewayReady = Boolean(process.env.OPENAI_BASE_URL && process.env.OPENAI_API_KEY);
    return jsonResponse(request, {
      ok: gatewayReady,
      configured: gatewayReady,
      provider: "Netlify AI Gateway",
      model: getModel(),
      error: gatewayReady ? undefined : "Netlify AI Gateway hozir mavjud emas. Netlify hisobida AI Features yoqilganini va loyiha production deploy qilinganini tekshiring."
    }, gatewayReady ? 200 : 503);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { ok: false, error: "Faqat POST so‘rovi qabul qilinadi.", code: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!process.env.OPENAI_BASE_URL || !process.env.OPENAI_API_KEY) {
    return jsonResponse(request, {
      ok: false,
      error: "Netlify AI Gateway aktiv emas. Netlify hisobida AI Features yoqilganini tekshiring.",
      code: "AI_GATEWAY_NOT_CONFIGURED"
    }, 503);
  }

  let body: { prompt?: unknown; project?: unknown };
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 10000) return jsonResponse(request, { ok: false, error: "So‘rov hajmi juda katta." }, 413);
    body = await request.json() as { prompt?: unknown; project?: unknown };
  } catch {
    return jsonResponse(request, { ok: false, error: "So‘rov JSON formatida bo‘lishi kerak." }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return jsonResponse(request, { ok: false, error: "Uy haqidagi talablaringizni yozing." }, 400);
  if (prompt.length > 1200) return jsonResponse(request, { ok: false, error: "So‘rov 1200 belgidan oshmasligi kerak." }, 400);

  const project = validateProject(body.project);
  const instructions = [
    "Sen BEKIUZ BUILD uy rejalashtirish yordamchisisan. Javobni o‘zbek tilida yoz.",
    "Faqat JSON qaytar: {\"summary\":\"qisqa izoh\",\"recommendations\":[\"qisqa tavsiya\"],\"rooms\":[{\"name\":\"Mehmonxona\",\"x\":0,\"y\":0,\"width\":0.5,\"length\":1}]}",
    "rooms massivida aynan " + project.rooms + " ta xona bo‘lsin. Xona x,y,width,length koordinatalari 0..1 oralig‘idagi ulushlardir. Xonalar to‘rtburchak bo‘lsin, uy chegarasidan chiqmasin, ustma-ust tushmasin va uy maydonining kamida 72 foizini qoplasin.",
    "Uy eni, bo‘yi yoki qavatlar sonini o‘zgartirma. Qisqa, foydali o‘zbekcha xona nomlari ishlat. Tavsiyalar ko‘pi bilan 3 ta va qisqa bo‘lsin.",
    "Material miqdorlari saytda alohida hisoblanadi; narx o‘ylab topma. Chizma konseptual. Fundament, armatura, ustun/to‘sin, grunt va konstruktiv xavfsizlikni muhandis tekshirishi kerakligini tavsiya qil.",
    "PARAMETRLAR: " + JSON.stringify(project),
    "FOYDALANUVCHI TALABI: " + prompt
  ].join("\n");

  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: "system", content: "Sen ehtiyotkor, lo‘nda, JSON formatida javob beradigan o‘zbek uy rejalashtirish AI yordamchisisan." },
        { role: "user", content: instructions }
      ],
      max_tokens: 600
    }, { timeout: 22000, maxRetries: 0 });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("AI bo‘sh javob qaytardi.");
    const parsed = parseJsonReply(content);
    const summary = typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim().slice(0, 600)
      : "Uy uchun konseptual reja tayyorlandi.";
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 220)).filter(Boolean).slice(0, 3)
      : [];

    return jsonResponse(request, {
      ok: true,
      plan: { summary, recommendations, rooms: validateRooms(parsed.rooms, project.rooms) },
      model: completion.model
    });
  } catch (error) {
    const apiError = error as { status?: unknown; code?: unknown; type?: unknown; message?: unknown };
    const status = Number(apiError?.status || 0);
    const providerMessage = String(apiError?.message || error || "").slice(0, 320);
    const message = providerMessage.toLowerCase();
    console.error("BEKIUZ BUILD AI Gateway request failed", {
      status,
      code: String(apiError?.code || "").slice(0, 100),
      type: String(apiError?.type || "").slice(0, 100),
      message: providerMessage
    });
    if (status === 429) {
      return jsonResponse(request, { ok: false, error: "Netlify AI Gateway limiti tugadi. Birozdan keyin urinib ko‘ring.", code: "AI_RATE_LIMIT" }, 429);
    }
    if (status === 401 || status === 403) {
      return jsonResponse(request, { ok: false, error: "Netlify AI Gateway ruxsati yo‘q. Netlify hisobida AI Features yoqilganini tekshiring.", code: "AI_GATEWAY_AUTH_ERROR" }, 503);
    }
    if (/timeout|timed out|abort/.test(message)) {
      return jsonResponse(request, { ok: false, error: "AI javobi vaqtida kelmadi. Qayta urinib ko‘ring.", code: "AI_TIMEOUT" }, 504);
    }
    if (error instanceof SyntaxError) {
      return jsonResponse(request, { ok: false, error: "AI chizma javobini JSON formatida bera olmadi. Yana urinib ko‘ring.", code: "AI_PARSE_ERROR" }, 502);
    }
    const providerCode = String(apiError?.code || apiError?.type || "AI_PROVIDER_ERROR").slice(0, 80);
    const detail = providerMessage ? (" Sabab: " + providerMessage) : "";
    return jsonResponse(request, {
      ok: false,
      error: "AI modeliga so‘rov muvaffaqiyatsiz. Kod: " + providerCode + (status ? " (HTTP " + status + ")" : "") + "." + detail,
      code: "AI_PROVIDER_ERROR",
      providerStatus: status || undefined,
      providerCode
    }, 502);
  }
};

export const config = {
  path: ["/.netlify/functions/ai-plan"],
  method: ["GET", "POST", "OPTIONS"],
  rateLimit: {
    action: "rate_limit",
    aggregateBy: "ip",
    windowSize: 60,
    windowLimit: 5
  }
};
