// client.js
const CANVAS_W = 512;   // canvas dimensions (pixels)
const CANVAS_H = 512;
const TILE_SIZE = 1;    // logical pixel = 1 board pixel; we scale with zoom
const PALETTE = [
  "#FFFFFF","#E4E4E4","#888888","#222222",
  "#FFA7D1","#E50000","#E59500","#A06A42",
  "#E5D900","#94E044","#02BE01","#00D3DD",
  "#0083C7","#0000EA","#CF6EE4","#820080"
];

const board = document.getElementById('board');
const ctx = board.getContext('2d');
const statusEl = document.getElementById('status');

let zoomInput = document.getElementById('zoom');
let zoom = parseInt(zoomInput.value,10) || 4;
let selectedColorIndex = 1;

// Logical grid stored as Uint8Array (palette index per pixel)
const grid = new Uint8Array(CANVAS_W * CANVAS_H);

// Size canvas in CSS pixels for crisp pixel rendering
function resizeCanvas(){
  board.width = CANVAS_W * TILE_SIZE;
  board.height = CANVAS_H * TILE_SIZE;
  board.style.width = `${CANVAS_W * zoom}px`;
  board.style.height = `${CANVAS_H * zoom}px`;
  drawFull();
}

zoomInput.addEventListener('input', (e)=>{
  zoom = parseInt(e.target.value,10);
  resizeCanvas();
});

function drawFull(){
  // create ImageData and fill from grid
  const id = ctx.createImageData(CANVAS_W, CANVAS_H);
  for(let i=0;i<CANVAS_W*CANVAS_H;i++){
    const pi = grid[i];
    const hex = PALETTE[pi] || "#000000";
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    id.data[i*4]=r; id.data[i*4+1]=g; id.data[i*4+2]=b; id.data[i*4+3]=255;
  }
  ctx.putImageData(id,0,0);
}

// draw a single pixel at logical x,y
function drawPixel(x,y,colorIndex){
  grid[y*CANVAS_W + x] = colorIndex;
  ctx.fillStyle = PALETTE[colorIndex];
  ctx.fillRect(x, y, 1, 1);
}

// palette UI
const paletteDiv = document.getElementById('palette');
PALETTE.forEach((c, idx) => {
  const sw = document.createElement('div');
  sw.className = 'colorSwatch' + (idx===selectedColorIndex ? ' selected' : '');
  sw.style.background = c;
  sw.title = idx;
  sw.addEventListener('click', ()=> {
    document.querySelectorAll('.colorSwatch').forEach(el=>el.classList.remove('selected'));
    sw.classList.add('selected');
    selectedColorIndex = idx;
  });
  paletteDiv.appendChild(sw);
});

document.getElementById('clearBtn').addEventListener('click', ()=>{
  grid.fill(0);
  drawFull();
});

// interaction
let isMouseDown = false;
board.addEventListener('mousedown', e => {
  isMouseDown = true;
  handlePointer(e);
});
window.addEventListener('mouseup', ()=> isMouseDown = false);
board.addEventListener('mousemove', e => { if(isMouseDown) handlePointer(e); });
board.addEventListener('click', handlePointer);

function getCanvasXY(e){
  const rect = board.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / (rect.width) * CANVAS_W;
  const cy = (e.clientY - rect.top) / (rect.height) * CANVAS_H;
  const x = Math.floor(cx);
  const y = Math.floor(cy);
  return {x,y};
}

function handlePointer(e){
  const {x,y} = getCanvasXY(e);
  if(x<0||y<0||x>=CANVAS_W||y>=CANVAS_H) return;
  placePixel(x,y, selectedColorIndex);
}

// networking
// Your Cloudflare Worker URL (replace with your deployed worker domain)
const WORKER_WS_URL = (location.hostname.endsWith('github.io') ? 'wss://your-worker.example.com/ws' : `wss://${location.hostname.replace('github.io','workers.dev')}/ws`);
// NOTE: replace above with your actual worker endpoint after deployment

let ws;
let nextLocalId = 1; // for local optimistic updates

function connectWS(){
  // Use the actual worker host — you'll replace WORKER_WS_URL after deploy
  const host = prompt("Enter your Worker wss:// URL", "");
  if(!host) { statusEl.textContent = "no ws url"; return; }
  ws = new WebSocket(host);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { statusEl.textContent = 'connected'; };
  ws.onmessage = (ev) => {
    // messages are JSON blobs or binary (we use JSON)
    const msg = JSON.parse(ev.data);
    if(msg.type === 'full') {
      // full dump contains {type:'full', data: base64 or array of palette indices flattened}
      // we expect data as base64-encoded bytes
      const bytes = Uint8Array.from(atob(msg.data), c=>c.charCodeAt(0));
      if(bytes.length === grid.length) {
        grid.set(bytes);
        drawFull();
      } else {
        console.warn('unexpected full size', bytes.length);
      }
    } else if(msg.type === 'update'){
      // update: {type:'update', changes:[ {x,y,ci}, ... ]}
      for(const ch of msg.changes){
        drawPixel(ch.x, ch.y, ch.ci);
      }
    } else if(msg.type === 'ack'){
      // optional: server ack for rate limiting or confirmations
    }
  };
  ws.onclose = (e) => { statusEl.textContent = 'disconnected'; setTimeout(connectWS,2000); };
  ws.onerror = (e) => { statusEl.textContent = 'error'; console.error(e); };
}

function placePixel(x,y,colorIndex){
  // optimistic draw locally
  drawPixel(x,y,colorIndex);
  // send to server
  if(ws && ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify({type:'place',x,y,ci:colorIndex}));
  } else {
    // fallback: queue or use fetch to REST endpoint (not implemented here)
    console.warn('ws not open');
  }
}

// initial
resizeCanvas();
connectWS();
