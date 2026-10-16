import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Blend, Check, ChevronDown, Circle, Crop, Download, Eraser, FileImage, FileText, Frame, Gauge, Image as ImageIcon, LockKeyhole, Maximize2, Menu, MousePointer2, MoveUpRight, Paintbrush, Plus, RotateCcw, ScanFace, ShieldCheck, Sparkles, Upload, WandSparkles, X, Zap } from 'lucide-react';
import { jsPDF } from 'jspdf';

const groups = [
  { title: 'Everyday edits', tools: [
    ['resize','Resize image','Change dimensions without leaving your browser',Maximize2],
    ['crop','Crop image','Trim to the area you actually need',Crop],
    ['compress','Compress image','Reduce file size for faster sharing',Gauge],
    ['convert','Convert format','JPG, PNG and WebP in one place',FileImage],
    ['remove-metadata','Remove EXIF metadata','Re-export a clean copy without embedded metadata',ShieldCheck],
    ['rounded','Rounded corners','Give images a smooth, modern edge',Frame],
    ['borders','Add borders','Frame your image with a custom border',Plus],
    ['image-pdf','Image to PDF','Turn an image into a downloadable PDF',FileText],
  ]},
  { title: 'Privacy & pixel tools', tools: [
    ['blur','Blur an area','Soften sensitive details with a brush-sized blur',Blend],
    ['pixelate','Pixelate an area','Mosaic a region before sharing',ScanFace],
    ['highlight','Highlight area','Draw attention to a part of the image',Sparkles],
    ['screenshot','Screenshot cleanup','Tidy up screenshots with contrast and brightness',WandSparkles],
  ]},
  { title: 'Image toolkit', tools: [
    ['arrow','Arrow marker','Point to something important',MoveUpRight],
    ['rectangle','Rectangle marker','Outline a region in your screenshot',Frame],
    ['circle','Circle marker','Circle a detail that matters',Circle],
    ['text','Add text','Label an image with a short note',FileText],
    ['number','Number markers','Add numbered steps to a walkthrough',BadgeCheck],
    ['background','Remove solid background','Make a simple, edge-connected solid background transparent',Eraser],
    ['sharpen','Sharpen image','Boost perceived detail with a local filter',Zap],
    ['upscale','Upscale 2×','Enlarge with high-quality browser resampling',Maximize2],
  ]},
];
const allTools = groups.flatMap(g=>g.tools);
const defaults = { width: 1200, height: 800, quality: 82, cropX: 0, cropY: 0, cropW: 100, cropH: 100, radius: 36, border: 12, blur: 18, pixel: 14, brightness: 100, contrast: 110, format: 'image/webp', color: '#42e6a4', text: 'Your text', maxSize: 1600 };
const fmt = (type) => type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
const prettyBytes = n => n < 1024 ? n+' B' : n < 1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(2)+' MB';

export default function App() {
  const [file,setFile] = useState(null);
  const [source,setSource] = useState(null);
  const [active,setActive] = useState('resize');
  const [settings,setSettings] = useState(defaults);
  const [output,setOutput] = useState(null);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [installPrompt,setInstallPrompt] = useState(null);
  const [installHelp,setInstallHelp] = useState(false);
  const [isInstalled,setIsInstalled] = useState(false);
  const [mobileMenu,setMobileMenu] = useState(false);
  const [markups,setMarkups] = useState([]);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const fileRef = useRef(null);
  const [dragging,setDragging] = useState(false);
  const tool = allTools.find(t=>t[0]===active) || allTools[0];
  const isEdit = ['blur','pixelate','highlight','arrow','rectangle','circle','text','number'].includes(active);
  const hasFile = Boolean(source);

  useEffect(()=>{
    const before = e => { e.preventDefault(); setInstallPrompt(e); };
    const installed = () => { setIsInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt',before);
    window.addEventListener('appinstalled',installed);
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    return ()=> { window.removeEventListener('beforeinstallprompt',before); window.removeEventListener('appinstalled',installed); };
  },[]);
  useEffect(()=>{ document.title = active ? tool[1]+' — FreeImage' : 'FreeImage — Your images. Your device.'; },[active,tool]);
  useEffect(()=>{ if(source) drawPreview(source); },[source,markups,settings,active]);

  function drawPreview(img) {
    const canvas=canvasRef.current; if(!canvas || !img) return;
    const ctx=canvas.getContext('2d');
    const scale=Math.min(1,920/img.width,620/img.height);
    canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    markups.forEach(m=>{
      const x=m.x*canvas.width,y=m.y*canvas.height,w=m.w*canvas.width,h=m.h*canvas.height;
      ctx.strokeStyle=m.color||settings.color; ctx.fillStyle=m.color||settings.color; ctx.lineWidth=3;
      if(m.type==='rectangle') ctx.strokeRect(x,y,w,h);
      if(m.type==='circle'){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,Math.abs(w/2),Math.abs(h/2),0,0,Math.PI*2);ctx.stroke();}
      if(m.type==='arrow'){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);ctx.stroke();ctx.beginPath();ctx.moveTo(x+w,y+h);ctx.lineTo(x+w-10,y+h-2);ctx.lineTo(x+w-2,y+h-10);ctx.closePath();ctx.fill();}
      if(m.type==='text'||m.type==='number'){ctx.font='bold 22px Inter, sans-serif';ctx.fillText(m.text||'1',x,y);}
      if(m.type==='highlight'){ctx.globalAlpha=.28;ctx.fillRect(x,y,w,h);ctx.globalAlpha=1;}
    });
  }
  function loadFile(f) {
    if(!f) return;
    if(!f.type.startsWith('image/')) { setNotice('Choose an image file such as JPG, PNG, WebP or GIF.'); return; }
    if(f.size>40*1024*1024){setNotice('For smooth local editing, choose an image smaller than 40 MB.');return;}
    const url=URL.createObjectURL(f), img=new Image();
    img.onload=()=>{setFile(f);setSource(img);setOutput(null);setMarkups([]);setNotice('');URL.revokeObjectURL(url);};
    img.onerror=()=>{setNotice('This image could not be opened by your browser. Try a JPG, PNG or WebP file.');URL.revokeObjectURL(url);};
    img.src=url;
  }
  function update(key,value){setSettings(s=>({...s,[key]:value}));}
  function addMarkup() {
    const type=active;
    setMarkups(m=>[...m,{type,x:.18+(m.length%4)*.08,y:.2+(m.length%3)*.1,w:.35,h:.24,color:settings.color,text:type==='number'?String(m.length+1):settings.text}]);
    setNotice('Marker added to the preview. Download to bake it into your image.');
  }
  function getCanvas() {
    if(!source) throw new Error('Upload an image first.');
    const c=document.createElement('canvas'),ctx=c.getContext('2d');
    let sx=0,sy=0,sw=source.naturalWidth,sh=source.naturalHeight;
    if(active==='crop'){sx=Math.round(sw*settings.cropX/100);sy=Math.round(sh*settings.cropY/100);sw=Math.max(1,Math.round(sw*settings.cropW/100));sh=Math.max(1,Math.round(sh*settings.cropH/100));sw=Math.min(sw,source.naturalWidth-sx);sh=Math.min(sh,source.naturalHeight-sy);}
    let w=sw,h=sh;
    if(active==='resize'){w=Math.max(1,Math.round(+settings.width||sw));h=Math.max(1,Math.round(+settings.height||sh));}
    if(active==='upscale'){w=Math.min(12000,sw*2);h=Math.min(12000,sh*2);}
    c.width=w;c.height=h;
    if(active==='rounded'||active==='background'){
      ctx.clearRect(0,0,w,h);ctx.save();const r=active==='background'?0:Math.min(+settings.radius||0,w/2,h/2);
      ctx.beginPath();ctx.moveTo(r,0);ctx.arcTo(w,0,w,h,r);ctx.arcTo(w,h,0,h,r);ctx.arcTo(0,h,0,0,r);ctx.arcTo(0,0,w,0,r);ctx.closePath();ctx.clip();
    }
    if(active==='screenshot') ctx.filter='brightness('+settings.brightness+'%) contrast('+settings.contrast+'%)';
    if(active==='blur') ctx.filter='blur(1px)';
    if(active==='sharpen') ctx.filter='contrast(118%) saturate(108%)';
    ctx.drawImage(source,sx,sy,sw,sh,0,0,w,h);
    ctx.filter='none';
    if(active==='background'){
      const imageData=ctx.getImageData(0,0,w,h), data=imageData.data;
      const seed=[data[0],data[1],data[2]], tolerance=58;
      const visited=new Uint8Array(w*h), stack=[];
      for(let x=0;x<w;x++){stack.push(x);stack.push((h-1)*w+x);}
      for(let y=1;y<h-1;y++){stack.push(y*w);stack.push(y*w+w-1);}
      while(stack.length){
        const p=stack.pop(); if(p<0||p>=w*h||visited[p])continue; visited[p]=1;
        const i=p*4, dr=data[i]-seed[0], dg=data[i+1]-seed[1], db=data[i+2]-seed[2];
        if(Math.sqrt(dr*dr+dg*dg+db*db)>tolerance)continue;
        data[i+3]=0;
        const x=p%w,y=(p/w)|0;
        if(x>0)stack.push(p-1);if(x<w-1)stack.push(p+1);if(y>0)stack.push(p-w);if(y<h-1)stack.push(p+w);
      }
      ctx.putImageData(imageData,0,0);
    }
    if(active==='rounded'||active==='background') ctx.restore();
    if(active==='borders'){const b=Math.max(0,+settings.border||0);const out=document.createElement('canvas');out.width=w+b*2;out.height=h+b*2;const o=out.getContext('2d');o.fillStyle=settings.color;o.fillRect(0,0,out.width,out.height);o.drawImage(c,b,b);return out;}
    if(active==='pixelate'||active==='blur'){
      const area={x:Math.round(w*.2),y:Math.round(h*.2),w:Math.round(w*.6),h:Math.round(h*.35)};
      if(active==='pixelate'){const tiny=document.createElement('canvas');tiny.width=Math.max(1,Math.round(area.w/settings.pixel));tiny.height=Math.max(1,Math.round(area.h/settings.pixel));tiny.getContext('2d').drawImage(c,area.x,area.y,area.w,area.h,0,0,tiny.width,tiny.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(tiny,0,0,tiny.width,tiny.height,area.x,area.y,area.w,area.h);ctx.imageSmoothingEnabled=true;}
      else {const patch=document.createElement('canvas');patch.width=area.w;patch.height=area.h;patch.getContext('2d').filter='blur('+settings.blur+'px)';patch.getContext('2d').drawImage(c,area.x,area.y,area.w,area.h,0,0,area.w,area.h);ctx.drawImage(patch,area.x,area.y);}
    }
    if(markups.length){markups.forEach(m=>{const x=m.x*w,y=m.y*h,mw=m.w*w,mh=m.h*h;ctx.strokeStyle=m.color;ctx.fillStyle=m.color;ctx.lineWidth=Math.max(3,w/300);if(m.type==='rectangle')ctx.strokeRect(x,y,mw,mh);if(m.type==='circle'){ctx.beginPath();ctx.ellipse(x+mw/2,y+mh/2,mw/2,mh/2,0,0,Math.PI*2);ctx.stroke();}if(m.type==='highlight'){ctx.globalAlpha=.25;ctx.fillRect(x,y,mw,mh);ctx.globalAlpha=1;}if(m.type==='arrow'){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+mw,y+mh);ctx.stroke();ctx.beginPath();ctx.moveTo(x+mw,y+mh);ctx.lineTo(x+mw-12,y+mh-3);ctx.lineTo(x+mw-3,y+mh-12);ctx.closePath();ctx.fill();}if(m.type==='text'||m.type==='number'){ctx.font='bold '+Math.max(20,w/35)+'px sans-serif';ctx.fillText(m.text,x,y);}});}
    return c;
  }
  async function process() {
    if(!source){setNotice('Upload an image first to start editing.');return;}
    if(isEdit){addMarkup();return;}
    setBusy(true);setNotice('');
    try {
      const c=getCanvas();
      if(active==='image-pdf'){
        const pdf=new jsPDF({orientation:c.width>c.height?'landscape':'portrait',unit:'px',format:[c.width,c.height]});
        pdf.addImage(c.toDataURL('image/jpeg',.94),'JPEG',0,0,c.width,c.height);
        const blob=pdf.output('blob');setOutput({url:URL.createObjectURL(blob),name:(file?.name||'image').replace(/\.[^.]+$/,'')+'.pdf',size:blob.size});setNotice('PDF ready to download.');return;
      }
      const type=active==='convert'||active==='compress' ? settings.format : (active==='remove-metadata' ? 'image/jpeg' : 'image/png');
      const quality=(+settings.quality||82)/100;
      c.toBlob(blob=>{
        if(!blob){setNotice('This format could not be exported by your browser. Try PNG or WebP.');setBusy(false);return;}
        const extension=fmt(type);
        const base=(file?.name||'image').replace(/\.[^.]+$/,'');
        const url=URL.createObjectURL(blob);setOutput({url,name:base+'-freeimage.'+extension,size:blob.size});setNotice(active==='remove-metadata'?'Clean copy created. Canvas export strips embedded EXIF metadata.':'Your edited image is ready.');setBusy(false);
      },type,quality);
    } catch(e){setNotice(e?.message||'Could not process this image. Try another file or setting.');setBusy(false);}
  }
  function downloadOutput(){if(!output)return;const a=document.createElement('a');a.href=output.url;a.download=output.name;a.click();}
  function reset(){setFile(null);setSource(null);setOutput(null);setMarkups([]);setNotice('');if(fileRef.current)fileRef.current.value='';}
  const dimensions=source?source.naturalWidth+' × '+source.naturalHeight:'No image loaded';
  const selectedToolTitle=tool[1];
  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="navbar">
      <a className="brand" href="/" onClick={e=>{e.preventDefault();setActive('resize');reset();window.scrollTo({top:0,behavior:'smooth'});}}><span className="brand-mark"><ImageIcon size={21}/></span><span>Free<span className="brand-accent">Image</span><small>THE PRIVATE IMAGE TOOLKIT</small></span></a>
      <nav className={mobileMenu?'nav-links nav-open':'nav-links'}><a href="#tools" onClick={()=>setMobileMenu(false)}>Tools</a><a href="#privacy" onClick={()=>setMobileMenu(false)}>Privacy</a><a href="#toolkit" onClick={()=>setMobileMenu(false)}>Image toolkit</a></nav>
      <div className="nav-actions">
        <button className="install-button" onClick={()=>{if(installPrompt){installPrompt.prompt();installPrompt.userChoice.then(()=>setInstallPrompt(null));}else setInstallHelp(v=>!v);}}>{isInstalled?<Check size={16}/>:<ArrowDownToLine size={16}/>} {isInstalled?'Installed':'Install app'}</button>
        {installHelp&&<div className="install-popover"><b>Install FreeImage</b><p>In Chrome or Edge, use the install icon in the address bar or browser menu. On iPhone/iPad, open in Safari → Share → Add to Home Screen.</p><button onClick={()=>setInstallHelp(false)}>Got it</button></div>}
        <button className="mobile-menu" aria-label="Toggle navigation" onClick={()=>setMobileMenu(v=>!v)}><Menu/></button>
      </div>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> FREE TOOLS. PRIVATE BY DESIGN.</div>
          <h1>Your images.<br/><span>Your device.</span></h1>
          <p className="hero-lede">A powerful image toolkit for everyday edits, screenshot markups and privacy cleanup — without subscriptions, uploads or nonsense.</p>
          <div className="hero-actions"><button className="primary-button" onClick={()=>fileRef.current?.click()}><Upload size={18}/> Choose an image <ArrowRight size={17}/></button><a className="text-link" href="#tools">Explore all tools <ArrowDownToLine size={16}/></a></div>
          <div className="trust-row"><span><ShieldCheck size={17}/> Local processing</span><span><LockKeyhole size={17}/> No account</span><span><Zap size={17}/> Free to use</span></div>
        </div>
        <div className="hero-art" aria-label="Decorative image editing preview"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="art-card art-back"><div className="mini-top"><span/><span/><span/></div><div className="mini-image"><div className="sun"/><div className="mountain mountain-a"/><div className="mountain mountain-b"/><div className="lake"/></div></div><div className="art-card art-front"><div className="art-chip"><Sparkles size={14}/> IMAGE, REIMAGINED</div><div className="art-preview"><div className="preview-sun"/><div className="preview-land"/></div><div className="art-meta"><span><b>Clean edits</b><small>Right in your browser</small></span><span className="art-check"><Check size={16}/></span></div></div><div className="floating-tag tag-private"><ShieldCheck size={15}/> Stays on device</div><div className="floating-tag tag-format">PNG <span>↔</span> WEBP</div></div>
      </section>
      <section className="privacy-banner" id="privacy"><div className="privacy-icon"><LockKeyhole size={23}/></div><div><h3>Your image never leaves your device.</h3><p>Editing happens locally in your browser. FreeImage does not upload your images to a processing server.</p></div><span className="privacy-status"><span/> LOCAL-FIRST</span></section>
      <section className="tools-section" id="tools"><div className="section-heading"><div><div className="eyebrow">YOUR CREATIVE TOOLBOX</div><h2>Small edits. <span>Big relief.</span></h2><p>Pick a tool, drop in an image, and make it yours.</p></div><div className="tool-count"><b>20+</b><span>browser tools</span></div></div>
        <div className="tool-groups">{groups.map((group,gi)=><div className="tool-group" key={group.title}><div className="group-title"><span className="group-index">0{gi+1}</span><h3>{group.title}</h3><span className="group-line"/></div><div className="tool-grid">{group.tools.map(([id,title,desc,Icon])=><button className={'tool-card '+(active===id?'tool-active':'')} key={id} onClick={()=>{setActive(id);setNotice('');document.getElementById('editor')?.scrollIntoView({behavior:'smooth',block:'start'});}}><span className="tool-icon"><Icon size={20}/></span><span className="tool-copy"><b>{title}</b><small>{desc}</small></span><ArrowUpRight className="tool-arrow" size={17}/></button>)}</div></div>)}</div>
      </section>
      <section className="editor-section" id="editor"><div className="editor-heading"><div><div className="eyebrow">THE WORKSPACE</div><h2>{selectedToolTitle}</h2><p>Make a change and export a fresh copy. Your original stays untouched.</p></div><button className="subtle-button" onClick={reset}><RotateCcw size={15}/> Clear image</button></div>
        <div className="workspace">
          <div className="upload-panel">
            <div className="panel-label"><span>01</span> SOURCE IMAGE</div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e=>loadFile(e.target.files?.[0])}/>
            {!hasFile?<div className={'dropzone '+(dragging?'drop-active':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);loadFile(e.dataTransfer.files?.[0]);}} onClick={()=>fileRef.current?.click()}><div className="upload-orb"><Upload size={25}/></div><b>Drop your image here</b><p>or click to browse your device</p><span className="file-types">JPG · PNG · WEBP · GIF · up to 40 MB</span></div>:<div className="file-loaded"><div className="file-thumb"><img src={source.src} alt="Uploaded preview"/></div><div className="file-details"><b>{file.name}</b><span>{dimensions}</span><span>{prettyBytes(file.size)}</span><div className="local-pill"><Check size={12}/> On this device</div></div><button className="icon-button" onClick={reset} aria-label="Remove image"><X size={17}/></button><button className="change-file" onClick={()=>fileRef.current?.click()}>Change image</button></div>}
            <div className="privacy-note"><ShieldCheck size={16}/><span><b>Private by design</b><small>Nothing is uploaded to a server.</small></span></div>
          </div>
          <div className="settings-panel"><div className="panel-label"><span>02</span> TOOL SETTINGS</div>
            {!hasFile&&<div className="settings-empty"><div><MousePointer2 size={21}/></div><b>Ready when you are</b><p>Choose an image to unlock the workspace controls.</p></div>}
            {hasFile&&<div className="settings-content">
              {active==='resize'&&<><Field label="Width (px)"><input type="number" min="1" max="12000" value={settings.width} onChange={e=>update('width',e.target.value)}/></Field><Field label="Height (px)"><input type="number" min="1" max="12000" value={settings.height} onChange={e=>update('height',e.target.value)}/></Field><button className="quick-button" onClick={()=>{update('width',source.naturalWidth);update('height',source.naturalHeight);}}>Use original dimensions</button></>}
              {active==='crop'&&<><Field label="Left offset (%)"><input type="number" min="0" max="95" value={settings.cropX} onChange={e=>update('cropX',+e.target.value)}/></Field><Field label="Top offset (%)"><input type="number" min="0" max="95" value={settings.cropY} onChange={e=>update('cropY',+e.target.value)}/></Field><Field label="Crop width (%)"><input type="number" min="5" max="100" value={settings.cropW} onChange={e=>update('cropW',+e.target.value)}/></Field><Field label="Crop height (%)"><input type="number" min="5" max="100" value={settings.cropH} onChange={e=>update('cropH',+e.target.value)}/></Field></>}
              {(active==='compress'||active==='convert')&&<><Field label="Output format"><select value={settings.format} onChange={e=>update('format',e.target.value)}><option value="image/webp">WebP — compact</option><option value="image/jpeg">JPG — compatible</option><option value="image/png">PNG — lossless</option></select></Field><Field label={'Quality · '+settings.quality+'%'}><input type="range" min="20" max="100" value={settings.quality} onChange={e=>update('quality',+e.target.value)}/></Field><p className="field-hint">Quality applies to JPG and WebP. PNG export is lossless.</p></>}
              {active==='rounded'&&<Field label={'Corner radius · '+settings.radius+' px'}><input type="range" min="0" max="180" value={settings.radius} onChange={e=>update('radius',+e.target.value)}/></Field>}
              {active==='borders'&&<><Field label={'Border width · '+settings.border+' px'}><input type="range" min="1" max="100" value={settings.border} onChange={e=>update('border',+e.target.value)}/></Field><Field label="Border color"><input type="color" value={settings.color} onChange={e=>update('color',e.target.value)}/></Field></>}
              {active==='blur'&&<Field label={'Blur strength · '+settings.blur+' px'}><input type="range" min="4" max="42" value={settings.blur} onChange={e=>update('blur',+e.target.value)}/></Field>}
              {active==='pixelate'&&<Field label={'Pixel size · '+settings.pixel+' px'}><input type="range" min="4" max="40" value={settings.pixel} onChange={e=>update('pixel',+e.target.value)}/></Field>}
              {active==='screenshot'&&<><Field label={'Brightness · '+settings.brightness+'%'}><input type="range" min="60" max="150" value={settings.brightness} onChange={e=>update('brightness',+e.target.value)}/></Field><Field label={'Contrast · '+settings.contrast+'%'}><input type="range" min="60" max="180" value={settings.contrast} onChange={e=>update('contrast',+e.target.value)}/></Field></>}
              {isEdit&&<><div className="edit-instructions"><Paintbrush size={17}/><span>Use the add button to place a {active} marker on the image preview. You can add multiple markers.</span></div>{['text','number'].includes(active)&&<Field label={active==='number'?'Marker label':'Text label'}><input value={settings.text} onChange={e=>update('text',e.target.value)} /></Field>}<Field label="Marker color"><input type="color" value={settings.color} onChange={e=>update('color',e.target.value)}/></Field><button className="quick-button" onClick={()=>setMarkups([])}>Clear all markers</button></>}
              {['upscale','sharpen','remove-metadata','image-pdf','background'].includes(active)&&<div className="tool-explainer"><Sparkles size={18}/><span>{active==='upscale'?'Doubles the pixel dimensions using browser resampling; this is not generative AI upscaling.':active==='sharpen'?'Applies a local contrast enhancement to make edges appear crisper.':active==='remove-metadata'?'Re-encodes the image through canvas, removing EXIF and other embedded metadata.':active==='image-pdf'?'Creates a single-page PDF sized to your image.': 'Makes a similarly coloured background connected to the image edges transparent. Best for plain, solid backgrounds; inspect the result before downloading.'}</span></div>}
              <button className="process-button" disabled={busy} onClick={process}>{busy?<span className="spinner"/>:isEdit?<Plus size={18}/>:<WandSparkles size={18}/>} {busy?'Processing…':isEdit?'Add marker to preview':'Process image'} <ArrowRight size={17}/></button>
            </div>}
          </div>
        </div>
        {notice&&<div className="notice"><span><Check size={16}/></span>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss message"><X size={15}/></button></div>}
        <div className="preview-panel"><div className="preview-heading"><div><div className="panel-label"><span>03</span> LIVE PREVIEW</div><b>{hasFile?'Your working image':'Your canvas will appear here'}</b></div>{hasFile&&<span className="preview-dimensions">{dimensions}</span>}</div><div className="preview-canvas">{hasFile?<canvas ref={canvasRef}/>:<div className="preview-placeholder"><ImageIcon size={35}/><b>A little creative space</b><span>Upload an image to see your preview here.</span></div>}</div>
          {output&&<div className="output-row"><div className="output-icon"><FileImage size={20}/></div><div className="output-meta"><b>{output.name}</b><span>{prettyBytes(output.size)} · Ready to save</span></div><button className="download-button" onClick={downloadOutput}><Download size={17}/> Download</button></div>}
        </div>
      </section>
      <section className="toolkit-section" id="toolkit"><div className="toolkit-card"><div className="toolkit-copy"><div className="eyebrow">THE SCREENSHOT TOOLKIT</div><h2>Share the point.<br/><span>Not the private bits.</span></h2><p>Mark up screenshots with arrows, shapes, highlights, text and numbered steps. For automatic detection of emails, phone numbers, API keys, passwords, addresses and card-like numbers, review every match before sharing.</p><div className="toolkit-tags"><span><Check size={13}/> Mark up</span><span><Check size={13}/> Redact carefully</span><span><Check size={13}/> Download clean</span></div><button className="primary-button" onClick={()=>{setActive('blur');document.getElementById('editor')?.scrollIntoView({behavior:'smooth'});}}>Open image toolkit <ArrowRight size={16}/></button></div><div className="redaction-mock"><div className="mock-window"><div className="mock-bar"><span/><span/><span/><small>Screenshot.png</small></div><div className="mock-doc"><div className="mock-avatar">AK</div><div className="mock-line line-long"/><div className="mock-line line-short"/><div className="mock-data"><span>EMAIL</span><b>aarav@example.com</b><div className="redact-bar"/></div><div className="mock-data"><span>API KEY</span><b>sk_live_••••••••••</b><div className="redact-bar redacted-short"/></div><div className="mock-verified"><ShieldCheck size={15}/> Redaction preview</div></div></div><div className="mock-stamp"><ShieldCheck size={18}/><span><b>Review before sharing</b><small>Nothing sent to a server</small></span></div></div></div></section>
    </main>
    <footer className="footer"><div className="footer-main"><div className="footer-brand"><a className="brand" href="/"><span className="brand-mark"><ImageIcon size={20}/></span><span>Free<span className="brand-accent">Image</span><small>THE PRIVATE IMAGE TOOLKIT</small></span></a><p>Useful software. Without the nonsense.</p><span className="building"><span/> Building useful things</span></div><div className="footer-column"><b>Explore</b><a href="#tools">All image tools</a><a href="#toolkit">Screenshot toolkit</a><a href="#privacy">Privacy promise</a></div><div className="footer-column"><b>FreeToolz</b><a href="https://free-pdf-delta.vercel.app/" target="_blank" rel="noreferrer">FreePDF ↗</a><a href="https://github.com/avada-kedavra62442/FreeImage" target="_blank" rel="noreferrer">GitHub repository ↗</a><a href="mailto:aarav.krish62442@gmail.com">Feedback / email ↗</a></div><div className="footer-social"><a href="https://github.com/avada-kedavra62442/" aria-label="GitHub" target="_blank" rel="noreferrer">GH</a><a href="mailto:aarav.krish62442@gmail.com" aria-label="Email">@</a><a href="https://www.linkedin.com/in/aarav-krish-665702440/" aria-label="LinkedIn" target="_blank" rel="noreferrer">in</a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} FreeImage. Made to be useful.</span><span><LockKeyhole size={13}/> Your files stay yours.</span></div></footer>
  </div>;
}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>;}
