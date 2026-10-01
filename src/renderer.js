import { FilesetResolver, HandLandmarker } from "../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";

const video = document.querySelector("#camera");
const canvas = document.querySelector("#overlay");
const ctx = canvas.getContext("2d");
const toggleButton = document.querySelector("#toggleTracking");
const emptyState = document.querySelector("#emptyState");
const gestureName = document.querySelector("#gestureName");
const gestureHint = document.querySelector("#gestureHint");
const trackingLabel = document.querySelector("#trackingLabel");
const modelStatus = document.querySelector("#modelStatus");
const fpsLabel = document.querySelector("#fps");
const actionRows = [...document.querySelectorAll(".gesture-row")];

let landmarker;
let stream;
let tracking = false;
let displaySize = { width: 1920, height: 1080 };
let lastVideoTime = -1;
let lastFrameAt = performance.now();
let smoothedX = null;
let smoothedY = null;
let targetX = null;
let targetY = null;
let acceptedTip = null;
let scrollAnchor = null;
let scrollAccumulator = 0;
let stableGesture = "idle";
let candidateGesture = "idle";
let candidateFrames = 0;
let actionLock = null;
let actionLockReleasedAt = 0;

const settings = { stability: 0.82, speed: 1, pinchRatio: 0.38 };
const pinchState = { index: false, middle: false, ring: false, pinky: false };
const clickState = { startedAt: 0, dragging: false };
const connections = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]
];

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fingerUp(points, tip, pip, mcp) {
  const extended = distance(points[tip], points[mcp]) > distance(points[pip], points[mcp]) * 1.28;
  return extended && points[tip].y < points[pip].y + 0.015;
}

function updatePinch(name, ratio) {
  const releaseThreshold = settings.pinchRatio * 1.38;
  pinchState[name] = pinchState[name] ? ratio < releaseThreshold : ratio < settings.pinchRatio;
  return pinchState[name];
}

function setGesture(name, hint = "") {
  gestureName.textContent = name;
  gestureHint.textContent = hint;
}

function highlightAction(action) {
  actionRows.forEach(row => row.classList.toggle("active", row.dataset.action === action));
}

function configureSlider(id, outputId, format, update) {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${outputId}`);
  const apply = () => {
    output.textContent = format(input.value);
    update(Number(input.value));
  };
  input.addEventListener("input", apply);
  apply();
}

configureSlider("stability", "stabilityValue", v => `${v}%`, v => settings.stability = v / 100);
configureSlider("speed", "speedValue", v => `${(v / 100).toFixed(1)}x`, v => settings.speed = v / 100);
configureSlider("pinch", "pinchValue", v => `${v}%`, v => settings.pinchRatio = v / 100);

async function startCamera() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
}

async function initialize() {
  try {
    displaySize = await window.airPointer.getDisplaySize();
    await startCamera();
    const vision = await FilesetResolver.forVisionTasks("../node_modules/@mediapipe/tasks-vision/wasm");
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "../assets/hand_landmarker.task", delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.62,
      minHandPresenceConfidence: 0.62,
      minTrackingConfidence: 0.68
    });
    modelStatus.classList.add("ready");
    modelStatus.querySelector("span").textContent = "Neural tracking online";
    toggleButton.disabled = false;
    requestAnimationFrame(predict);
  } catch (error) {
    console.error(`Initialization failed: ${error?.stack || error}`);
    modelStatus.querySelector("span").textContent = "Camera or model unavailable";
    setGesture("Setup needed", "Check camera access and restart");
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return rect;
}

function drawHand(points, rect, activeGesture) {
  ctx.clearRect(0, 0, rect.width, rect.height);
  const mapped = points.map(point => ({ x: (1 - point.x) * rect.width, y: point.y * rect.height }));
  const isAction = activeGesture.includes("pinch") || activeGesture === "drag";
  ctx.save();
  ctx.shadowBlur = 15;
  ctx.shadowColor = isAction ? "#ff45d7" : "#27d9ff";
  ctx.lineWidth = 2;
  ctx.strokeStyle = isAction ? "rgba(255,69,215,.84)" : "rgba(39,217,255,.78)";
  ctx.beginPath();
  for (const [a, b] of connections) {
    ctx.moveTo(mapped[a].x, mapped[a].y);
    ctx.lineTo(mapped[b].x, mapped[b].y);
  }
  ctx.stroke();

  for (let i = 0; i < mapped.length; i++) {
    ctx.beginPath();
    ctx.arc(mapped[i].x, mapped[i].y, [4,8,12,16,20].includes(i) ? 5 : 2.8, 0, Math.PI * 2);
    ctx.fillStyle = [4,8,12,16,20].includes(i) ? "#f5fbff" : "#27d9ff";
    ctx.fill();
  }

  const index = mapped[8];
  ctx.beginPath();
  ctx.arc(index.x, index.y, activeGesture === "drag" ? 24 : 14, 0, Math.PI * 2);
  ctx.strokeStyle = activeGesture === "drag" ? "#ff45d7" : "#27d9ff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function moveCursor(points, force = false) {
  const index = { x: points[8].x * 0.72 + points[7].x * 0.28, y: points[8].y * 0.72 + points[7].y * 0.28 };
  const cameraDeadZone = 0.005 + settings.stability * 0.012;
  const meaningfulMovement = force || !acceptedTip || distance(index, acceptedTip) >= cameraDeadZone;
  if (meaningfulMovement) {
    acceptedTip = index;
    const marginX = 0.14;
    const marginTop = 0.12;
    const marginBottom = 0.18;
    let nx = (index.x - marginX) / (1 - marginX * 2);
    let ny = (index.y - marginTop) / (1 - marginTop - marginBottom);
    nx = Math.max(0, Math.min(1, (nx - 0.5) * settings.speed + 0.5));
    ny = Math.max(0, Math.min(1, (ny - 0.5) * settings.speed + 0.5));
    targetX = (1 - nx) * displaySize.width;
    targetY = ny * displaySize.height;
  }
  if (targetX === null) return;
  if (smoothedX === null) {
    smoothedX = targetX;
    smoothedY = targetY;
  }

  const screenDistance = Math.hypot(targetX - smoothedX, targetY - smoothedY);
  const pixelDeadZone = 5 + settings.stability * 14;
  if (!force && screenDistance < pixelDeadZone) return;
  const adaptiveFollow = Math.min(0.48, 0.055 + (screenDistance / 260) * 0.25 + (1 - settings.stability) * 0.12);
  smoothedX += (targetX - smoothedX) * adaptiveFollow;
  smoothedY += (targetY - smoothedY) * adaptiveFollow;
  window.airPointer.mouse({ type: "move", x: Math.round(smoothedX), y: Math.round(smoothedY) });
}

function classifyGesture(points) {
  const palmSize = Math.max(distance(points[0], points[9]), 0.06);
  const pinches = {
    index: updatePinch("index", distance(points[4], points[8]) / palmSize),
    middle: updatePinch("middle", distance(points[4], points[12]) / palmSize),
    ring: updatePinch("ring", distance(points[4], points[16]) / palmSize),
    pinky: updatePinch("pinky", distance(points[4], points[20]) / palmSize)
  };

  if (actionLock && pinches[actionLock]) return `${actionLock}-pinch`;
  if (actionLock && !pinches[actionLock]) {
    actionLock = null;
    actionLockReleasedAt = performance.now();
  }
  if (!actionLock && performance.now() - actionLockReleasedAt > 180) {
    for (const finger of ["index", "middle", "ring", "pinky"]) {
      if (pinches[finger]) {
        actionLock = finger;
        return `${finger}-pinch`;
      }
    }
  }

  const up = {
    index: fingerUp(points, 8, 6, 5), middle: fingerUp(points, 12, 10, 9),
    ring: fingerUp(points, 16, 14, 13), pinky: fingerUp(points, 20, 18, 17)
  };
  if (up.index && up.middle && !up.ring && !up.pinky) return "scroll";
  if (up.index && !up.middle && !up.ring && !up.pinky) return "move";
  if (up.index && up.middle && up.ring && up.pinky) return "open-palm";
  return "idle";
}

function stabilizeGesture(next) {
  if (next === candidateGesture) candidateFrames += 1;
  else { candidateGesture = next; candidateFrames = 1; }
  const requiredFrames = next.includes("pinch") ? 2 : 3;
  if (candidateFrames >= requiredFrames) stableGesture = next;
  return stableGesture;
}

function handleIndexPinch(active, points, now) {
  if (active) {
    if (!clickState.startedAt) clickState.startedAt = now;
    const heldFor = now - clickState.startedAt;
    if (heldFor >= 450 && !clickState.dragging) {
      window.airPointer.mouse({ type: "leftDown" });
      clickState.dragging = true;
    }
    if (clickState.dragging) moveCursor(points, true);
    setGesture(clickState.dragging ? "Dragging" : "Click ready", clickState.dragging ? "Release pinch to drop" : "Release for one click");
    highlightAction("index");
    return clickState.dragging ? "drag" : "index-pinch";
  }
  if (clickState.startedAt) {
    if (clickState.dragging) window.airPointer.mouse({ type: "leftUp" });
    else window.airPointer.mouse({ type: "leftClick" });
  }
  clickState.startedAt = 0;
  clickState.dragging = false;
  return null;
}

function processGestures(points, now) {
  const gesture = stabilizeGesture(classifyGesture(points));
  const indexResult = handleIndexPinch(gesture === "index-pinch", points, now);
  if (indexResult) return indexResult;
  if (gesture !== "scroll") { scrollAnchor = null; scrollAccumulator = 0; }

  switch (gesture) {
    case "middle-pinch":
      if (candidateFrames === 2) window.airPointer.mouse({ type: "rightClick" });
      setGesture("Right click", "Release before the next action");
      highlightAction("middle");
      break;
    case "ring-pinch":
      if (candidateFrames === 2) window.airPointer.mouse({ type: "doubleClick" });
      setGesture("Double click", "Ring finger action");
      highlightAction("ring");
      break;
    case "pinky-pinch":
      setGesture("Cursor locked", "Release pinky pinch to unlock");
      highlightAction("pinky");
      break;
    case "scroll": {
      const currentY = (points[8].y + points[12].y) / 2;
      if (scrollAnchor !== null) {
        const delta = scrollAnchor - currentY;
        if (Math.abs(delta) > 0.004) scrollAccumulator += delta * 1050;
        if (Math.abs(scrollAccumulator) >= 24) {
          window.airPointer.mouse({ type: "scroll", delta: Math.round(scrollAccumulator) });
          scrollAccumulator = 0;
        }
      }
      scrollAnchor = currentY;
      setGesture("Smooth scroll", "Move two fingers up or down");
      highlightAction("scroll");
      break;
    }
    case "move":
      moveCursor(points);
      setGesture("Pointer", "Small hand shake is being ignored");
      highlightAction("move");
      break;
    case "open-palm":
      setGesture("Steady hold", "Cursor movement paused");
      highlightAction("hold");
      break;
    default:
      setGesture("Neutral", "Raise only your index finger to move");
      highlightAction("");
  }
  return gesture;
}

function stopGestureState() {
  if (clickState.dragging) window.airPointer.mouse({ type: "leftUp" });
  clickState.startedAt = 0;
  clickState.dragging = false;
  scrollAnchor = null;
  scrollAccumulator = 0;
  stableGesture = "idle";
  candidateGesture = "idle";
  candidateFrames = 0;
  actionLock = null;
  Object.keys(pinchState).forEach(key => pinchState[key] = false);
}

async function predict(now) {
  const rect = resizeCanvas();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    const points = result.landmarks?.[0];
    emptyState.classList.toggle("hidden", Boolean(points));
    if (points) {
      const gesture = tracking ? processGestures(points, now) : "idle";
      if (!tracking) setGesture("Hand detected", "Start control when you are ready");
      drawHand(points, rect, gesture);
    } else {
      ctx.clearRect(0, 0, rect.width, rect.height);
      setGesture(tracking ? "Hand lost" : "Waiting", tracking ? "Return your hand to the frame" : "Show one hand to begin");
      stopGestureState();
      acceptedTip = null;
      targetX = null;
      targetY = null;
    }
    const frameTime = now - lastFrameAt;
    lastFrameAt = now;
    fpsLabel.textContent = `${Math.round(1000 / Math.max(frameTime, 1))} FPS`;
  }
  requestAnimationFrame(predict);
}

function setTracking(enabled) {
  tracking = enabled;
  window.airPointer.setTracking(enabled);
  toggleButton.classList.toggle("active", enabled);
  toggleButton.querySelector("span:last-child").textContent = enabled ? "Stop control" : "Start control";
  trackingLabel.textContent = enabled ? "Control active" : "Tracking off";
  document.querySelector(".status-pill").classList.toggle("on", enabled);
  document.body.classList.toggle("tracking", enabled);
  if (!enabled) {
    stopGestureState();
    smoothedX = null;
    smoothedY = null;
    targetX = null;
    targetY = null;
    acceptedTip = null;
    highlightAction("");
  }
}

toggleButton.addEventListener("click", () => setTracking(!tracking));
document.querySelector("#cameraToggle").addEventListener("click", startCamera);
window.airPointer.onEmergencyStop(() => setTracking(false));
window.addEventListener("beforeunload", () => setTracking(false));

initialize();
