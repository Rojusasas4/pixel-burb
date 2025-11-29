// client.js — connects to your Cloudflare Worker WS
const CANVAS_W = 512;
const CANVAS_H = 512;

// Create canvas
const canvas = document.createElement("canvas");
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");

// ImageData for pixel updates
const imgData = ctx.createImageData(CANVAS_W, CANVAS_H);

// Convert palette index (0-255) to RGBA color — simple grayscale example
function indexToColor(i) {
  return [i, i, i, 255];
}

// Fill canvas from Uint8Array
function updateCanvas(bytes) {
  for (let y = 0; y < CANVAS_H; y++) {
    for (let x = 0; x < CANVAS_W; x++) {
      const idx = y * CANVAS_W + x;
      const color = indexToColor(bytes[idx]);
      const offset = (y * CANVAS_W + x) * 4;
      imgData.data[offset] = color[0];
      imgData.data[offset + 1] = color[1];
      imgData.data[offset + 2] = color[2];
      imgData.data[offset + 3] = color[3];
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// Connect to your Worker WebSocket
const ws = new WebSocket("wss://pixel-burb.rojus005.workers.dev/ws");

ws.onopen = () => {
  console.log("Connected to Worker WS!");
};

ws.onmessage = evt => {
  const msg = JSON.parse(evt.data);

  if (msg.type === "full") {
    // full canvas state (base64)
    const bytes = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0));
    updateCanvas(bytes);
  } else if (msg.type === "update") {
    // incremental updates
    msg.changes.forEach(c => {
      const offset = (c.y * CANVAS_W + c.x) * 4;
      const color = indexToColor(c.ci);
      imgData.data[offset] = color[0];
      imgData.data[offset + 1] = color[1];
      imgData.data[offset + 2] = color[2];
      imgData.data[offset + 3] = color[3];
    });
    ctx.putImageData(imgData, 0, 0);
  }
};

// Example: place a pixel by clicking
canvas.addEventListener("click", e => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) * (CANVAS_W / rect.width));
  const y = Math.floor((e.clientY - rect.top) * (CANVAS_H / rect.height));

  const ci = Math.floor(Math.random() * 256); // random color index
  ws.send(JSON.stringify({ type: "place", x, y, ci }));
});
