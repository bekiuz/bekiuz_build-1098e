import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || min));
let sharedViewer = null;

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, ...options });
}

function addBox(parent, material, sx, sy, sz, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.015, sx), Math.max(0.015, sy), Math.max(0.015, sz)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  group.clear();
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter((entry) => Array.isArray(entry) && Number.isFinite(entry[0]) && Number.isFinite(entry[1]) && entry[1] - entry[0] > 0.08)
    .map(([start, end]) => [Math.min(start, end), Math.max(start, end)])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current[0] <= last[1] + 0.025) last[1] = Math.max(last[1], current[1]);
    else merged.push(current.slice());
  }
  return merged;
}

function spreadCenters(length, count, width) {
  const safeCount = Math.max(0, Math.min(count, Math.floor((length - 0.5) / Math.max(0.5, width + 0.25))));
  const actualWidth = Math.min(width, length / (safeCount + 1) * 0.6);
  return Array.from({ length: safeCount }, (_, i) => ({
    center: -length / 2 + (i + 1) * length / (safeCount + 1),
    width: actualWidth
  }));
}

function createViewer(container) {
  container.replaceChildren();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d1724");
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 500);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-label", "AI rejasidan yaratilgan uyning interaktiv 3D modeli");
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xddeeff, 0x253140, 2.0));
  const keyLight = new THREE.DirectionalLight(0xffe1bb, 3.1);
  keyLight.position.set(10, 18, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -24;
  keyLight.shadow.camera.right = 24;
  keyLight.shadow.camera.top = 24;
  keyLight.shadow.camera.bottom = -24;
  keyLight.shadow.bias = -0.00025;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x79b9ed, 1.1);
  fillLight.position.set(-10, 8, -8);
  scene.add(fillLight);

  const environment = new THREE.Group();
  scene.add(environment);
  const houseRoot = new THREE.Group();
  scene.add(houseRoot);
  const roofRoot = new THREE.Group();
  const frontRoot = new THREE.Group();
  const interiorRoot = new THREE.Group();
  const otherWallsRoot = new THREE.Group();
  houseRoot.add(otherWallsRoot, interiorRoot, frontRoot, roofRoot);

  const viewer = {
    container, scene, camera, renderer, environment, houseRoot, roofRoot, frontRoot, interiorRoot, otherWallsRoot,
    model: null, width: 7, length: 5, height: 2.8, radius: 17, theta: 0.72, phi: 0.92,
    target: new THREE.Vector3(0, 1.5, 0), cutaway: false, showRoof: true, pointer: null
  };

  function updateCamera() {
    const phi = clamp(viewer.phi, 0.18, 1.45);
    const radius = clamp(viewer.radius, Math.max(viewer.width, viewer.length) * 0.9, Math.max(viewer.width, viewer.length) * 4.5);
    viewer.camera.position.set(
      viewer.target.x + radius * Math.sin(phi) * Math.sin(viewer.theta),
      viewer.target.y + radius * Math.cos(phi),
      viewer.target.z + radius * Math.sin(phi) * Math.cos(viewer.theta)
    );
    viewer.camera.lookAt(viewer.target);
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateCamera();
    renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener("resize", resize);

  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    viewer.pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
    renderer.domElement.setPointerCapture?.(event.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!viewer.pointer || viewer.pointer.id !== event.pointerId) return;
    const dx = event.clientX - viewer.pointer.x;
    const dy = event.clientY - viewer.pointer.y;
    viewer.pointer.x = event.clientX;
    viewer.pointer.y = event.clientY;
    viewer.theta -= dx * 0.008;
    viewer.phi = clamp(viewer.phi + dy * 0.006, 0.18, 1.45);
    updateCamera();
  });
  const endDrag = () => { viewer.pointer = null; };
  renderer.domElement.addEventListener("pointerup", endDrag);
  renderer.domElement.addEventListener("pointercancel", endDrag);
  renderer.domElement.addEventListener("pointerleave", (event) => {
    if (event.buttons === 0) endDrag();
  });
  renderer.domElement.addEventListener("wheel", (event) => {
    event.preventDefault();
    viewer.radius = clamp(viewer.radius + event.deltaY * 0.018, Math.max(viewer.width, viewer.length) * 0.9, Math.max(viewer.width, viewer.length) * 4.5);
    updateCamera();
  }, { passive: false });

  viewer.setCutaway = (value) => {
    viewer.cutaway = Boolean(value);
    viewer.frontRoot.visible = !viewer.cutaway;
    viewer.roofRoot.visible = viewer.showRoof && !viewer.cutaway;
    return viewer.cutaway;
  };
  viewer.toggleCutaway = () => viewer.setCutaway(!viewer.cutaway);
  viewer.setRoof = (value) => {
    viewer.showRoof = Boolean(value);
    viewer.roofRoot.visible = viewer.showRoof && !viewer.cutaway;
    return viewer.showRoof;
  };
  viewer.toggleRoof = () => viewer.setRoof(!viewer.showRoof);
  viewer.resetView = () => {
    viewer.theta = 0.72;
    viewer.phi = 0.92;
    viewer.radius = Math.max(viewer.width, viewer.length) * 2.2;
    updateCamera();
  };
  viewer.destroy = () => {
    resizeObserver.disconnect();
    window.removeEventListener("resize", resize);
    renderer.setAnimationLoop(null);
    renderer.dispose();
    disposeGroup(environment);
    disposeGroup(houseRoot);
    container.replaceChildren();
  };

  renderer.setAnimationLoop(() => renderer.render(scene, camera));
  resize();
  return viewer;
}

function addWallSegment(parent, axis, fixed, start, end, bottom, top, thickness, material, floorY) {
  const segmentLength = end - start;
  const segmentHeight = top - bottom;
  if (segmentLength <= 0.025 || segmentHeight <= 0.025) return;
  const y = floorY + bottom + segmentHeight / 2;
  if (axis === "x") addBox(parent, material, segmentLength, segmentHeight, thickness, (start + end) / 2, y, fixed);
  else addBox(parent, material, thickness, segmentHeight, segmentLength, fixed, y, (start + end) / 2);
}

function addOpeningDetails(parent, axis, fixed, opening, thickness, floorY, frameMaterial, glassMaterial) {
  const { center, width, bottom, height } = opening;
  const midY = floorY + bottom + height / 2;
  const depth = thickness + 0.045;
  if (opening.type === "window") {
    const inset = Math.min(0.09, width * 0.12);
    const glassW = Math.max(0.15, width - inset * 2);
    const glassH = Math.max(0.15, height - 0.1);
    if (axis === "x") {
      addBox(parent, glassMaterial, glassW, glassH, 0.025, center, midY, fixed);
      addBox(parent, frameMaterial, width, 0.055, depth, center, floorY + bottom + 0.025, fixed);
      addBox(parent, frameMaterial, width, 0.055, depth, center, floorY + bottom + height - 0.025, fixed);
      addBox(parent, frameMaterial, 0.055, height, depth, center - width / 2 + 0.025, midY, fixed);
      addBox(parent, frameMaterial, 0.055, height, depth, center + width / 2 - 0.025, midY, fixed);
      addBox(parent, frameMaterial, 0.035, glassH, depth + 0.005, center, midY, fixed);
    } else {
      addBox(parent, glassMaterial, 0.025, glassH, glassW, fixed, midY, center);
      addBox(parent, frameMaterial, depth, 0.055, width, fixed, floorY + bottom + 0.025, center);
      addBox(parent, frameMaterial, depth, 0.055, width, fixed, floorY + bottom + height - 0.025, center);
      addBox(parent, frameMaterial, depth, height, 0.055, fixed, midY, center - width / 2 + 0.025);
      addBox(parent, frameMaterial, depth, height, 0.055, fixed, midY, center + width / 2 - 0.025);
      addBox(parent, frameMaterial, depth + 0.005, glassH, 0.035, fixed, midY, center);
    }
  } else {
    const doorMaterial = makeMaterial(0x6d4b35, { roughness: 0.72 });
    if (axis === "x") {
      addBox(parent, frameMaterial, 0.075, height, depth, center - width / 2 + 0.035, midY, fixed);
      addBox(parent, frameMaterial, 0.075, height, depth, center + width / 2 - 0.035, midY, fixed);
      addBox(parent, frameMaterial, width, 0.075, depth, center, floorY + bottom + height - 0.035, fixed);
      addBox(parent, doorMaterial, width - 0.12, height - 0.12, 0.04, center, midY, fixed + Math.sign(fixed || 1) * 0.015);
      addBox(parent, frameMaterial, 0.035, 0.035, 0.06, center + width * 0.28, midY, fixed + Math.sign(fixed || 1) * 0.05);
    } else {
      addBox(parent, frameMaterial, depth, height, 0.075, fixed, midY, center - width / 2 + 0.035);
      addBox(parent, frameMaterial, depth, height, 0.075, fixed, midY, center + width / 2 - 0.035);
      addBox(parent, frameMaterial, depth, 0.075, width, fixed, floorY + bottom + height - 0.035, center);
      addBox(parent, doorMaterial, 0.04, height - 0.12, width - 0.12, fixed + Math.sign(fixed || 1) * 0.015, midY, center);
      addBox(parent, frameMaterial, 0.06, 0.035, 0.035, fixed + Math.sign(fixed || 1) * 0.05, midY, center + width * 0.28);
    }
  }
}

function addWallWithOpenings(parent, axis, fixed, length, thickness, wallHeight, floorY, material, openings, frameMaterial, glassMaterial) {
  const start = -length / 2;
  const end = length / 2;
  const normalized = openings
    .map((opening) => ({
      ...opening,
      width: clamp(opening.width, 0.35, Math.min(1.35, length * 0.38)),
      bottom: clamp(opening.bottom, 0, wallHeight - 0.3),
      height: clamp(opening.height, 0.6, wallHeight - 0.12)
    }))
    .map((opening) => ({ ...opening, center: clamp(opening.center, start + opening.width / 2, end - opening.width / 2) }))
    .sort((a, b) => a.center - b.center);
  const accepted = [];
  for (const opening of normalized) {
    const prior = accepted[accepted.length - 1];
    if (prior && opening.center - opening.width / 2 < prior.center + prior.width / 2 + 0.12) continue;
    accepted.push(opening);
  }

  let cursor = start;
  for (const opening of accepted) {
    const left = opening.center - opening.width / 2;
    const right = opening.center + opening.width / 2;
    addWallSegment(parent, axis, fixed, cursor, left, 0, wallHeight, thickness, material, floorY);
    addWallSegment(parent, axis, fixed, left, right, 0, opening.bottom, thickness, material, floorY);
    addWallSegment(parent, axis, fixed, left, right, opening.bottom + opening.height, wallHeight, thickness, material, floorY);
    addOpeningDetails(parent, axis, fixed, opening, thickness, floorY, frameMaterial, glassMaterial);
    cursor = right;
  }
  addWallSegment(parent, axis, fixed, cursor, end, 0, wallHeight, thickness, material, floorY);
}

function createRoofSurface(parent, points, material) {
  const positions = new Float32Array(points.flatMap((point) => point));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.material.side = THREE.DoubleSide;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildHouse(viewer, project, rooms) {
  disposeGroup(viewer.environment);
  disposeGroup(viewer.houseRoot);
  viewer.frontRoot = new THREE.Group();
  viewer.interiorRoot = new THREE.Group();
  viewer.otherWallsRoot = new THREE.Group();
  viewer.roofRoot = new THREE.Group();
  viewer.houseRoot.add(viewer.otherWallsRoot, viewer.interiorRoot, viewer.frontRoot, viewer.roofRoot);

  const width = clamp(project.houseWidth, 3, 30);
  const length = clamp(project.houseLength, 3, 40);
  const wallHeight = clamp(project.wallHeight, 2, 5);
  const wallThickness = clamp((Number(project.wallThicknessCm) || 25) / 100, 0.12, 0.38);
  const slabHeight = clamp((Number(project.slabThicknessCm) || 30) / 100, 0.12, 0.5);
  const floorY = slabHeight;
  const doorHeight = Math.min(2.08, wallHeight - 0.12);
  viewer.width = width;
  viewer.length = length;
  viewer.height = wallHeight;
  viewer.cutaway = false;
  viewer.showRoof = true;
  viewer.target.set(0, slabHeight + wallHeight * 0.55, 0);
  viewer.radius = Math.max(width, length) * 2.2;

  const concrete = makeMaterial(0x8c969f, { roughness: 0.94 });
  const floorMat = makeMaterial(0xc5b49a, { roughness: 0.95 });
  const wallMat = makeMaterial(0xe4ded0, { roughness: 0.88 });
  const partitionMat = makeMaterial(0xc8c8c0, { roughness: 0.9 });
  const frameMat = makeMaterial(0xf3f4ed, { roughness: 0.5, metalness: 0.04 });
  const glassMat = makeMaterial(0x79b8cf, { roughness: 0.2, metalness: 0.08, transparent: true, opacity: 0.65 });
  const roofMat = makeMaterial(project.roofCover === "profnastil" ? 0x344c5e : 0x566b79, { roughness: 0.68, metalness: project.roofCover === "profnastil" ? 0.42 : 0.06 });
  const trimMat = makeMaterial(0x2f424e, { roughness: 0.72 });
  const roomColors = [0xb7a18b, 0xc5ad8d, 0xb7c4c5, 0xc8bfb0, 0xc0b6a4, 0xaaa998, 0xc2b5a1, 0xb9c2b5];

  const groundSize = Math.max(width, length) * 2.5 + 8;
  addBox(viewer.environment, makeMaterial(0x142331, { roughness: 1 }), groundSize, 0.08, groundSize, 0, -0.12, 0, { castShadow: false });
  const gridSize = Math.max(width, length) * 1.7 + 4;
  const grid = new THREE.GridHelper(gridSize, Math.max(10, Math.round(gridSize * 2)), 0x405468, 0x263849);
  grid.position.y = -0.073;
  viewer.environment.add(grid);

  // Concrete base slab and slightly inset room flooring.
  addBox(viewer.houseRoot, concrete, width, slabHeight, length, 0, slabHeight / 2, 0);
  (Array.isArray(rooms) ? rooms : []).forEach((room, index) => {
    const rw = clamp(room.width, 0.12, 1) * width;
    const rl = clamp(room.length, 0.12, 1) * length;
    const rx = -width / 2 + (Number(room.x) + Number(room.width) / 2) * width;
    const rz = -length / 2 + (Number(room.y) + Number(room.length) / 2) * length;
    addBox(viewer.interiorRoot, makeMaterial(roomColors[index % roomColors.length], { roughness: 0.94 }), rw - 0.035, 0.025, rl - 0.035, rx, floorY + 0.018, rz, { castShadow: false });
  });

  const frontDoor = { center: -width * 0.04, width: Math.min(0.92, width * 0.23), bottom: 0, height: doorHeight, type: "door" };
  const frontWindowCount = Number(project.windowCount) >= 2 && width >= 5.5 ? 2 : (Number(project.windowCount) >= 1 && width >= 7 ? 1 : 0);
  const frontWindows = frontWindowCount === 2
    ? [{ center: -width * 0.33, width: Math.min(1.12, width * 0.17), bottom: 0.82, height: Math.min(1.05, wallHeight - 1.05), type: "window" },
       { center: width * 0.33, width: Math.min(1.12, width * 0.17), bottom: 0.82, height: Math.min(1.05, wallHeight - 1.05), type: "window" }]
    : frontWindowCount === 1
      ? [{ center: width * 0.3, width: Math.min(1.05, width * 0.17), bottom: 0.82, height: Math.min(1.05, wallHeight - 1.05), type: "window" }]
      : [];
  addWallWithOpenings(viewer.frontRoot, "x", length / 2, width, wallThickness, wallHeight, floorY, wallMat, [frontDoor, ...frontWindows], frameMat, glassMat);

  let windowsLeft = Math.max(0, Math.round(Number(project.windowCount) || 0) - frontWindows.length);
  const backCap = Math.max(0, Math.floor(width / 1.65));
  const backWindows = spreadCenters(width, Math.min(windowsLeft, backCap), 1.1)
    .map((opening) => ({ ...opening, bottom: 0.82, height: Math.min(1.05, wallHeight - 1.05), type: "window" }));
  windowsLeft -= backWindows.length;
  addWallWithOpenings(viewer.otherWallsRoot, "x", -length / 2, width, wallThickness, wallHeight, floorY, wallMat, backWindows, frameMat, glassMat);

  const sideCapacity = Math.max(0, Math.floor(length / 1.8));
  const leftWindows = spreadCenters(length, Math.min(windowsLeft, Math.ceil(windowsLeft / 2), sideCapacity), 1.05)
    .map((opening) => ({ ...opening, bottom: 0.82, height: Math.min(1.05, wallHeight - 1.05), type: "window" }));
  windowsLeft -= leftWindows.length;
  const rightWindows = spreadCenters(length, Math.min(windowsLeft, sideCapacity), 1.05)
    .map((opening) => ({ ...opening, bottom: 0.82, height: Math.min(1.05, wallHeight - 1.05), type: "window" }));
  addWallWithOpenings(viewer.otherWallsRoot, "z", -width / 2, length, wallThickness, wallHeight, floorY, wallMat, leftWindows, frameMat, glassMat);
  addWallWithOpenings(viewer.otherWallsRoot, "z", width / 2, length, wallThickness, wallHeight, floorY, wallMat, rightWindows, frameMat, glassMat);

  // Convert AI's normalized room rectangles into shared interior wall segments.
  const vertical = new Map();
  const horizontal = new Map();
  const addLine = (map, position, start, end) => {
    if (position <= 0.012 || position >= 0.988) return;
    const key = String(Math.round(position * 1000) / 1000);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push([start, end]);
  };
  for (const room of (Array.isArray(rooms) ? rooms : [])) {
    const x = clamp(room.x, 0, 1);
    const y = clamp(room.y, 0, 1);
    const w = clamp(room.width, 0.12, 1);
    const h = clamp(room.length, 0.12, 1);
    addLine(vertical, x, y, y + h);
    addLine(vertical, x + w, y, y + h);
    addLine(horizontal, y, x, x + w);
    addLine(horizontal, y + h, x, x + w);
  }
  const partitionDoorH = Math.min(2.02, wallHeight - 0.14);
  for (const [positionText, intervals] of vertical) {
    const x = -width / 2 + Number(positionText) * width;
    for (const [start, end] of mergeIntervals(intervals)) {
      const z1 = -length / 2 + start * length;
      const z2 = -length / 2 + end * length;
      const segmentLength = z2 - z1;
      const openings = segmentLength > 1.35 ? [{ center: 0, width: Math.min(0.86, segmentLength * 0.38), bottom: 0, height: partitionDoorH, type: "door" }] : [];
      const beforeCount = viewer.interiorRoot.children.length;
      addWallWithOpenings(viewer.interiorRoot, "z", x, segmentLength, Math.max(0.1, wallThickness * 0.72), wallHeight, floorY, partitionMat, openings, frameMat, glassMat);
      // addWallWithOpenings uses local coordinates, so align each room divider to its true center.
      for (let i = beforeCount; i < viewer.interiorRoot.children.length; i += 1) {
        viewer.interiorRoot.children[i].position.z += (z1 + z2) / 2;
      }
    }
  }
  for (const [positionText, intervals] of horizontal) {
    const z = -length / 2 + Number(positionText) * length;
    for (const [start, end] of mergeIntervals(intervals)) {
      const x1 = -width / 2 + start * width;
      const x2 = -width / 2 + end * width;
      const segmentLength = x2 - x1;
      const openings = segmentLength > 1.35 ? [{ center: 0, width: Math.min(0.86, segmentLength * 0.38), bottom: 0, height: partitionDoorH, type: "door" }] : [];
      const beforeCount = viewer.interiorRoot.children.length;
      addWallWithOpenings(viewer.interiorRoot, "x", z, segmentLength, Math.max(0.1, wallThickness * 0.72), wallHeight, floorY, partitionMat, openings, frameMat, glassMat);
      // Wall helper starts at -segmentLength/2; shift new divider pieces to segment center.
      for (let i = beforeCount; i < viewer.interiorRoot.children.length; i += 1) {
        viewer.interiorRoot.children[i].position.x += (x1 + x2) / 2;
      }
    }
  }

  const roofType = project.roofType || "gable";
  const roofY = floorY + wallHeight;
  const overhang = 0.32;
  const rise = Math.min(1.65, width * 0.24);
  if (roofType === "flat") {
    addBox(viewer.roofRoot, roofMat, width + overhang * 2, 0.2, length + overhang * 2, 0, roofY + 0.12, 0);
    const lip = makeMaterial(0x354956, { roughness: 0.72 });
    addBox(viewer.roofRoot, lip, 0.09, 0.3, length + overhang * 2, -width / 2 - overhang, roofY + 0.12, 0);
    addBox(viewer.roofRoot, lip, 0.09, 0.3, length + overhang * 2, width / 2 + overhang, roofY + 0.12, 0);
  } else {
    const halfW = width / 2 + overhang;
    const ridgeZInset = roofType === "hip" ? Math.min(length * 0.28, width * 0.43) : 0;
    const ridgeFront = length / 2 - ridgeZInset;
    const ridgeBack = -length / 2 + ridgeZInset;
    createRoofSurface(viewer.roofRoot, [
      [-halfW, roofY, -length / 2 - overhang],
      [0, roofY + rise, ridgeBack],
      [0, roofY + rise, ridgeFront],
      [-halfW, roofY, length / 2 + overhang]
    ], roofMat);
    createRoofSurface(viewer.roofRoot, [
      [0, roofY + rise, ridgeBack],
      [halfW, roofY, -length / 2 - overhang],
      [halfW, roofY, length / 2 + overhang],
      [0, roofY + rise, ridgeFront]
    ], roofMat);
    if (roofType === "gable") {
      for (const endZ of [-length / 2, length / 2]) {
        const shape = new THREE.Shape();
        shape.moveTo(-width / 2 + 0.02, 0);
        shape.lineTo(0, rise);
        shape.lineTo(width / 2 - 0.02, 0);
        shape.closePath();
        const geometry = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(geometry, wallMat);
        mesh.position.set(0, roofY, endZ);
        mesh.material.side = THREE.DoubleSide;
        mesh.castShadow = true;
        viewer.roofRoot.add(mesh);
      }
    }
    // Ridge cap and a small fascia make the roof read clearly in 3D.
    addBox(viewer.roofRoot, trimMat, 0.13, 0.14, Math.max(0.8, length - ridgeZInset * 2), 0, roofY + rise + 0.015, 0);
    addBox(viewer.roofRoot, trimMat, 0.09, 0.12, length + overhang * 2, -halfW + 0.02, roofY - 0.01, 0);
    addBox(viewer.roofRoot, trimMat, 0.09, 0.12, length + overhang * 2, halfW - 0.02, roofY - 0.01, 0);
  }

  // A thin foundation edge visually separates the house from the ground.
  addBox(viewer.houseRoot, trimMat, width + 0.12, 0.1, length + 0.12, 0, 0.01, 0, { castShadow: false });
  viewer.frontRoot.visible = !viewer.cutaway;
  viewer.roofRoot.visible = viewer.showRoof && !viewer.cutaway;
  viewer.camera.near = Math.max(0.05, Math.min(width, length) / 100);
  viewer.camera.far = Math.max(200, Math.max(width, length) * 30);
  viewer.camera.updateProjectionMatrix();

  const oldStatus = document.querySelector("#house3dStatus");
  if (oldStatus) oldStatus.textContent = "3D model tayyor · " + width.toLocaleString("uz-UZ") + " × " + length.toLocaleString("uz-UZ") + " m";
  const root = document.querySelector("#house3dCanvas");
  if (root) root.dataset.ready = "true";
}

export function renderHouse3D(container, project, rooms) {
  if (!sharedViewer || sharedViewer.container !== container) {
    if (sharedViewer) sharedViewer.destroy();
    sharedViewer = createViewer(container);
  }
  buildHouse(sharedViewer, project, rooms);
  sharedViewer.resetView();
  return sharedViewer;
}
