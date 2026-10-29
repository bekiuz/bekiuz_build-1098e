(() => {
  "use strict";

  const currentHost = window.location.hostname;
  const isLocalDev = (currentHost === "localhost" || currentHost === "127.0.0.1") && window.location.protocol !== "capacitor:";
  const API_BASE = currentHost.endsWith(".netlify.app") || isLocalDev ? "" : "https://delightful-stroopwafel-31f3ff.netlify.app";
  const AI_ENDPOINT = API_BASE + "/.netlify/functions/ai-plan";
  const $ = (selector) => document.querySelector(selector);
  const NS = "http://www.w3.org/2000/svg";
  const number = (id, fallback) => {
    const value = Number($("#" + id).value);
    return Number.isFinite(value) ? value : fallback;
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
  const round = (value, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };
  const fmt = (value, digits = 2) => new Intl.NumberFormat("uz-UZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(value);
  const integer = (value) => new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(value);

  let lastProject = null;
  let lastPlan = null;
  let promptParseTimer = null;
  let house3dModulePromise = null;
  let house3dViewer = null;

  function sync3DControls() {
    const ready = Boolean(house3dViewer);
    $("#house3dCutawayBtn").disabled = !ready;
    $("#house3dRoofBtn").disabled = !ready;
    $("#house3dResetBtn").disabled = !ready;
    if (ready) {
      $("#house3dCutawayBtn").textContent = house3dViewer.cutaway ? "To‘liq uy" : "Ichki ko‘rinish";
      $("#house3dRoofBtn").textContent = house3dViewer.showRoof ? "Tomni yashirish" : "Tomni ko‘rsatish";
    }
  }

  async function updateHouse3D(project, rooms) {
    const stage = $("#house3dCanvas");
    const status = $("#house3dStatus");
    status.textContent = "3D model tayyorlanmoqda…";
    stage.dataset.error = "false";
    if (!house3dViewer) {
      stage.replaceChildren();
      const placeholder = document.createElement("div");
      placeholder.className = "house3d-placeholder";
      const loader = document.createElement("span");
      loader.className = "loader";
      const note = document.createElement("p");
      note.textContent = "AI xona rejasidan 3D uy modeli qurilmoqda…";
      placeholder.append(loader, note);
      stage.append(placeholder);
    }
    sync3DControls();
    try {
      if (!house3dModulePromise) house3dModulePromise = import("./house3d.js");
      const module = await house3dModulePromise;
      house3dViewer = module.renderHouse3D(stage, project, rooms);
      stage.dataset.error = "false";
      status.textContent = "3D model tayyor";
      sync3DControls();
    } catch (error) {
      house3dModulePromise = null;
      house3dViewer = null;
      stage.dataset.error = "true";
      stage.replaceChildren();
      const placeholder = document.createElement("div");
      placeholder.className = "house3d-placeholder";
      const note = document.createElement("p");
      note.textContent = "3D modul yuklanmadi. Internet aloqasini tekshiring. SVG 2D chizma va material hisoblari ishlashda davom etadi.";
      placeholder.append(note);
      stage.append(placeholder);
      status.textContent = "3D yuklanmadi";
      sync3DControls();
      console.error("BEKIUZ BUILD 3D preview failed:", error);
    }
  }

  function setConnection(online, label) {
    const dot = $("#connectionDot");
    dot.classList.toggle("online", online === true);
    dot.classList.toggle("offline", online === false);
    $("#connectionText").textContent = label;
  }

  function setBadge(label, state = "") {
    const badge = $("#aiBadge");
    badge.textContent = label;
    badge.dataset.state = state;
  }

  function showMessage(message, isError = false) {
    const status = $("#errorState");
    status.hidden = !isError;
    status.textContent = message;
    if (isError) {
      $("#emptyState").hidden = true;
      $("#loadingState").hidden = true;
      $("#resultState").hidden = true;
      setBadge("XATOLIK", "error");
    }
  }

  async function checkHealth() {
    try {
      const response = await fetch(AI_ENDPOINT, { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.configured) throw new Error("AI server hali tayyor emas.");
      setConnection(true, "AI server ulangan");
      return true;
    } catch {
      setConnection(false, "AI server tekshirilmoqda");
      return false;
    }
  }

  function firstNumber(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const raw = match.slice(1).find((item) => item !== undefined && item !== "");
        if (raw !== undefined) {
          const parsed = Number(String(raw).replace(",", "."));
          if (Number.isFinite(parsed)) return parsed;
        }
      }
    }
    return null;
  }

  function parsePromptToFields() {
    const text = $("#aiPrompt").value.toLowerCase();
    const width = firstNumber(text, [
      /(\d+(?:[.,]\d+)?)\s*(?:metr(?:lar)?|m)\s*(?:eni|kengligi|kenglik|width)\b/i,
      /\b(?:eni|kengligi|kenglik|width)\s*(?:=|:)?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:metr(?:lar)?|m))?\b/i
    ]);
    const length = firstNumber(text, [
      /(\d+(?:[.,]\d+)?)\s*(?:metr(?:lar)?|m)?\s*(?:bo['’ʻ]?yi|uzunligi|length)\b/i,
      /\b(?:bo['’ʻ]?yi|uzunligi|length)\s*(?:=|:)?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:metr(?:lar)?|m))?\b/i
    ]);
    const thickness = firstNumber(text, [
      /(?:beton(?:i|ning)?|beton\s+plita|plita|qalinligi|qalinlik)[^.\n]{0,48}?(\d+(?:[.,]\d+)?)\s*(?:sm|cm)\b/i,
      /(\d+(?:[.,]\d+)?)\s*(?:sm|cm)[^.\n]{0,24}?(?:beton|plita)/i
    ]);
    const rooms = firstNumber(text, [
      /\b(\d+)\s*(?:ta\s*)?(?:xonali|xona(?:lar)?)\b/i,
      /\b(?:xonalar soni|xona soni)\s*(?:=|:)?\s*(\d+)\b/i
    ]);
    if (width !== null && width >= 3 && width <= 30) $("#houseWidth").value = String(width);
    if (length !== null && length >= 3 && length <= 40) $("#houseLength").value = String(length);
    if (thickness !== null && thickness >= 8 && thickness <= 60) $("#slabThickness").value = String(thickness);
    if (rooms !== null && rooms >= 2 && rooms <= 8) $("#roomCount").value = String(Math.round(rooms));
    if (/\b(shifer|шифер)\b/i.test(text)) $("#roofCover").value = "shifer";
    if (/profnastil|profnastil|профнастил/i.test(text)) $("#roofCover").value = "profnastil";
    if (/yassi tom|tekis tom|flat roof/i.test(text)) $("#roofType").value = "flat";
    else if (/to['’ʻ]?rt nishabli|to['’ʻ]?rt tomonli|hip roof/i.test(text)) $("#roofType").value = "hip";
    else if (/ikki nishabli|ikki tomonli|gable roof/i.test(text)) $("#roofType").value = "gable";
  }

  function readProject() {
    return {
      houseWidth: round(clamp(number("houseWidth", 7), 3, 30), 2),
      houseLength: round(clamp(number("houseLength", 5), 3, 40), 2),
      slabThicknessCm: round(clamp(number("slabThickness", 30), 8, 60), 1),
      wallHeight: round(clamp(number("wallHeight", 2.8), 2, 5), 2),
      wallThicknessCm: round(clamp(number("wallThickness", 25), 10, 60), 1),
      floors: 1,
      rooms: Math.round(clamp(number("roomCount", 3), 2, 8)),
      doorCount: Math.round(clamp(number("doorCount", 1), 1, 8)),
      windowCount: Math.round(clamp(number("windowCount", 4), 0, 20)),
      roofType: ["gable", "hip", "flat"].includes($("#roofType").value) ? $("#roofType").value : "gable",
      roofCover: $("#roofCover").value === "profnastil" ? "profnastil" : "shifer"
    };
  }

  function getFallbackRooms(count) {
    const names = ["Mehmonxona", "Oshxona", "Yotoqxona", "Yotoqxona 2", "Sanuzel", "Dahliz", "Ish xonasi", "Ombor"];
    const n = Math.round(clamp(count, 2, 8));
    if (n === 2) return [
      { name: names[0], x: 0, y: 0, width: .5, length: 1 },
      { name: names[2], x: .5, y: 0, width: .5, length: 1 }
    ];
    if (n === 3) return [
      { name: names[0], x: 0, y: 0, width: .5, length: .52 },
      { name: names[1], x: .5, y: 0, width: .5, length: .52 },
      { name: names[2], x: 0, y: .52, width: 1, length: .48 }
    ];
    if (n === 4) return [
      { name: names[0], x: 0, y: 0, width: .5, length: .5 },
      { name: names[1], x: .5, y: 0, width: .5, length: .5 },
      { name: names[2], x: 0, y: .5, width: .5, length: .5 },
      { name: names[3], x: .5, y: .5, width: .5, length: .5 }
    ];
    if (n === 5) return [
      { name: names[0], x: 0, y: 0, width: 1 / 3, length: .5 },
      { name: names[1], x: 1 / 3, y: 0, width: 1 / 3, length: .5 },
      { name: names[2], x: 2 / 3, y: 0, width: 1 / 3, length: .5 },
      { name: names[3], x: 0, y: .5, width: .5, length: .5 },
      { name: names[4], x: .5, y: .5, width: .5, length: .5 }
    ];
    const columns = n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / columns);
    return Array.from({ length: n }, (_, index) => ({
      name: names[index] || ("Xona " + (index + 1)),
      x: (index % columns) / columns,
      y: Math.floor(index / columns) / rows,
      width: 1 / columns,
      length: 1 / rows
    }));
  }

  function validRooms(input, count) {
    if (!Array.isArray(input) || input.length !== count) return getFallbackRooms(count);
    const rooms = input.map((room) => {
      if (!room || typeof room !== "object") return null;
      const x = Number(room.x), y = Number(room.y), width = Number(room.width), length = Number(room.length);
      const name = typeof room.name === "string" ? room.name.trim().slice(0, 36) : "";
      if (!name || ![x, y, width, length].every(Number.isFinite)) return null;
      if (x < 0 || y < 0 || width < .12 || length < .12 || x + width > 1.001 || y + length > 1.001) return null;
      return { name, x, y, width, length };
    });
    if (rooms.some((room) => !room)) return getFallbackRooms(count);
    for (let i = 0; i < rooms.length; i += 1) {
      for (let j = i + 1; j < rooms.length; j += 1) {
        const a = rooms[i], b = rooms[j];
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.length, b.y + b.length) - Math.max(a.y, b.y);
        if (overlapX > .025 && overlapY > .025) return getFallbackRooms(count);
      }
    }
    const covered = rooms.reduce((sum, room) => sum + room.width * room.length, 0);
    if (covered < .72 || covered > 1.05) return getFallbackRooms(count);
    return rooms;
  }

  function calculateMaterials(project) {
    const width = project.houseWidth;
    const length = project.houseLength;
    const footprint = width * length;
    const concreteThickness = project.slabThicknessCm / 100;
    const concreteVolume = footprint * concreteThickness;
    const concreteTonnes = concreteVolume * 2.4;
    const concreteOrderVolume = concreteVolume * 1.05;

    const perimeter = 2 * (width + length);
    const grossWallArea = perimeter * project.wallHeight;
    const doorArea = project.doorCount * .9 * 2.1;
    const windowArea = project.windowCount * 1.2 * 1.2;
    const openingArea = Math.min(grossWallArea * .8, doorArea + windowArea);
    const netWallArea = Math.max(0, grossWallArea - openingArea);
    const wallVolume = netWallArea * (project.wallThicknessCm / 100);
    const brickWithoutReserve = wallVolume * 394;
    const brickCount = Math.ceil(brickWithoutReserve * 1.05);

    const overhang = .3;
    const roofFootprint = (width + overhang * 2) * (length + overhang * 2);
    const pitch = project.roofType === "flat" ? 3 : project.roofType === "hip" ? 30 : 25;
    const roofSurface = roofFootprint / Math.cos(pitch * Math.PI / 180);
    const roofOrderArea = roofSurface * 1.1;
    const sheetCoverage = project.roofCover === "profnastil" ? 1.8 : 1.6;
    const sheetCount = Math.ceil(roofOrderArea / sheetCoverage);
    return {
      footprint,
      perimeter,
      grossWallArea,
      openingArea,
      netWallArea,
      wallVolume,
      concreteVolume,
      concreteTonnes,
      concreteOrderVolume,
      brickCount,
      brickWithoutReserve,
      roofSurface,
      roofOrderArea,
      sheetCount,
      sheetCoverage,
      concreteDensity: 2.4,
      brickPerCubicMetre: 394,
      roofPitchDegrees: pitch
    };
  }

  function svgNode(tag, attributes = {}, text = "") {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== "") node.textContent = text;
    return node;
  }

  function drawPlan(project, rooms, quantities) {
    const svg = $("#planSvg");
    svg.replaceChildren();
    svg.setAttribute("viewBox", "0 0 720 520");
    const background = svgNode("rect", { x: 0, y: 0, width: 720, height: 520, fill: "#0f1a28" });
    svg.append(background);
    const defs = svgNode("defs");
    const marker = svgNode("marker", { id: "dimensionArrow", markerWidth: 7, markerHeight: 7, refX: 3.5, refY: 3.5, orient: "auto-start-reverse", markerUnits: "strokeWidth" });
    marker.append(svgNode("path", { d: "M 0 0 L 7 3.5 L 0 7 z", fill: "#8ba1b9" }));
    defs.append(marker);
    const pattern = svgNode("pattern", { id: "planGrid", width: 16, height: 16, patternUnits: "userSpaceOnUse" });
    pattern.append(svgNode("path", { d: "M 16 0 L 0 0 0 16", fill: "none", stroke: "#26384c", "stroke-width": .8 }));
    defs.append(pattern);
    svg.append(defs, svgNode("rect", { x: 0, y: 0, width: 720, height: 520, fill: "url(#planGrid)" }));
    svg.append(svgNode("text", { x: 26, y: 32, fill: "#9baec3", "font-size": 11, "font-family": "DM Sans, sans-serif", "font-weight": 700, "letter-spacing": 2 }, "BEKIUZ BUILD  /  KONSEPTUAL QAVAT REJASI"));

    const maxWidth = 504, maxLength = 348;
    const scale = Math.min(maxWidth / project.houseWidth, maxLength / project.houseLength);
    const planWidth = project.houseWidth * scale;
    const planHeight = project.houseLength * scale;
    const x0 = 94 + (maxWidth - planWidth) / 2;
    const y0 = 90 + (maxLength - planHeight) / 2;
    const px = (n) => n * scale;
    const palette = ["#182c40", "#19283a", "#203247", "#1a3042", "#243245", "#1a2d3d", "#203145", "#1c2b3b"];

    svg.append(svgNode("rect", { x: x0, y: y0, width: planWidth, height: planHeight, fill: "#0c1520", stroke: "#edf3fa", "stroke-width": 9, "stroke-linejoin": "miter" }));
    rooms.forEach((room, index) => {
      const x = x0 + room.x * planWidth;
      const y = y0 + room.y * planHeight;
      const w = room.width * planWidth;
      const h = room.length * planHeight;
      svg.append(svgNode("rect", {
        x: x + 2, y: y + 2, width: Math.max(1, w - 4), height: Math.max(1, h - 4),
        fill: palette[index % palette.length], stroke: "#c5d3e2", "stroke-width": 3
      }));
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      const shortLabel = room.name.length > 17 ? room.name.slice(0, 16) + "…" : room.name;
      const area = project.houseWidth * room.width * project.houseLength * room.length;
      const labelSize = Math.max(8, Math.min(12, w / Math.max(7, shortLabel.length * 0.65)));
      svg.append(svgNode("text", {
        x: centerX, y: centerY - 3, "text-anchor": "middle", fill: "#eef4fb",
        "font-family": "DM Sans, sans-serif", "font-size": labelSize, "font-weight": 700
      }, shortLabel));
      if (w > 62 && h > 45) {
        svg.append(svgNode("text", {
          x: centerX, y: centerY + 14, "text-anchor": "middle", fill: "#a4bdd2",
          "font-family": "DM Sans, sans-serif", "font-size": 9
        }, fmt(area, 1) + " m²"));
      }
    });

    // Schematic windows and the entry gap are visual hints, not construction details.
    const midX = x0 + planWidth * .5;
    const midY = y0 + planHeight * .5;
    const windowLength = Math.min(40, planWidth * .15);
    svg.append(
      svgNode("line", { x1: x0 + planWidth * .22, y1: y0 - 5, x2: x0 + planWidth * .22 + windowLength, y2: y0 - 5, stroke: "#7bd7ef", "stroke-width": 5 }),
      svgNode("line", { x1: x0 + planWidth * .22, y1: y0 + 2, x2: x0 + planWidth * .22 + windowLength, y2: y0 + 2, stroke: "#7bd7ef", "stroke-width": 2 }),
      svgNode("line", { x1: x0 + planWidth * .68, y1: y0 - 5, x2: x0 + planWidth * .68 + windowLength, y2: y0 - 5, stroke: "#7bd7ef", "stroke-width": 5 }),
      svgNode("line", { x1: x0 + planWidth * .68, y1: y0 + 2, x2: x0 + planWidth * .68 + windowLength, y2: y0 + 2, stroke: "#7bd7ef", "stroke-width": 2 })
    );
    const entryW = Math.min(px(.9), planWidth * .24);
    const entryX = x0 + planWidth * .5 - entryW / 2;
    const entryY = y0 + planHeight;
    svg.append(
      svgNode("rect", { x: entryX - 3, y: entryY - 4, width: entryW + 6, height: 9, fill: "#0f1a28" }),
      svgNode("line", { x1: entryX, y1: entryY, x2: entryX + entryW, y2: entryY, stroke: "#ffbf70", "stroke-width": 3 }),
      svgNode("path", { d: "M " + entryX + " " + entryY + " A " + entryW + " " + entryW + " 0 0 1 " + (entryX + entryW) + " " + entryY, fill: "none", stroke: "#ffbf70", "stroke-width": 1.5, "stroke-dasharray": "4 3" })
    );

    const topDimY = y0 - 24;
    svg.append(
      svgNode("line", { x1: x0, y1: topDimY, x2: x0 + planWidth, y2: topDimY, stroke: "#8ba1b9", "stroke-width": 1.2, "marker-start": "url(#dimensionArrow)", "marker-end": "url(#dimensionArrow)" }),
      svgNode("text", { x: x0 + planWidth / 2, y: topDimY - 8, "text-anchor": "middle", fill: "#f0f5fa", "font-family": "Space Grotesk, sans-serif", "font-size": 13, "font-weight": 700 }, fmt(project.houseWidth, 2) + " m  ENI"),
      svgNode("line", { x1: x0 - 27, y1: y0, x2: x0 - 27, y2: y0 + planHeight, stroke: "#8ba1b9", "stroke-width": 1.2, "marker-start": "url(#dimensionArrow)", "marker-end": "url(#dimensionArrow)" }),
      svgNode("text", { x: x0 - 39, y: y0 + planHeight / 2, transform: "rotate(-90 " + (x0 - 39) + " " + (y0 + planHeight / 2) + ")", "text-anchor": "middle", fill: "#f0f5fa", "font-family": "Space Grotesk, sans-serif", "font-size": 13, "font-weight": 700 }, fmt(project.houseLength, 2) + " m  BO‘YI")
    );
    svg.append(
      svgNode("text", { x: 26, y: 474, fill: "#ffbf70", "font-family": "Space Grotesk, sans-serif", "font-size": 12, "font-weight": 700 }, fmt(quantities.footprint, 2) + " m² · " + project.rooms + " xona"),
      svgNode("text", { x: 26, y: 495, fill: "#8ca1b7", "font-family": "DM Sans, sans-serif", "font-size": 9 }, "Eshik/deraza belgilari sxematik. Qurilish uchun ishchi chizma emas.")
    );
  }

  function roofName(project) {
    if (project.roofType === "flat") return "Yassi tom";
    if (project.roofType === "hip") return "To‘rt nishabli tom";
    return "Ikki nishabli tom";
  }

  function coverName(project) {
    return project.roofCover === "profnastil" ? "Profnastil" : "Shifer";
  }

  function renderRows(project, quantities) {
    const body = $("#materialsBody");
    body.replaceChildren();
    const rows = [
      ["Beton plita", "5% zaxira bilan", fmt(quantities.concreteOrderVolume, 2) + " m³"],
      ["Beton og‘irligi", "2.4 t/m³ deb olindi", fmt(quantities.concreteTonnes, 2) + " t"],
      ["G‘isht", "Netto devor + 5% zaxira", integer(quantities.brickCount) + " dona"],
      [coverName(project), "10% kesish zaxirasi bilan", integer(quantities.sheetCount) + " list"],
      ["Tom yuzasi", "Nishab va 30 sm karniz taxmini", fmt(quantities.roofOrderArea, 2) + " m²"],
      ["Devor hajmi", "Eshik/deraza maydoni chegirildi", fmt(quantities.wallVolume, 2) + " m³"]
    ];
    rows.forEach(([material, basis, amount]) => {
      const tr = document.createElement("tr");
      [material, basis, amount].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });
      body.append(tr);
    });
  }

  function renderResult(plan, project) {
    const quantities = calculateMaterials(project);
    const rooms = validRooms(plan.rooms, project.rooms);
    lastProject = project;
    lastPlan = { ...plan, rooms };
    $("#planSummary").textContent = plan.summary || "AI uy uchun boshlang‘ich konsept tayyorladi.";
    $("#areaValue").textContent = fmt(quantities.footprint, 2) + " m²";
    $("#concreteValue").textContent = fmt(quantities.concreteVolume, 2) + " m³";
    $("#concreteMass").textContent = "taxminan " + fmt(quantities.concreteTonnes, 2) + " tonna";
    $("#brickValue").textContent = integer(quantities.brickCount);
    $("#roofValue").textContent = integer(quantities.sheetCount) + " list";
    $("#roofAreaValue").textContent = coverName(project) + " · " + fmt(quantities.roofOrderArea, 2) + " m²";
    $("#planDimensions").textContent = fmt(project.houseWidth, 2) + " × " + fmt(project.houseLength, 2) + " m · " + project.rooms + " xona";
    drawPlan(project, rooms, quantities);
    renderRows(project, quantities);

    const recList = $("#recommendations");
    recList.replaceChildren();
    const recs = Array.isArray(plan.recommendations) ? plan.recommendations.slice(0, 5) : [];
    if (!recs.length) recs.push("Xona joylashuvini oilaning ehtiyojiga qarab arxitektor bilan tekshiring.");
    recs.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      recList.append(li);
    });
    const openings = project.doorCount + " ta eshik × 0.9 × 2.1 m; " +
      project.windowCount + " ta deraza × 1.2 × 1.2 m";
    const concreteText = "Beton: plita maydoni " + fmt(quantities.footprint, 2) +
      " m² × " + fmt(project.slabThicknessCm / 100, 2) + " m = " +
      fmt(quantities.concreteVolume, 2) + " m³. Og‘irlik 2.4 t/m³ zichlik farazi asosida; buyurtma hajmiga 5% zaxira qo‘shilgan.";
    const brickText = "G‘isht: devor balandligi " + fmt(project.wallHeight, 2) +
      " m, devor qalinligi " + fmt(project.wallThicknessCm, 0) + " sm; " +
      openings + ". 250×120×65 mm oddiy g‘isht va qorishma choklari uchun taxminan 394 dona/m³, ustiga 5% zaxira olindi.";
    const roofText = "Tom: " + roofName(project).toLowerCase() + ", " + coverName(project) +
      ". Hisobda " + fmt(quantities.roofPitchDegrees, 0) + "° qiyalik, har tomonda 30 sm karniz, 10% kesish zaxirasi va bir list uchun " +
      fmt(quantities.sheetCoverage, 1) + " m² foydali qoplash maydoni qabul qilindi.";
    $("#assumptionsText").textContent = concreteText + " " + brickText + " " + roofText;

    $("#errorState").hidden = true;
    $("#emptyState").hidden = true;
    $("#loadingState").hidden = true;
    $("#resultState").hidden = false;
    void updateHouse3D(project, rooms);
    setBadge("TAYYOR", "success");
    setConnection(true, "AI server javob berdi");
    $("#natija").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function generatePlan(event) {
    event.preventDefault();
    $("#errorState").hidden = true;
    $("#emptyState").hidden = true;
    $("#resultState").hidden = true;
    $("#loadingState").hidden = false;
    setBadge("REJALASHTIRMOQDA");
    const button = $("#generateBtn");
    const label = $("#generateLabel");
    button.disabled = true;
    label.textContent = "AI ishlayapti…";
    try {
      const prompt = $("#aiPrompt").value.trim();
      const project = readProject();
      if (!prompt) throw new Error("Avval uy haqidagi talablaringizni yozing.");
      const response = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ prompt, project })
      });
      const type = response.headers.get("content-type") || "";
      let data;
      if (type.includes("application/json")) {
        data = await response.json();
      } else {
        const raw = await response.text();
        try {
          data = JSON.parse(raw);
        } catch {
          const message = raw.replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim();
          throw new Error(message.slice(0, 240) || ("AI server JSON javob bermadi (HTTP " + response.status + ")."));
        }
      }
      if (!response.ok || !data.ok) {
        const error = new Error(data.error || "AI javob qaytarmadi.");
        error.code = data.code;
        throw error;
      }
      if (!data.plan || !Array.isArray(data.plan.rooms)) {
        throw new Error("AI xona rejasini kutilgan formatda bermadi. Yana urinib ko‘ring.");
      }
      renderResult(data.plan, project);
    } catch (error) {
      $("#loadingState").hidden = true;
      $("#errorState").hidden = false;
      $("#errorState").textContent = error.message || "AI bilan bog‘lanib bo‘lmadi. Keyinroq urinib ko‘ring.";
      $("#emptyState").hidden = true;
      $("#resultState").hidden = true;
      setBadge("XATOLIK", "error");
      setConnection(false, "AI so‘rovi bajarilmadi");
    } finally {
      button.disabled = false;
      label.textContent = "AI chizma, 3D va hisob chiqarish";
    }
  }

  function downloadSvg() {
    if (!lastPlan || !lastProject) return;
    const svg = $("#planSvg").cloneNode(true);
    svg.setAttribute("xmlns", NS);
    svg.setAttribute("width", "1440");
    svg.setAttribute("height", "1040");
    const content = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bekiuz-build-qavat-rejasi.svg";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function useExample() {
    $("#aiPrompt").value = "7 metr eni, 5 metr bo‘yi uy qurmoqchiman. Beton plita qalinligi 30 sm. 3 xona va shifer tom kerak.";
    parsePromptToFields();
    $("#aiPrompt").focus();
    $("#loyiha").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#aiForm").addEventListener("submit", generatePlan);
  $("#useExample").addEventListener("click", useExample);
  $("#editInputsBtn").addEventListener("click", () => $("#loyiha").scrollIntoView({ behavior: "smooth", block: "start" }));
  $("#downloadSvgBtn").addEventListener("click", downloadSvg);
  $("#house3dCutawayBtn").addEventListener("click", () => {
    if (!house3dViewer) return;
    house3dViewer.toggleCutaway();
    sync3DControls();
  });
  $("#house3dRoofBtn").addEventListener("click", () => {
    if (!house3dViewer) return;
    house3dViewer.toggleRoof();
    sync3DControls();
  });
  $("#house3dResetBtn").addEventListener("click", () => {
    if (house3dViewer) house3dViewer.resetView();
  });
  $("#printBtn").addEventListener("click", () => window.print());
  $("#aiPrompt").addEventListener("input", () => {
    window.clearTimeout(promptParseTimer);
    promptParseTimer = window.setTimeout(parsePromptToFields, 240);
  });
  $("#aiPrompt").addEventListener("blur", parsePromptToFields);
  checkHealth();
})();