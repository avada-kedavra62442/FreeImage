import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Aperture, ArrowDownToLine, ArrowLeft, ArrowRight, Brush, Check, ChevronDown, Circle, Crop, Download, Eye, EyeOff, FileImage, FlipHorizontal, Hand, Image as ImageIcon, Layers, LockKeyhole, Minus, MousePointer2, Paintbrush, Plus, Redo2, RotateCcw, Save, Settings2, Shapes, SlidersHorizontal, Sparkles, Square, Type, Undo2, Upload, WandSparkles, X, ZoomIn, ZoomOut } from 'lucide-react';

const TOOLSET = [
  { id: 'move', label: 'Move', Icon: MousePointer2, group: 'Essentials' },
  { id: 'crop', label: 'Crop', Icon: Crop, group: 'Essentials' },
  { id: 'brush', label: 'Brush', Icon: Paintbrush, group: 'Paint' },
  { id: 'eraser', label: 'Eraser', Icon: Brush, group: 'Paint' },
  { id: 'text', label: 'Text', Icon: Type, group: 'Create' },
  { id: 'shape', label: 'Shape', Icon: Shapes, group: 'Create' },
  { id: 'blur', label: 'Blur area', Icon: Aperture, group: 'Retouch' },
  { id: 'pixelate', label: 'Pixelate', Icon: Circle, group: 'Retouch' },
];
const INITIAL_ADJUST = { brightness: 100, contrast: 100, saturation: 100, warmth: 0, blur: 0, grayscale: 0, sepia: 0 };
const uid = () => 'layer-' + Math.random().toString(36).slice(2, 10);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export default function App() {
  const [file, setFile] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiWorking, setAiWorking] = useState(false);
  const [image, setImage] = useState(null);
  const [tool, setTool] = useState('move');
  const [panel, setPanel] = useState('layers');
  const [adjust, setAdjust] = useState(INITIAL_ADJUST);
  const [layers, setLayers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [textValue, setTextValue] = useState('Your text');
  const [color, setColor] = useState('#55e6a5');
  const [brushSize, setBrushSize] = useState(18);
  const [opacity, setOpacity] = useState(100);
  const [zoom, setZoom] = useState(100);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [exportFormat, setExportFormat] = useState('image/png');
  const [quality, setQuality] = useState(92);
  const [filename, setFilename] = useState('freeimage-edit');
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const inputRef = useRef(null);
  const gestureRef = useRef(null);

  const activeLayer = layers.find((layer) => layer.id === selected) || null;
  const dims = image ? image.naturalWidth + ' × ' + image.naturalHeight : 'No document';
  const visibleLayers = useMemo(() => layers.filter((layer) => layer.visible !== false), [layers]);

  const snapshot = useCallback(() => ({ adjust: { ...adjust }, layers: layers.map((layer) => ({ ...layer, points: layer.points ? layer.points.map((p) => ({ ...p })) : undefined })), crop: { ...crop } }), [adjust, layers, crop]);
  const commitHistory = useCallback(() => {
    setHistory((items) => [...items.slice(-39), snapshot()]);
    setFuture([]);
  }, [snapshot]);

  const loadImage = useCallback((nextFile) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('image/')) { setNotice('Choose an image file such as PNG, JPG, WebP, or GIF.'); return; }
    if (nextFile.size > 60 * 1024 * 1024) { setNotice('This image is over 60 MB. Choose a smaller file for smooth browser editing.'); return; }
    const url = URL.createObjectURL(nextFile);
    const img = new Image();
    img.onload = () => {
      setFile(nextFile);
      setImage(img);
      setFilename(nextFile.name.replace(/\.[^.]+$/, '') || 'freeimage-edit');
      setLayers([{ id: uid(), name: 'Background image', type: 'image', visible: true, locked: true, opacity: 100 }]);
      setSelected(null);
      setAdjust(INITIAL_ADJUST);
      setCrop({ x: 0, y: 0, w: 100, h: 100 });
      setHistory([]);
      setFuture([]);
      setNotice('Image opened locally. Your original file remains unchanged.');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setNotice('This image could not be decoded by the browser. Try PNG, JPG, or WebP.'); URL.revokeObjectURL(url); };
    img.src = url;
  }, []);

  const drawLayer = useCallback((ctx, layer, width, height) => {
    if (!layer || layer.visible === false) return;
    ctx.save();
    ctx.globalAlpha = (layer.opacity == null ? 100 : layer.opacity) / 100;
    ctx.strokeStyle = layer.color || color;
    ctx.fillStyle = layer.color || color;
    ctx.lineWidth = Math.max(1, (layer.size || brushSize) * width / 1000);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (layer.type === 'stroke' && layer.points && layer.points.length) {
      ctx.globalCompositeOperation = layer.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.beginPath();
      layer.points.forEach((point, index) => {
        const x = point.x * width, y = point.y * height;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else if (layer.type === 'text') {
      ctx.font = '600 ' + Math.max(12, (layer.size || 36) * width / 1000) + 'px Inter, Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(layer.text || 'Text', (layer.x || .5) * width, (layer.y || .5) * height);
    } else if (layer.type === 'shape') {
      const x = (layer.x || .25) * width, y = (layer.y || .25) * height;
      const w = (layer.w || .25) * width, h = (layer.h || .2) * height;
      if (layer.shape === 'circle') {
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      } else if (layer.shape === 'line') {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
      } else {
        ctx.strokeRect(x, y, w, h);
      }
      ctx.stroke();
    } else if (layer.type === 'region' && layer.mode === 'blur') {
      const x = Math.round((layer.x || 0) * width), y = Math.round((layer.y || 0) * height);
      const w = Math.max(1, Math.round((layer.w || .2) * width)), h = Math.max(1, Math.round((layer.h || .2) * height));
      ctx.restore();
      return;
    } else if (layer.type === 'region' && layer.mode === 'pixelate') {
      // Region effects are composited in renderDocument after the base pixels.
    }
    ctx.restore();
  }, [color, brushSize]);

  const renderDocument = useCallback((target, exportMode) => {
    if (!image || !target) return;
    const sourceW = image.naturalWidth, sourceH = image.naturalHeight;
    const sx = Math.round(sourceW * crop.x / 100), sy = Math.round(sourceH * crop.y / 100);
    const sw = Math.max(1, Math.min(sourceW - sx, Math.round(sourceW * crop.w / 100)));
    const sh = Math.max(1, Math.min(sourceH - sy, Math.round(sourceH * crop.h / 100)));
    target.width = sw; target.height = sh;
    const ctx = target.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, sw, sh);
    ctx.filter = 'brightness(' + adjust.brightness + '%) contrast(' + adjust.contrast + '%) saturate(' + adjust.saturation + '%) blur(' + adjust.blur + 'px) grayscale(' + adjust.grayscale + '%) sepia(' + adjust.sepia + '%)';
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.filter = 'none';
    if (adjust.warmth !== 0) {
      ctx.save(); ctx.globalAlpha = Math.abs(adjust.warmth) / 180;
      ctx.fillStyle = adjust.warmth > 0 ? '#ff9d52' : '#5e9dff'; ctx.globalCompositeOperation = 'soft-light'; ctx.fillRect(0, 0, sw, sh); ctx.restore();
    }
    visibleLayers.filter((layer) => layer.type !== 'image').forEach((layer) => {
      if (layer.type === 'region' && (layer.mode === 'blur' || layer.mode === 'pixelate')) {
        const x = Math.round((layer.x || 0) * sw), y = Math.round((layer.y || 0) * sh);
        const w = Math.max(1, Math.round((layer.w || .2) * sw)), h = Math.max(1, Math.round((layer.h || .2) * sh));
        const patch = document.createElement('canvas'); patch.width = w; patch.height = h;
        const pc = patch.getContext('2d');
        if (layer.mode === 'blur') { pc.filter = 'blur(' + (layer.size || 12) + 'px)'; pc.drawImage(target, x, y, w, h, 0, 0, w, h); pc.filter = 'none'; }
        else { const scale = Math.max(2, layer.size || 12); pc.imageSmoothingEnabled = false; pc.drawImage(target, x, y, w, h, 0, 0, Math.max(1, Math.round(w / scale)), Math.max(1, Math.round(h / scale))); pc.drawImage(patch, 0, 0); }
        ctx.save(); ctx.globalAlpha = (layer.opacity == null ? 100 : layer.opacity) / 100; ctx.drawImage(patch, x, y); ctx.restore();
      } else drawLayer(ctx, layer, sw, sh);
    });
    if (!exportMode && tool === 'crop') {
      ctx.save(); ctx.strokeStyle = '#55e6a5'; ctx.lineWidth = Math.max(2, sw / 600); ctx.setLineDash([8, 5]); ctx.strokeRect(sw * .03, sh * .03, sw * .94, sh * .94); ctx.restore();
    }
  }, [image, crop, adjust, visibleLayers, drawLayer, tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    renderDocument(canvas, false);
  }, [image, renderDocument]);

  function changeAdjust(key, value) {
    commitHistory();
    setAdjust((old) => ({ ...old, [key]: Number(value) }));
  }

  function addTextLayer() {
    if (!image) { setNotice('Open an image before adding layers.'); return; }
    commitHistory();
    const layer = { id: uid(), name: textValue.trim() || 'Text layer', type: 'text', text: textValue.trim() || 'Text', x: .12, y: .2, size: 38, color, opacity, visible: true };
    setLayers((items) => [...items, layer]); setSelected(layer.id); setNotice('Text layer added. Adjust its text and style in Properties.');
  }

  function addShapeLayer(shape) {
    if (!image) { setNotice('Open an image before adding layers.'); return; }
    commitHistory();
    const layer = { id: uid(), name: shape === 'circle' ? 'Ellipse shape' : shape === 'line' ? 'Line shape' : 'Rectangle shape', type: 'shape', shape, x: .28, y: .28, w: .36, h: .28, color, size: 3, opacity, visible: true };
    setLayers((items) => [...items, layer]); setSelected(layer.id); setNotice('Shape layer added to the document.');
  }

  function removeSelected() {
    if (!selected) return;
    commitHistory(); setLayers((items) => items.filter((layer) => layer.id !== selected)); setSelected(null);
  }

  function patchSelected(patch) {
    commitHistory();
    setLayers((items) => items.map((layer) => layer.id === selected ? { ...layer, ...patch } : layer));
  }

  function restoreSnapshot(snapshot) {
    setAdjust(snapshot.adjust); setLayers(snapshot.layers); setCrop(snapshot.crop); setSelected(null);
  }
  function undo() {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setFuture((items) => [...items, snapshot()]);
    restoreSnapshot(previous);
    setHistory((items) => items.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    const next = future[future.length - 1];
    setHistory((items) => [...items, snapshot()]);
    restoreSnapshot(next);
    setFuture((items) => items.slice(0, -1));
  }

  function pointFromEvent(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  }
  function onCanvasDown(event) {
    if (!image || !['brush', 'eraser', 'shape', 'blur', 'pixelate'].includes(tool)) return;
    event.preventDefault();
    const p = pointFromEvent(event);
    gestureRef.current = { tool, start: p, points: [p] };
    canvasRef.current.setPointerCapture(event.pointerId);
  }
  function onCanvasMove(event) {
    if (!gestureRef.current) return;
    const p = pointFromEvent(event);
    if (gestureRef.current.tool === 'brush' || gestureRef.current.tool === 'eraser') gestureRef.current.points.push(p);
  }
  function onCanvasUp() {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    const end = gesture.points[gesture.points.length - 1];
    const x = Math.min(gesture.start.x, end.x), y = Math.min(gesture.start.y, end.y);
    const w = Math.max(.015, Math.abs(end.x - gesture.start.x)), h = Math.max(.015, Math.abs(end.y - gesture.start.y));
    commitHistory();
    let layer;
    if (gesture.tool === 'brush' || gesture.tool === 'eraser') {
      layer = { id: uid(), name: gesture.tool === 'eraser' ? 'Eraser stroke' : 'Brush stroke', type: 'stroke', tool: gesture.tool, points: gesture.points, size: brushSize, color, opacity, visible: true };
    } else if (gesture.tool === 'shape') {
      layer = { id: uid(), name: 'Rectangle shape', type: 'shape', shape: 'rect', x, y, w, h, size: Math.max(2, brushSize / 4), color, opacity, visible: true };
    } else {
      layer = { id: uid(), name: gesture.tool === 'blur' ? 'Blur region' : 'Pixelated region', type: 'region', mode: gesture.tool, x, y, w, h, size: brushSize, color, opacity, visible: true };
    }
    setLayers((items) => [...items, layer]); setSelected(layer.id); setNotice(layer.name + ' added as an editable layer.');
  }

  async function runAIEdit() {
    if (!image) { setNotice('Open an image before using AI editing.'); return; }
    if (!aiPrompt.trim()) { setNotice('Describe the change you want AI to make.'); return; }
    setAiWorking(true); setNotice('Preparing image for AI editing…');
    try {
      const scale = Math.min(1, 1024 / image.naturalWidth, 1024 / image.naturalHeight);
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(image.naturalWidth * scale)); c.height = Math.max(1, Math.round(image.naturalHeight * scale));
      c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: c.toDataURL('image/jpeg', 0.86), prompt: aiPrompt.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'AI editing could not complete.');
      if (!data.image) throw new Error('The AI service returned no edited image.');
      const result = new Image();
      result.onload = () => { setImage(result); setLayers([{ id: uid(), name: 'AI edited image', type: 'image', visible: true, locked: true, opacity: 100 }]); setSelected(null); setCrop({x:0,y:0,w:100,h:100}); setHistory([]); setFuture([]); setNotice('AI edit ready. Your original local file has not been overwritten.'); setAiWorking(false); };
      result.onerror = () => { setNotice('The AI-generated image could not be opened.'); setAiWorking(false); };
      result.src = data.image;
    } catch (error) { setNotice(error.message || 'AI editing failed. Check the AI configuration.'); setAiWorking(false); }
  }

  async function exportImage() {
    if (!image) { setNotice('Open an image before exporting.'); return; }
    setBusy(true); setNotice('');
    try {
      const canvas = document.createElement('canvas');
      renderDocument(canvas, true);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, exportFormat, quality / 100));
      if (!blob) throw new Error('This format is not supported by this browser. Try PNG or JPEG.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = exportFormat === 'image/jpeg' ? 'jpg' : exportFormat === 'image/webp' ? 'webp' : 'png';
      a.href = url; a.download = (filename.trim() || 'freeimage-edit') + '.' + ext; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNotice('Export complete — ' + (blob.size / 1024).toFixed(1) + ' KB.'); 
    } catch (error) { setNotice(error.message || 'Export failed.'); }
    finally { setBusy(false); }
  }

  function resetDocument() {
    setImage(null); setFile(null); setLayers([]); setSelected(null); setAdjust(INITIAL_ADJUST); setCrop({ x: 0, y: 0, w: 100, h: 100 }); setHistory([]); setFuture([]); setNotice('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const styles = [
    '.pro-shell{min-height:100vh;background:#080e0c;color:#e7f4ed;font-family:Inter,ui-sans-serif,system-ui,sans-serif;--emerald:#55e6a5;--muted:#8ba69a;--line:#263a31;display:flex;flex-direction:column}',
    '.pro-shell *{box-sizing:border-box}.pro-shell button,.pro-shell input,.pro-shell select{font:inherit}.pro-shell button{cursor:pointer}.pro-top{height:62px;display:flex;align-items:center;gap:18px;padding:0 22px;border-bottom:1px solid #23372e;background:#0b1410;position:sticky;top:0;z-index:20}.pro-brand{display:flex;align-items:center;gap:10px;min-width:170px;color:#eefaf3;text-decoration:none;font-weight:800;letter-spacing:-.5px}.pro-brand small{display:block;font-size:8px;color:#8eaa9a;letter-spacing:1.6px;margin-top:3px;font-weight:600}.pro-mark{width:35px;height:35px;border-radius:10px;display:grid;place-items:center;background:#143e2b;border:1px solid #2d7652;color:var(--emerald)}.pro-file-actions,.pro-top-right{display:flex;align-items:center;gap:7px}.pro-top-spacer{flex:1}.pro-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #2b4236;border-radius:8px;background:#101d16;color:#bfd3c6;padding:8px 11px;font-size:11px!important;white-space:nowrap}.pro-btn:hover{border-color:#4f9b73;color:#f2fff7}.pro-btn:disabled{opacity:.35;cursor:not-allowed}.pro-primary{background:#1d8558;border-color:#3db47a;color:#f3fff7;font-weight:700}.pro-primary:hover{background:#249c68}.pro-icon-btn{width:34px;height:34px;padding:0}.pro-divider{width:1px;height:25px;background:#293b32;margin:0 3px}',
    '.pro-workspace{display:grid;grid-template-columns:64px minmax(0,1fr) 300px;min-height:calc(100vh - 62px);flex:1}.pro-tools{background:#0b1410;border-right:1px solid #23372e;padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:7px}.pro-tool{width:46px;height:46px;border:1px solid transparent;border-radius:10px;background:transparent;color:#88a596;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:8px!important}.pro-tool:hover{background:#14241b;color:#d7eee1}.pro-tool.active{background:#153d2a;border-color:#2c8056;color:#72edb1;box-shadow:inset 0 0 0 1px #55e6a512}.pro-tool-sep{height:1px;background:#23372e;width:31px;margin:4px 0}',
    '.pro-center{min-width:0;display:flex;flex-direction:column;background:#080f0c}.pro-docbar{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #1b2b23;background:#0a120e;color:#789889;font-size:10px;gap:12px}.pro-docbar strong{color:#d0e5d8;font-weight:600}.pro-stage{flex:1;min-height:480px;display:flex;align-items:center;justify-content:center;overflow:auto;padding:30px;background-color:#090f0c;background-image:linear-gradient(45deg,#ffffff04 25%,transparent 25%),linear-gradient(-45deg,#ffffff04 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ffffff04 75%),linear-gradient(-45deg,transparent 75%,#ffffff04 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}.pro-canvas-wrap{position:relative;max-width:100%;box-shadow:0 18px 60px #0009;line-height:0}.pro-canvas{display:block;max-width:100%;max-height:calc(100vh - 210px);height:auto;width:auto;touch-action:none;cursor:crosshair}.pro-empty{width:min(600px,100%);min-height:350px;border:1px dashed #345745;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;background:radial-gradient(ellipse at center,#1c53351a,transparent 70%)}.pro-empty-icon{width:62px;height:62px;border:1px solid #2c6d4a;background:#133222;border-radius:17px;display:grid;place-items:center;color:var(--emerald);margin-bottom:18px}.pro-empty h2{font-size:21px;letter-spacing:-.6px;margin:0 0 8px}.pro-empty p{max-width:360px;color:#8ca79a;font-size:12px;line-height:1.7;margin:0 0 20px}.pro-bottom{height:35px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 15px;border-top:1px solid #1b2b23;background:#0a120e;color:#799788;font-size:9px}.pro-zoom{display:flex;align-items:center;gap:8px}.pro-zoom button{border:0;background:transparent;color:#8ba99a;padding:3px;display:grid;place-items:center}.pro-zoom strong{color:#c4dbce;font-size:10px;min-width:34px;text-align:center}',
    '.pro-inspector{border-left:1px solid #23372e;background:#0b1410;min-width:0;display:flex;flex-direction:column}.pro-tabs{display:grid;grid-template-columns:repeat(3,1fr);height:43px;border-bottom:1px solid #23372e}.pro-tab{border:0;border-bottom:2px solid transparent;background:transparent;color:#789889;font-size:10px!important;display:flex;align-items:center;justify-content:center;gap:6px}.pro-tab.active{border-bottom-color:var(--emerald);color:#dff8e9;background:#122019}.pro-inspector-content{padding:16px;overflow:auto;max-height:calc(100vh - 108px)}.pro-section-title{display:flex;align-items:center;justify-content:space-between;color:#e0efe6;font-size:11px;font-weight:700;margin:3px 0 14px}.pro-muted{color:#789889;font-size:10px;line-height:1.65}.pro-field{display:flex;flex-direction:column;gap:8px;margin:0 0 16px;font-size:10px;color:#9ab4a5}.pro-field-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.pro-value{color:#d3e9dc;font-variant-numeric:tabular-nums}.pro-field input[type=range]{width:100%;accent-color:#4fdda0}.pro-field input[type=text],.pro-field input[type=number],.pro-field select,.pro-field textarea{width:100%;background:#08110c;border:1px solid #2b4336;color:#e4f3e9;border-radius:7px;padding:9px 10px;font-size:11px!important;outline:none}.pro-field input:focus,.pro-field select:focus,.pro-field textarea:focus{border-color:#4bbd82}.pro-field input[type=color]{width:100%;height:34px;border:1px solid #2b4336;border-radius:7px;background:#08110c;padding:3px}.pro-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pro-divider-line{height:1px;background:#203229;margin:17px 0}.pro-layer-list{display:flex;flex-direction:column;gap:5px}.pro-layer{display:flex;align-items:center;gap:7px;min-height:41px;padding:6px 7px;border:1px solid transparent;border-radius:8px;background:#0e1a13;color:#a8c3b4}.pro-layer.selected{background:#153725;border-color:#347e56;color:#e4f9ed}.pro-layer-name{min-width:0;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:transparent;border:0;color:inherit;font-size:10px!important;padding:5px 0}.pro-layer small{font-size:8px;color:#729281}.pro-layer-icon{color:#64dca0;flex:none}.pro-layer-actions{display:flex;gap:2px}.pro-layer-actions button{display:grid;place-items:center;width:23px;height:25px;border:0;background:transparent;color:#7e9e8c;border-radius:5px;padding:0}.pro-layer-actions button:hover{background:#294a36;color:#e8fff1}.pro-panel-note{padding:10px;border:1px solid #284c38;border-radius:8px;background:#102419;color:#9cb9a8;font-size:9px;line-height:1.6;margin-bottom:15px}.pro-empty-layers{padding:20px 8px;text-align:center;color:#769382;font-size:10px;line-height:1.7}.pro-chip-row{display:flex;gap:6px;flex-wrap:wrap}.pro-chip{border:1px solid #2b4537;background:#101e16;color:#a5c2b1;border-radius:7px;padding:8px 9px;font-size:10px!important}.pro-chip:hover{border-color:#4c9c70;color:#e8fff0}.pro-chip.active{background:#16442d;border-color:#3b9865;color:#80f0b7}.pro-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-top:1px solid #203128;background:#08110c;color:#688777;font-size:9px}.pro-footer strong{color:#8db29c;font-weight:600}.pro-notice{position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:50;max-width:min(600px,calc(100vw - 30px));display:flex;align-items:center;gap:9px;padding:11px 14px;border:1px solid #397a55;border-radius:10px;background:#10291c;color:#d8f4e3;box-shadow:0 12px 40px #0008;font-size:11px}.pro-notice button{border:0;background:transparent;color:#a4c8b3;padding:0 0 0 8px}.pro-hidden{display:none!important}',
    '@media(max-width:1000px){.pro-workspace{grid-template-columns:58px minmax(0,1fr)}.pro-inspector{grid-column:1/-1;border-left:0;border-top:1px solid #23372e}.pro-inspector-content{max-height:none}.pro-stage{min-height:420px}.pro-canvas{max-height:70vh}.pro-top{padding:0 12px;gap:8px}.pro-brand{min-width:auto}.pro-brand small{display:none}}',
    '@media(max-width:620px){.pro-top{height:auto;min-height:58px;flex-wrap:wrap;padding:10px}.pro-file-actions .pro-btn:not(.pro-primary){display:none}.pro-workspace{grid-template-columns:52px minmax(0,1fr)}.pro-tools{padding:9px 3px}.pro-tool{width:43px;height:43px}.pro-stage{padding:12px;min-height:320px}.pro-canvas{max-height:55vh}.pro-docbar{padding:0 9px}.pro-inspector-content{padding:13px}.pro-top-right .pro-btn{padding:8px}.pro-brand{font-size:13px}.pro-brand .pro-mark{width:30px;height:30px}.pro-bottom{padding:0 8px}.pro-footer{padding:12px;flex-wrap:wrap}.pro-empty{min-height:300px}.pro-empty h2{font-size:18px}}'
  ].join('');

  return <div className="pro-shell">
    <style>{styles}</style>
    <header className="pro-top">
      <a href="/" className="pro-brand" onClick={(event) => event.preventDefault()}><span className="pro-mark"><ImageIcon size={19} /></span><span>FreeImage<small>PRO IMAGE WORKSPACE</small></span></a>
      <div className="pro-divider" />
      <div className="pro-file-actions">
        <button className="pro-btn" onClick={() => { setShowEditor(true); inputRef.current && inputRef.current.click(); }}><Upload size={14} /> Open image</button>
        <input ref={inputRef} className="pro-hidden" type="file" accept="image/*" onChange={(event) => loadImage(event.target.files && event.target.files[0])} />
        <button className="pro-btn" onClick={undo} disabled={!history.length} title="Undo"><Undo2 size={15} /></button>
        <button className="pro-btn" onClick={redo} disabled={!future.length} title="Redo"><Redo2 size={15} /></button>
        <button className="pro-btn" onClick={resetDocument} disabled={!image}><RotateCcw size={14} /> Reset</button>
      </div>
      <div className="pro-top-spacer" />
      <div className="pro-top-right">
        <button className="pro-btn" onClick={() => setPanel('adjust')}><SlidersHorizontal size={14} /> Adjust</button>
        <button className="pro-btn pro-primary" onClick={exportImage} disabled={!image || busy}>{busy ? <span>Exporting…</span> : <><Download size={14} /> Export</>}</button>
      </div>
    </header>

    {!showEditor && <main className="fi-home">
<nav className="fi-home-nav"><a className="fi-home-brand" href="/" onClick={e=>e.preventDefault()}><span className="pro-mark"><ImageIcon size={19}/></span><span>FreeImage<small>THE CREATIVE WORKSPACE</small></span></a><div className="fi-home-links"><a href="#fi-features">Features</a><a href="#fi-tools">Tools</a><a href="#fi-ai">AI Studio</a></div><button className="pro-btn pro-primary" onClick={()=>setShowEditor(true)}>Open Studio <ArrowRight size={15}/></button></nav>
<section className="fi-hero"><div className="fi-hero-copy"><div className="fi-eyebrow"><span/> ONE WORKSPACE. LIMITLESS EDITS.</div><h1>Make every image<br/><em>look intentional.</em></h1><p>A complete creative workspace for editing, retouching, layers, typography, colour grading and AI-assisted transformations. No maze of tiny tools. Just one powerful editor.</p><div className="fi-hero-actions"><button className="fi-cta" onClick={()=>setShowEditor(true)}><Sparkles size={17}/> Enter the workspace <ArrowRight size={16}/></button><a href="#fi-features">Explore the features ↓</a></div><div className="fi-trust"><span><LockKeyhole size={15}/> Local-first editing</span><span><Layers size={15}/> Layer workflow</span><span><WandSparkles size={15}/> AI-ready studio</span></div></div>
<div className="fi-hero-visual"><div className="fi-mock-window"><div className="fi-mock-top"><span/><span/><span/><b>FREEIMAGE · STUDIO</b><i>100%</i></div><div className="fi-mock-body"><div className="fi-mock-tools"><span>↖</span><span>⌗</span><span>✎</span><span>T</span><span>◈</span></div><div className="fi-mock-canvas"><i className="fi-sun"/><i className="fi-mountain"/><i className="fi-mountain second"/><i className="fi-water"/></div><div className="fi-mock-inspector"><b>Adjustments</b><small>Exposure</small><span/><small>Contrast</small><span/><small>Saturation</small><span/><b>Layers</b><label>◉ Background</label><label>◉ Colour grade</label></div></div><div className="fi-mock-bottom"><span>● DOCUMENT READY</span><span>PNG · 2400 × 1600</span></div></div><div className="fi-float fi-float-ai"><Sparkles size={14}/> AI-assisted editing <b>Ready</b></div><div className="fi-float fi-float-layer"><Layers size={14}/> Editable layers</div></div></section>
<section className="fi-proof"><div><b>01</b><span>One unified workspace</span></div><div><b>02</b><span>Precision editing controls</span></div><div><b>03</b><span>AI image transformation</span></div><div><b>04</b><span>Flexible export</span></div></section>
<section className="fi-features" id="fi-features"><div className="fi-section-heading"><span className="fi-eyebrow">THE WHOLE TOOLKIT, FINALLY TOGETHER</span><h2>Professional control.<br/><em>Without the clutter.</em></h2><p>Everything lives in the same document, so you can combine tools instead of bouncing between mini-apps.</p></div><div className="fi-feature-grid"><article className="fi-feature-card fi-feature-wide"><span className="fi-feature-icon"><Layers size={20}/></span><small>01 / COMPOSE</small><h3>A real layer workflow</h3><p>Keep text, shapes, brush strokes and retouching on separate editable layers. Manage visibility, opacity and properties from one place.</p><div className="fi-layer-pills"><span>◉ Background image</span><span>◉ Typography</span><span>◉ Shape accent</span></div></article><article className="fi-feature-card"><span className="fi-feature-icon"><SlidersHorizontal size={20}/></span><small>02 / GRADE</small><h3>Fine-tune every tone</h3><p>Adjust brightness, contrast, saturation, warmth, blur, grayscale and sepia in a live panel.</p><div className="fi-sliders"><i/><i/><i/><i/></div></article><article className="fi-feature-card"><span className="fi-feature-icon"><Crop size={20}/></span><small>03 / RETOUCH</small><h3>Tools that work together</h3><p>Crop, paint, erase, add text and shapes, blur sensitive areas, pixelate details, then export.</p><div className="fi-tool-pills"><span>Crop</span><span>Brush</span><span>Text</span><span>Blur</span><span>Shapes</span></div></article><article className="fi-feature-card fi-feature-ai" id="fi-ai"><span className="fi-feature-icon"><WandSparkles size={20}/></span><small>04 / AI STUDIO</small><h3>Describe the edit.<br/>Let AI do the heavy lift.</h3><p>Prompt-based image editing in the same workspace. An OpenAI API key must be configured in Vercel; missing configuration is reported clearly.</p><button className="fi-cta fi-cta-small" onClick={()=>{setShowEditor(true);setPanel('ai')}}>Explore AI Studio <ArrowRight size={15}/></button></article></div></section>
<section className="fi-tool-band" id="fi-tools"><div><span className="fi-eyebrow">BUILT FOR REAL WORK</span><h2>From quick fixes to<br/><em>considered edits.</em></h2></div><div className="fi-tool-list"><span>✓ Crop and composition</span><span>✓ Colour and light adjustments</span><span>✓ Brush, eraser and retouching</span><span>✓ Typography and shapes</span><span>✓ Blur and pixelation regions</span><span>✓ PNG, JPEG and WebP export</span></div></section>
<footer className="fi-home-footer"><span><b>FreeImage</b> · Useful software. Without the nonsense.</span><span>FREE FOREVER · NO ADS · NO PAYWALLS</span><span>© 2026 FreeToolz</span></footer></main>}
    {showEditor && <div className="pro-workspace">
      <aside className="pro-tools" aria-label="Editing tools">
        {TOOLSET.map((item, index) => <React.Fragment key={item.id}>
          {(index === 2 || index === 4 || index === 6) && <span className="pro-tool-sep" />}
          <button className={'pro-tool' + (tool === item.id ? ' active' : '')} title={item.label} aria-label={item.label} onClick={() => setTool(item.id)}>
            <item.Icon size={18} /><span>{item.label}</span>
          </button>
        </React.Fragment>)}
        <span className="pro-tool-sep" />
        <button className="pro-tool" title="Adjustments" onClick={() => setPanel('adjust')}><SlidersHorizontal size={18} /><span>Adjust</span></button>
        <button className="pro-tool" title="Layers" onClick={() => setPanel('layers')}><Layers size={18} /><span>Layers</span></button>
      </aside>

      <main className="pro-center">
        <div className="pro-docbar">
          <span><strong>{file ? file.name : 'Untitled document'}</strong> {image ? ' · ' + dims + ' px' : ' · No image open'}</span>
          <span>{tool.toUpperCase()} TOOL</span>
        </div>
        <div className="pro-stage" ref={stageRef} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); loadImage(event.dataTransfer.files && event.dataTransfer.files[0]); }}>
          {!image ? <div className="pro-empty">
            <span className="pro-empty-icon"><ImageIcon size={27} /></span>
            <h2>Your creative workspace</h2>
            <p>One professional editing space. Open an image to work with layers, retouching, drawing, typography, colour adjustments, and export — all in one place.</p>
            <button className="pro-btn pro-primary" onClick={() => inputRef.current && inputRef.current.click()}><Upload size={15} /> Open image from device</button>
            <p style={{ marginTop: 15, marginBottom: 0, fontSize: 10 }}>Local-first editing · PNG, JPEG, WebP, GIF and browser-supported image formats</p>
          </div> : <div className="pro-canvas-wrap">
            <canvas ref={canvasRef} className="pro-canvas" style={{ zoom: zoom / 100, cursor: ['brush', 'eraser', 'shape', 'blur', 'pixelate'].includes(tool) ? 'crosshair' : 'default' }} onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp} />
          </div>}
        </div>
        <div className="pro-bottom">
          <span>{image ? dims + ' px' : 'Ready when you are'} · <span style={{ color: '#58dba0' }}>LOCAL PROCESSING</span></span>
          <div className="pro-zoom"><button onClick={() => setZoom((value) => clamp(value - 10, 25, 200))} title="Zoom out"><ZoomOut size={14} /></button><strong>{zoom}%</strong><button onClick={() => setZoom((value) => clamp(value + 10, 25, 200))} title="Zoom in"><ZoomIn size={14} /></button><button onClick={() => setZoom(100)}>Fit</button></div>
        </div>
      </main>

      <aside className="pro-inspector">
        <div className="pro-tabs">
          <button className={'pro-tab' + (panel === 'properties' ? ' active' : '')} onClick={() => setPanel('properties')}><Settings2 size={13} /> Properties</button>
          <button className={'pro-tab' + (panel === 'layers' ? ' active' : '')} onClick={() => setPanel('layers')}><Layers size={13} /> Layers</button>
          <button className={'pro-tab' + (panel === 'adjust' ? ' active' : '')} onClick={() => setPanel('adjust')}><SlidersHorizontal size={13} /> Adjust</button><button className={'pro-tab' + (panel === 'ai' ? ' active' : '')} onClick={() => setPanel('ai')}><Sparkles size={13}/> AI</button>
        </div>
        <div className="pro-inspector-content">
          {!image && <div className="pro-panel-note">Open an image to enable document properties, layers, colour adjustments, and export.</div>}
          {panel === 'layers' && <>
            <div className="pro-section-title"><span>Layers</span><span className="pro-muted">{layers.length} layer{layers.length === 1 ? '' : 's'}</span></div>
            <div className="pro-panel-note">Keep edits organised. Paint, text, shapes and retouch regions are separate editable layers above your original image.</div>
            <div className="pro-layer-list">
              {[...layers].reverse().map((layer) => <div key={layer.id} className={'pro-layer' + (selected === layer.id ? ' selected' : '')}>
                <span className="pro-layer-icon">{layer.type === 'text' ? <Type size={14} /> : layer.type === 'shape' ? <Shapes size={14} /> : layer.type === 'stroke' ? <Paintbrush size={14} /> : layer.type === 'region' ? <Aperture size={14} /> : <ImageIcon size={14} />}</span>
                <button className="pro-layer-name" onClick={() => { setSelected(layer.id); setPanel('properties'); }} title={layer.name}>{layer.name}<small style={{ display: 'block', marginTop: 3 }}>{layer.type} · {layer.opacity == null ? 100 : layer.opacity}%</small></button>
                <div className="pro-layer-actions"><button title={layer.visible === false ? 'Show layer' : 'Hide layer'} onClick={() => { commitHistory(); setLayers((items) => items.map((item) => item.id === layer.id ? { ...item, visible: item.visible === false } : item)); }}>{layer.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}</button>{!layer.locked && <button title="Delete layer" onClick={() => { commitHistory(); setLayers((items) => items.filter((item) => item.id !== layer.id)); if (selected === layer.id) setSelected(null); }}><X size={13} /></button>}</div>
              </div>)}
              {!layers.length && <div className="pro-empty-layers">Your layers will appear here once you open an image.</div>}
            </div>
            <div className="pro-divider-line" />
            <div className="pro-section-title">Add a layer <Plus size={14} /></div>
            <label className="pro-field">Text content<input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Type your text" /></label>
            <button className="pro-btn pro-primary" style={{ width: '100%', marginBottom: 9 }} onClick={addTextLayer} disabled={!image}><Type size={14} /> Add text layer</button>
            <div className="pro-chip-row"><button className="pro-chip" onClick={() => addShapeLayer('rect')} disabled={!image}><Square size={12} /> Rectangle</button><button className="pro-chip" onClick={() => addShapeLayer('circle')} disabled={!image}><Circle size={12} /> Ellipse</button><button className="pro-chip" onClick={() => addShapeLayer('line')} disabled={!image}>Line</button></div>
          </>}

          {panel === 'ai' && <><div className="pro-section-title"><span>AI image studio</span><Sparkles size={14}/></div><div className="pro-panel-note">Describe the change in plain language. Only when you request an AI edit, a resized copy of your image is sent to the configured AI provider. Your original file stays on your device.</div><label className="pro-field">Describe your edit<textarea rows={5} value={aiPrompt} onChange={event => setAiPrompt(event.target.value)} placeholder="Replace the background with a soft studio gradient while keeping the subject unchanged." disabled={!image || aiWorking}/></label><div className="pro-chip-row">{["Remove background","Studio lighting","Cinematic colour","Clean up image"].map(prompt => <button className="pro-chip" key={prompt} onClick={() => setAiPrompt(prompt)} disabled={!image || aiWorking}>{prompt}</button>)}</div><button className="pro-btn pro-primary" style={{width:"100%",marginTop:14}} onClick={runAIEdit} disabled={!image || aiWorking}>{aiWorking ? "AI is working…" : <><WandSparkles size={14}/> Generate edited image</>}</button><p className="pro-muted" style={{marginTop:12}}>Requires <code>OPENAI_API_KEY</code> in Vercel Environment Variables. API usage may incur charges.</p></>}
          {panel === 'adjust' && <>
            <div className="pro-section-title">Colour & light <Sparkles size={14} /></div>
            <div className="pro-panel-note">Adjustments are rendered live and applied to the exported image. Your source file is never overwritten.</div>
            {[['brightness','Brightness',0,200,1,100],['contrast','Contrast',0,200,1,100],['saturation','Saturation',0,200,1,100],['warmth','Temperature',-100,100,1,0],['blur','Soft blur',0,12,.5,0],['grayscale','Grayscale',0,100,1,0],['sepia','Sepia',0,100,1,0]].map(([key,label,min,max,step,base]) => <label className="pro-field" key={key}><span className="pro-field-row"><span>{label}</span><span className="pro-value">{adjust[key]}{key === 'warmth' ? '' : '%'}</span></span><input type="range" min={min} max={max} step={step} value={adjust[key]} onChange={(event) => changeAdjust(key, event.target.value)} disabled={!image} /></label>)}
            <button className="pro-btn" style={{ width: '100%' }} onClick={() => { commitHistory(); setAdjust(INITIAL_ADJUST); }}>Reset adjustments</button>
          </>}

          {panel === 'properties' && <>
            <div className="pro-section-title">Tool properties <Settings2 size={14} /></div>
            <div className="pro-panel-note">{TOOLSET.find((item) => item.id === tool)?.label || 'Move'} is active. Choose a tool from the left toolbar and edit its properties here.</div>
            {tool === 'crop' ? <>
              <div className="pro-section-title">Crop area (%)</div>
              {[['x','Left',0,80],['y','Top',0,80],['w','Width',10,100],['h','Height',10,100]].map(([key,label,min,max]) => <label className="pro-field" key={key}><span className="pro-field-row"><span>{label}</span><span className="pro-value">{crop[key]}%</span></span><input type="range" min={min} max={max} value={crop[key]} onChange={(event) => { commitHistory(); setCrop((old) => ({ ...old, [key]: Number(event.target.value) })); }} disabled={!image} /></label>)}
              <button className="pro-btn pro-primary" style={{ width: '100%' }} onClick={() => { commitHistory(); setTool('move'); setNotice('Crop applied to the working document.'); }} disabled={!image}><Crop size={14} /> Apply crop</button>
              <button className="pro-btn" style={{ width: '100%', marginTop: 8 }} onClick={() => { commitHistory(); setCrop({ x: 0, y: 0, w: 100, h: 100 }); }}>Reset crop</button>
            </> : <>
              <label className="pro-field">Paint / shape colour<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
              <label className="pro-field"><span className="pro-field-row"><span>Brush / effect size</span><span className="pro-value">{brushSize}px</span></span><input type="range" min="2" max="80" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
              <label className="pro-field"><span className="pro-field-row"><span>Layer opacity</span><span className="pro-value">{opacity}%</span></span><input type="range" min="5" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
              {activeLayer && !activeLayer.locked && <>
                <div className="pro-divider-line" /><div className="pro-section-title">Selected layer</div>
                <label className="pro-field">Layer name<input value={activeLayer.name} onChange={(event) => setLayers((items) => items.map((layer) => layer.id === selected ? { ...layer, name: event.target.value } : layer))} /></label>
                {activeLayer.type === 'text' && <><label className="pro-field">Text<input value={activeLayer.text} onChange={(event) => setLayers((items) => items.map((layer) => layer.id === selected ? { ...layer, text: event.target.value, name: event.target.value || 'Text layer' } : layer))} /></label><label className="pro-field">Font size<input type="range" min="12" max="120" value={activeLayer.size || 38} onChange={(event) => patchSelected({ size: Number(event.target.value) })} /></label></>}
                <label className="pro-field">Layer opacity<input type="range" min="0" max="100" value={activeLayer.opacity == null ? 100 : activeLayer.opacity} onChange={(event) => patchSelected({ opacity: Number(event.target.value) })} /></label>
                <button className="pro-btn" style={{ width: '100%' }} onClick={removeSelected}><X size={14} /> Delete selected layer</button>
              </>}
              <div className="pro-divider-line" />
              <div className="pro-section-title">Quick actions</div>
              <div className="pro-chip-row"><button className={'pro-chip' + (tool === 'brush' ? ' active' : '')} onClick={() => setTool('brush')}><Paintbrush size={12} /> Brush</button><button className={'pro-chip' + (tool === 'text' ? ' active' : '')} onClick={() => setTool('text')}><Type size={12} /> Text</button><button className={'pro-chip' + (tool === 'crop' ? ' active' : '')} onClick={() => setTool('crop')}><Crop size={12} /> Crop</button></div>
            </>}
          </>}

          <div className="pro-divider-line" />
          <div className="pro-section-title">Export settings <Download size={14} /></div>
          <label className="pro-field">File name<input value={filename} onChange={(event) => setFilename(event.target.value)} /></label>
          <label className="pro-field">Format<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}><option value="image/png">PNG · Lossless</option><option value="image/jpeg">JPEG · Smaller file</option><option value="image/webp">WebP · Modern</option></select></label>
          {exportFormat !== 'image/png' && <label className="pro-field"><span className="pro-field-row"><span>Quality</span><span className="pro-value">{quality}%</span></span><input type="range" min="30" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>}
          <button className="pro-btn pro-primary" style={{ width: '100%' }} onClick={exportImage} disabled={!image || busy}><Download size={14} /> Export image</button>
          <p className="pro-muted" style={{ marginTop: 12 }}>Standard edits run in your browser. AI edits send a resized copy to the configured provider only when requested.</p>
        </div>
      </aside>
    </div>}
    <footer className="pro-footer"><span><strong>FreeImage</strong> · Useful software. Without the nonsense.</span><span>FREE FOREVER · NO ADS · NO PAYWALLS</span><span>© 2026 FreeToolz</span></footer>
    {notice && <div className="pro-notice"><Check size={15} /> <span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button></div>}
  </div>;
}
