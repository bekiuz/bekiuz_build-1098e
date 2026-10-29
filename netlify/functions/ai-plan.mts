const WORKER_CHAT_URL = "https://bekiuz-ai.bekiuz282.workers.dev/api/chat";
const ALLOWED_ORIGINS = new Set([
  "https://bekiuz.github.io",
  "https://bekiuz-build.netlify.app",
  "https://delightful-stroopwafel-31f3ff.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost"
]);

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

type Room = { name: string; x: number; y: number; width: number; length: number };

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
    const x = Number(room.x);
    const y = Number(room.y);
    const width = Number(room.width);
    const length = Number(room.length);
    const name = typeof room.name === "string" ? room.name.trim().slice(0, 36) : "";
    if (!name || ![x, y, width, length].every(Number.isFinite)) return null;
    if (x < 0 || y < 0 || width < 0.12 || length < 0.12 || x + width > 1.001 || y + length > 1.001) return null;
    return { name, x, y, width, length };
  });
  if (rooms.some((room) => room === null)) return fallbackRooms(count);
  const valid = rooms as Room[];
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const a = valid[i];
      const b = valid[j];
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.length, b.y + b.length) - Math.max(a.y, b.y);
      if (overlapX > 0.025 && overlapY > 0.025) return fallbackRooms(count);
    }
  }
  const covered = valid.reduce((total, room) => total + room.width * room.length, 0);
  return covered < 0.72 || covered > 1.05 ? fallbackRooms(count) : valid;
}

function parseJsonReply(reply: string): Record<string, unknown> {
  let text = reply.trim();
  const fence = String.fromCharCode(96).repeat(3);
  if (text.startsWith(fence)) text = text.split("\n").slice(1).join("\n").split(fence)[0].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI JSON formatida javob bermadi.");
  const data: unknown = JSON.parse(text.slice(start, end + 1));
  if (!data || typeof data !== "object") throw new Error("AI javobi noto‘g‘ri formatda.");
  return data as Record<string, unknown>;
}

export default async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(request, { ok: false, error: "Bu manbadan so‘rov qabul qilinmaydi.", code: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

  if (request.method === "GET") {
    try {
      const probe = await fetch(WORKER_CHAT_URL, { method: "GET", signal: AbortSignal.timeout(8000) });
      const ready = probe.status === 405;
      return jsonResponse(request, {
        ok: ready,
        configured: ready,
        provider: "Bekiuz AI / Cloudflare Workers AI",
        error: ready ? undefined : "Bekiuz AI serveri hozir javob bermayapti."
      }, ready ? 200 : 503);
    } catch {
      return jsonResponse(request, { ok: false, configured: false, error: "Bekiuz AI serveriga ulanib bo‘lmadi." }, 503);
    }
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { ok: false, error: "Faqat POST so‘rovi qabul qilinadi.", code: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: { prompt?: unknown; project?: unknown };
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 10000) return jsonResponse(request, { ok: false, error: "So‘rov hajmi juda katta." }, 413);
    body = await request.json() as { prompt?: unknown; project?: unknown };
  } catch {
    return jsonResponse(request, { ok: false, error: "So‘rov JSON formatida bo‘lishi kerak." }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return jsonResponse(request, { ok: false, error: "Uy haqidagi talablaringizni yozing." }, 400);
  if (prompt.length > 1200) return jsonResponse(request, { ok: false, error: "So‘rov 1200 belgidan oshmasligi kerak." }, 400);

  const project = validateProject(body.project);
  const aiPrompt = [
    "Sen BEKIUZ BUILD uchun o‘zbek tilida uy rejalashtirish yordamchisisan.",
    "Faqat bitta valid JSON obyektini qaytar. Markdown va izoh qo‘shma.",
    "JSON sxemasi: {\"summary\":\"qisqa o‘zbekcha izoh\",\"recommendations\":[\"tavsiya\"],\"rooms\":[{\"name\":\"Xona nomi\",\"x\":0,\"y\":0,\"width\":0.5,\"length\":1}]}",
    "rooms massivida aynan " + project.rooms + " ta xona bo‘lishi kerak.",
    "Xonalar x,y,width,length qiymatlari 0 dan 1 gacha bo‘lgan ulushlar. x,y chap yuqori burchak; width xona enining, length xona bo‘yining butun uyga nisbati.",
    "Har xona to‘rtburchak bo‘lsin, uy chegarasidan chiqmasin. Xonalar bir-birining ustiga tushmasin va umumiy uy maydonining kamida 72 foizini qoplasin.",
    "Foydalanuvchi kiritgan uy o‘lchamlari va qavatlar sonini o‘zgartirma. Xonalarni ehtiyojga qarab mantiqan joylashtir. Xona nomlari qisqa o‘zbekcha bo‘lsin.",
    "Beton, g‘isht va tom materiallari serverdagi alohida arifmetik hisob bilan chiqariladi; narxlarni o‘ylab topma.",
    "30 sm plita foydalanuvchi kiritgan qalinlik hisobidir, barcha uylar uchun xavfsiz degani emas. Fundament, armatura, ustun, to‘sin, grunt va tom konstruksiyasini muhandis tekshirishi kerakligini eslat.",
    "LOYIHA PARAMETRLARI: " + JSON.stringify(project),
    "FOYDALANUVCHI TALABI: " + prompt
  ].join("\n\n");

  try {
    const upstream = await fetch(WORKER_CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({
        mode: "general",
        messages: [{ role: "user", content: aiPrompt }]
      }),
      signal: AbortSignal.timeout(45000)
    });

    let upstreamData: Record<string, unknown> = {};
    try { upstreamData = await upstream.json() as Record<string, unknown>; } catch { /* handled below */ }

    if (!upstream.ok || upstreamData.ok !== true || typeof upstreamData.reply !== "string") {
      const status = upstream.status === 429 ? 429 : 502;
      const message = typeof upstreamData.error === "string"
        ? upstreamData.error
        : "Bekiuz AI hozir javob qaytarmadi. Keyinroq qayta urinib ko‘ring.";
      return jsonResponse(request, {
        ok: false,
        error: message,
        code: typeof upstreamData.code === "string" ? upstreamData.code : "AI_UPSTREAM_ERROR"
      }, status);
    }

    const parsed = parseJsonReply(upstreamData.reply);
    const summary = typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim().slice(0, 600)
      : "Uy uchun boshlang‘ich konsept tayyorlandi.";
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 220)).filter(Boolean).slice(0, 5)
      : [];

    return jsonResponse(request, {
      ok: true,
      plan: {
        summary,
        recommendations,
        rooms: validateRooms(parsed.rooms, project.rooms)
      },
      model: typeof upstreamData.model === "string" ? upstreamData.model : "Bekiuz AI"
    }, 200);
  } catch (error) {
    const message = String((error as Error)?.message || error || "").toLowerCase();
    if (/timeout|timed out|abort/.test(message)) {
      return jsonResponse(request, { ok: false, error: "AI javobi uzoq ketyapti. Birozdan keyin yana urinib ko‘ring.", code: "AI_TIMEOUT" }, 504);
    }
    if (error instanceof SyntaxError || /json formatida|json format/.test(message)) {
      return jsonResponse(request, { ok: false, error: "AI javobini JSON formatiga o‘tkazib bo‘lmadi. Yana urinib ko‘ring.", code: "AI_PARSE_ERROR" }, 502);
    }
    return jsonResponse(request, { ok: false, error: "Bekiuz AI bilan bog‘lanib bo‘lmadi. Server holatini tekshiring.", code: "AI_CONNECTION_ERROR" }, 502);
  }
};

export const config = {
  path: ["/.netlify/functions/ai-plan"],
  method: ["GET", "POST", "OPTIONS"],
  rateLimit: {
    action: "rate_limit",
    aggregateBy: "ip",
    windowSize: 60,
    windowLimit: 8
  }
};
