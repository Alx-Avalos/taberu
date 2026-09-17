const { useState, useMemo, useEffect, useRef, createElement: h } = React;
const STORAGE_KEY = "japan-guide-data-v3";
const genId = () => "id-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);
function ensureIds(data) {
  if (!data.categories) data.categories = JSON.parse(JSON.stringify(CATS));
  data.cities.forEach(c => { if (!c.id) c.id = genId(); c.items.forEach(it => { if (!it.id) it.id = genId(); }); });
  data.general.items.forEach(it => { if (!it.id) it.id = genId(); });
  return data;
}



function resizeImageFile(file, maxW, quality) {
  maxW = maxW || 900; quality = quality || 0.82;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width*scale), hgt = Math.round(img.height*scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = hgt;
        canvas.getContext("2d").drawImage(img, 0, 0, w, hgt);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
function fileFromDrop(e) {
  const dt = e.dataTransfer;
  if (!dt || !dt.files || !dt.files.length) return null;
  const f = dt.files[0];
  return f && f.type && f.type.indexOf("image")===0 ? f : null;
}
function useImageDrag(posY, onPos) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef({ y:0, p:0, h:1 });
  const boxRef = useRef(null);
  function onPointerDown(e) {
    const r = boxRef.current.getBoundingClientRect();
    ref.current = { y:e.clientY, p:posY, h:r.height||1 };
    setDragging(true);
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const d = ((e.clientY - ref.current.y)/ref.current.h)*100;
    let n = ref.current.p - d; n = Math.max(0, Math.min(100, n));
    onPos(Math.round(n));
  }
  function onPointerUp() { setDragging(false); }
  return { dragging, boxRef, onPointerDown, onPointerMove, onPointerUp };
}

function Editable({ tag, className, value, onSave, placeholder }) {
  return h(tag, {
    className:(className||"")+" editable", contentEditable:true, suppressContentEditableWarning:true,
    onClick:(e)=>e.stopPropagation(),
    onBlur:(e)=>{ const v=e.target.innerText.trim(); if (v!==value) onSave(v); },
    "data-placeholder":placeholder||"",
  }, value);
}

// Cover used on item detail + city header. maxW high for sharpness.
function Cover({ img, posY, onSetImg, onSetPos }) {
  const py = posY!=null ? posY : 50;
  const drag = useImageDrag(py, onSetPos);
  const [over, setOver] = useState(false);
  function set(file){ if(file) resizeImageFile(file,1600,0.85).then(onSetImg); }
  function onDrop(e){ e.preventDefault(); e.stopPropagation(); setOver(false); set(fileFromDrop(e)); }
  if (!img) {
    return h("div", { className:"cover-empty" },
      h("label", { className:"cover-empty-inner"+(over?" dragover":""),
        onDragOver:(e)=>{e.preventDefault();setOver(true);}, onDragLeave:()=>setOver(false), onDrop },
        "Drop a photo here, or click to add a cover",
        h("input", { type:"file", accept:"image/*", onChange:(e)=>set(e.target.files&&e.target.files[0]) })
      )
    );
  }
  return h("div", {
      className:"cover"+(drag.dragging?" dragging":""), ref:drag.boxRef,
      style:{ backgroundImage:'url("'+img+'")', backgroundPosition:"center "+py+"%" },
      onPointerDown:drag.onPointerDown, onPointerMove:drag.onPointerMove, onPointerUp:drag.onPointerUp, onPointerLeave:drag.onPointerUp,
      onDragOver:(e)=>{e.preventDefault();setOver(true);}, onDragLeave:()=>setOver(false), onDrop },
    h("div", { className:"cover-controls" },
      h("label", { className:"cover-btn", onPointerDown:(e)=>e.stopPropagation() },
        "Change photo",
        h("input", { type:"file", accept:"image/*", onChange:(e)=>set(e.target.files&&e.target.files[0]) })
      )
    ),
    h("div", { className:"cover-hint" }, drag.dragging ? "Drop to set position" : "Drag to reposition · drop a new photo to replace")
  );
}

function RichNotes({ item, onUpdate }) {
  const hostRef = useRef(null);
  const quillRef = useRef(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!hostRef.current || quillRef.current) return;
    const q = new window.Quill(hostRef.current, {
      theme:"bubble", placeholder:"Write anything here. Drop a photo in anytime.",
      modules:{ toolbar:["bold","italic","underline","link"] },
    });
    const seed = item.body!=null ? item.body
      : ((item.note?"<p>"+item.note+"</p>":"")+(item.tip?"<p><strong>Tip:</strong> "+item.tip+"</p>":""));
    if (seed) q.root.innerHTML = seed;
    q.on("text-change", ()=>onUpdate("body", q.root.innerHTML));
    quillRef.current = q;
  }, []);
  function onDrop(e){
    e.preventDefault(); e.stopPropagation(); setOver(false);
    const f = fileFromDrop(e); if (!f || !quillRef.current) return;
    const r = quillRef.current.getSelection(true) || { index: quillRef.current.getLength() };
    resizeImageFile(f,1000,0.8).then((d)=>{ quillRef.current.insertEmbed(r.index,"image",d,"user"); quillRef.current.setSelection(r.index+1); });
  }
  return h("div", { className:"detail-notes" },
    h("div", { className:"notes-drop"+(over?" dragover":""),
      onDragOver:(e)=>{e.preventDefault();setOver(true);}, onDragLeave:()=>setOver(false), onDrop },
      h("div", { ref:hostRef })
    ),
    h("div", { className:"notes-hint" }, "Select text to format it. Drop a photo anywhere in this column to add it.")
  );
}

function ModalCover({ img, posY, onSetImg, onSetPos }) {
  const py = posY!=null ? posY : 50;
  const drag = useImageDrag(py, onSetPos);
  const [over, setOver] = useState(false);
  function set(file){ if(file) resizeImageFile(file,1600,0.85).then(onSetImg); }
  function onDrop(e){ e.preventDefault(); e.stopPropagation(); setOver(false); set(fileFromDrop(e)); }
  if (!img) {
    return h("label", { className:"modal-cover-empty"+(over?" dragover":""),
      onDragOver:(e)=>{e.preventDefault();setOver(true);}, onDragLeave:()=>setOver(false), onDrop },
      "Drop a photo here, or click to add a cover",
      h("input", { type:"file", accept:"image/*", onChange:(e)=>set(e.target.files&&e.target.files[0]) })
    );
  }
  return h("div", { className:"modal-cover"+(drag.dragging?" dragging":""), ref:drag.boxRef,
      style:{ backgroundImage:'url("'+img+'")', backgroundPosition:"center "+py+"%" },
      onPointerDown:drag.onPointerDown, onPointerMove:drag.onPointerMove, onPointerUp:drag.onPointerUp, onPointerLeave:drag.onPointerUp,
      onDragOver:(e)=>{e.preventDefault();setOver(true);}, onDragLeave:()=>setOver(false), onDrop },
    h("div", { className:"cover-controls" },
      h("label", { className:"cover-btn", onPointerDown:(e)=>e.stopPropagation() },
        "Change photo", h("input", { type:"file", accept:"image/*", onChange:(e)=>set(e.target.files&&e.target.files[0]) })
      )
    ),
    h("div", { className:"cover-hint" }, drag.dragging ? "Drop to set position" : "Drag to reposition")
  );
}

function ModalNotes({ item, onUpdate }) {
  const hostRef = useRef(null);
  const quillRef = useRef(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!hostRef.current || quillRef.current) return;
    const q = new window.Quill(hostRef.current, {
      theme:"bubble", placeholder:"Write anything here. Drop a photo in anytime.",
      modules:{ toolbar:["bold","italic","underline","link"] },
    });
    const seed = item.body!=null ? item.body
      : ((item.note?"<p>"+item.note+"</p>":"")+(item.tip?"<p><strong>Tip:</strong> "+item.tip+"</p>":""));
    if (seed) q.root.innerHTML = seed;
    q.on("text-change", ()=>onUpdate("body", q.root.innerHTML));
    quillRef.current = q;
  }, []);
  function onDrop(e){
    e.preventDefault(); e.stopPropagation(); setOver(false);
    const f = fileFromDrop(e); if (!f || !quillRef.current) return;
    const r = quillRef.current.getSelection(true) || { index: quillRef.current.getLength() };
    resizeImageFile(f,1000,0.8).then((d)=>{ quillRef.current.insertEmbed(r.index,"image",d,"user"); quillRef.current.setSelection(r.index+1); });
  }
  return h("div", { className:"modal-notes" },
    h("div", { className:"modal-notes-drop"+(over?" dragover":""),
      onDragOver:(e)=>{e.preventDefault();setOver(true);}, onDragLeave:()=>setOver(false), onDrop },
      h("div", { ref:hostRef })
    ),
    h("div", { className:"modal-notes-hint" }, "Select text to format it. Drop a photo anywhere in this column to add it.")
  );
}

function ItemModal({ item, catLabel, onUpdate, onClose, onDelete }) {
  const t = useRef(null);
  const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(item.addr || item.title);
  const mapEmbed = "https://maps.google.com/maps?q=" + encodeURIComponent(item.addr || item.title) + "&z=15&output=embed";
  function up(field, val){ onUpdate(field, val); }
  useEffect(()=>{
    function onKey(e){ if(e.key==="Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return ()=>{ document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);
  return h("div", { className:"modal-backdrop", onClick:onClose },
    h("div", { className:"modal", onClick:(e)=>e.stopPropagation() },
      h("div", { className:"modal-sheet-handle" }),
      h("button", { className:"modal-del", onClick:()=>{ if(window.confirm('Delete "'+item.title+'"?')) onDelete(); } }, "Delete"),
      h("button", { className:"modal-close", onClick:onClose }, "\u2715"),
      h(ModalCover, { img:item.img, posY:item.imgPosY, onSetImg:(d)=>up("img",d), onSetPos:(v)=>up("imgPosY",v) }),
      h("div", { className:"modal-body" },
        h("div", { className:"modal-main" },
          h("span", { className:"modal-cat-pill" }, catLabel || item.cat),
          h(Editable, { tag:"h1", className:"modal-title", value:item.title, onSave:(v)=>up("title",v) }),
          h(ModalNotes, { item, onUpdate:up })
        ),
        h("aside", { className:"facts" },
          h("div", { className:"fact" },
            h("div", { className:"fact-label" }, "Address"),
            h(Editable, { tag:"div", className:"fact-val", value:item.addr||"", onSave:(v)=>up("addr",v), placeholder:"Add an address" }),
            h("a", { className:"fact-link", href:maps, target:"_blank", rel:"noopener noreferrer" }, "Open in Maps \u2192")
          ),
          h("div", { className:"fact" },
            h("div", { className:"fact-label" }, "Nearest station"),
            h(Editable, { tag:"div", className:"fact-val", value:item.metro||"", onSave:(v)=>up("metro",v), placeholder:"Add a metro/train station" })
          ),
          h("div", { className:"fact" },
            h("div", { className:"fact-label" }, "Type"),
            h(Editable, { tag:"div", className:"fact-val", value:item.cuisine||"", onSave:(v)=>up("cuisine",v), placeholder:"Cuisine / type" })
          ),
          h("div", { className:"fact" },
            h("div", { className:"fact-label" }, "Price"),
            h(Editable, { tag:"div", className:"fact-val", value:item.price||"", onSave:(v)=>up("price",v), placeholder:"e.g. \u00a5\u00a5" })
          ),
          h("div", { className:"fact" },
            h("div", { className:"fact-label" }, "Hours / open"),
            h(Editable, { tag:"div", className:"fact-val", value:item.hours||"", onSave:(v)=>up("hours",v), placeholder:"e.g. 11:00-22:00, closed Tue" })
          ),
          h("div", { className:"fact" },
            h("div", { className:"fact-label" }, "Website"),
            h(Editable, { tag:"div", className:"fact-val", value:item.website||"", onSave:(v)=>up("website",v), placeholder:"Add a website URL" }),
            item.website ? h("a", { className:"fact-link", href:(item.website.indexOf("http")===0?item.website:"https://"+item.website), target:"_blank", rel:"noopener noreferrer" }, "Visit site \u2192") : null
          ),
          h("div", { className:"fact" },
            h("div", { className:"fact-label" }, "Tip"),
            h("div", { className:"fact-tip" },
              h(Editable, { tag:"div", className:"fact-val", value:item.tip||"", onSave:(v)=>up("tip",v), placeholder:"Add a tip" })
            )
          ),
          h("div", { className:"fact" },
            h("div", { className:"fact-label" }, "Map"),
            h("div", { className:"fact-map" },
              h("iframe", { src:mapEmbed, loading:"lazy", referrerPolicy:"no-referrer-when-downgrade", title:"map" })
            )
          )
        )
      )
    )
  );
}

function catInfo(cats, id) {
  const c = cats && cats.find(x=>x.id===id);
  if (c) return { label: c.label, color: c.color || null };
  return { label: id, color: null };
}
function PlaceCard({ item, cats, onOpen }) {
  const py = item.imgPosY!=null ? item.imgPosY : 50;
  const info = catInfo(cats, item.cat);
  const style = item.img
    ? { backgroundImage:'url("'+item.img+'")', backgroundPosition:"center "+py+"%" }
    : { background: HERO_COLORS[item.cat] || HERO_COLORS.default };
  const pillProps = info.color
    ? { className:"pcard-cat", style:{ background: info.color+"22", color: info.color } }
    : { className:"pcard-cat cat-"+item.cat };
  return h("div", { className:"pcard", onClick:onOpen },
    h("div", { className:"pcard-cover", style }),
    h("div", { className:"pcard-body" },
      h("div", { className:"pcard-top" },
        h("span", { className:"pcard-title" }, item.title),
        item.price ? h("span", { className:"pcard-price" }, item.price) : null,
        h("span", pillProps, info.label)
      ),
      h("p", { className:"pcard-note" }, item.note)
    )
  );
}

function AddItemForm({ cats, onSave, onCancel }) {
  const [f, setF] = useState({ title:"", cat:cats.find(c=>c.id!=="all") ? cats.find(c=>c.id!=="all").id : "offbeat", note:"" });
  const set = (k)=>(e)=>setF({ ...f, [k]:e.target.value });
  return h("div", { className:"form" },
    h("input", { placeholder:"Title", value:f.title, onChange:set("title") }),
    h("select", { value:f.cat, onChange:set("cat") }, cats.filter(c=>c.id!=="all").map(c=>h("option",{key:c.id,value:c.id},c.label))),
    h("textarea", { placeholder:"Short description", rows:2, value:f.note, onChange:set("note") }),
    h("div", { className:"form-row" },
      h("button", { className:"btn-ghost", onClick:onCancel }, "Cancel"),
      h("button", { className:"btn-primary", onClick:()=>{ if(!f.title.trim()) return; onSave({ cat:f.cat, title:f.title.trim(), note:f.note.trim()||"Tell me more about this place..." }); } }, "Add")
    )
  );
}

function CatEditor({ cats, onSave, onClose }) {
  const editable = cats.filter(c=>c.id!=="all");
  const [rows, setRows] = useState(editable.map(c=>({ ...c, color: c.color || "#4F46E5" })));
  function setRow(i, k, v){ const n=rows.slice(); n[i]={...n[i],[k]:v}; setRows(n); }
  function del(i){ setRows(rows.filter((_,j)=>j!==i)); }
  function add(){ setRows([...rows, { id:"cat-"+Date.now().toString(36), label:"New category", color:"#98A2B3" }]); }
  function save(){
    const cleaned = rows.filter(r=>r.label.trim()).map(r=>({ id:r.id, label:r.label.trim(), color:r.color }));
    onSave([{ id:"all", label:"All" }, ...cleaned]);
    onClose();
  }
  return h("div", { className:"cat-editor" },
    rows.map((r,i)=>h("div",{className:"cat-editor-row",key:r.id},
      h("input",{ type:"color", value:r.color, onChange:(e)=>setRow(i,"color",e.target.value) }),
      h("input",{ value:r.label, onChange:(e)=>setRow(i,"label",e.target.value) }),
      h("button",{ className:"cat-editor-del", onClick:()=>del(i), title:"Remove" }, "\\u2715")
    )),
    h("button",{ className:"cat-editor-add", onClick:add }, "+ Add category"),
    h("div",{ className:"form-row", style:{marginTop:"10px"} },
      h("button",{ className:"btn-ghost", onClick:onClose }, "Cancel"),
      h("button",{ className:"btn-primary", onClick:save }, "Save categories")
    )
  );
}

function CityPage({ node, cats, stays, onBack, onHome, onOpenItem, onUpdateItem, onDeleteItem, onAddItem, onUpdateNode, onUpdateCats, onExport, onImportClick }) {
  const [tab, setTab] = useState("all");
  const [adding, setAdding] = useState(false);
  const [editingCats, setEditingCats] = useState(false);
  const [flash, setFlash] = useState(false);
  const t = useRef(null);
  const list = useMemo(()=>cats.filter(c=>c.id==="all"||node.items.some(i=>i.cat===c.id)), [cats,node]);
  const shown = tab==="all" ? node.items : node.items.filter(i=>i.cat===tab);
  function up(field,val){ onUpdateNode(field,val); setFlash(true); clearTimeout(t.current); t.current=setTimeout(()=>setFlash(false),1400); }
  return h("div", { className:"city" },
    h("div", { className:"topbar" },
      h("button", { className:"brand", onClick:onHome }, h("span",{className:"brand-jp"},"旅"), h("span",{className:"brand-name"},"Japan Guide")),
      h("div", { className:"topbar-right" },
        h("button", { className:"topbar-back", onClick:onBack }, "← All destinations"),
        h("span", { className:"topbar-saved"+(flash?" show":"") }, "✓ Saved"),
        onExport ? h("button", { className:"topbar-io", onClick:onExport }, "Export") : null,
        onImportClick ? h("button", { className:"topbar-io", onClick:onImportClick }, "Import") : null
      )
    ),
    h(Cover, { img:node.img, posY:node.imgPosY, onSetImg:(d)=>up("img",d), onSetPos:(v)=>up("imgPosY",v) }),
    h("div", { className:"city-body" },
      h("div", { className:"city-head" },
        h(Editable, { tag:"h1", className:"city-name", value:node.name, onSave:(v)=>up("name",v) }),
        h("div", { className:"city-name-jp" }, node.kana),
        h("div", { className:"city-dates" }, node.dates),
        h(Editable, { tag:"div", className:"city-blurb", value:node.blurb, onSave:(v)=>up("blurb",v), placeholder:"Add a description for this destination..." })
      ),
      stays && stays.length ? h("div", { className:"stays" },
        stays.map((s,i)=>h("div",{className:"stay",key:i},
          h("div",null, h("div",{className:"stay-hotel"},s.hotel), h("div",{className:"stay-dates"},s.dates+" · "+s.addr)),
          h("a",{className:"stay-link",href:"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(s.addr),target:"_blank",rel:"noopener noreferrer"},"Maps →")
        ))
      ) : null,
      h("div", { className:"tabs" },
        list.map(c=>h("button",{key:c.id,className:"tab"+(tab===c.id?" active":""),onClick:()=>setTab(c.id)},c.label)),
        onUpdateCats ? h("span",{className:"cat-manage"},
          h("button",{className:"cat-edit-btn",onClick:()=>setEditingCats(!editingCats)}, editingCats?"Done":"Edit categories")
        ) : null
      ),
      editingCats && onUpdateCats ? h(CatEditor,{ cats, onSave:onUpdateCats, onClose:()=>setEditingCats(false) }) : null,
      h("div", { className:"places" },
        shown.map((item,i)=>h(PlaceCard,{ key:item.id||i, item, cats, onOpen:()=>onOpenItem(item.id) })),
        !adding ? h("button",{className:"add-place",onClick:()=>setAdding(true)},"+ Add a place")
          : h(AddItemForm,{ cats, onCancel:()=>setAdding(false), onSave:(n)=>{ onAddItem(n); setAdding(false); } })
      )
    )
  );
}

function AddCityForm({ onSave, onCancel }) {
  const [f, setF] = useState({ name:"", kana:"", dates:"" });
  const set = (k)=>(e)=>setF({ ...f, [k]:e.target.value });
  return h("div", { className:"dcard dcard-new", style:{ display:"block", padding:"18px", cursor:"default" } },
    h("div", { className:"form", style:{ border:"none", padding:0 } },
      h("input", { placeholder:"Destination name, e.g. Kyoto", value:f.name, onChange:set("name") }),
      h("input", { placeholder:"Japanese name (optional)", value:f.kana, onChange:set("kana") }),
      h("input", { placeholder:"Dates, e.g. Nov 21–25", value:f.dates, onChange:set("dates") }),
      h("div", { className:"form-row" },
        h("button", { className:"btn-ghost", onClick:onCancel }, "Cancel"),
        h("button", { className:"btn-primary", onClick:()=>{ if(!f.name.trim()) return; onSave({ id:genId(), name:f.name.trim(), kana:f.kana.trim()||f.name.trim(), dates:f.dates.trim()||"Dates TBC", blurb:"", items:[] }); } }, "Create")
      )
    )
  );
}

function DestCard({ node, count, countLabel, onOpen }) {
  const py = node.imgPosY!=null ? node.imgPosY : 50;
  return h("div", { className:"dcard", onClick:onOpen },
    node.img
      ? h("div", { className:"dcard-cover", style:{ backgroundImage:'url("'+node.img+'")', backgroundPosition:"center "+py+"%" } })
      : h("div", { className:"dcard-cover-fallback", style:{ background:CITY_FALLBACK } }, h("div",{className:"dcard-kana"},node.kana)),
    h("div", { className:"dcard-body" },
      h("div", { className:"dcard-name" }, node.name),
      h("div", { className:"dcard-dates" }, node.dates),
      h("div", { className:"dcard-desc" }, node.blurb || "No description yet."),
      h("div", { className:"dcard-count" }, count+" "+countLabel+" →")
    )
  );
}

function Home({ cities, general, onOpen, onAddCity, onExport, onImportClick }) {
  const [adding, setAdding] = useState(false);
  const totalPicks = cities.reduce((n,c)=>n+c.items.length,0);
  return h("div", null,
    h("div", { className:"topbar" },
      h("div", { className:"brand" }, h("span",{className:"brand-jp"},"旅"), h("span",{className:"brand-name"},"Japan Guide")),
      h("div", { className:"topbar-right" },
        onExport ? h("button", { className:"topbar-io", onClick:onExport }, "Export") : null,
        onImportClick ? h("button", { className:"topbar-io", onClick:onImportClick }, "Import") : null
      )
    ),
    h("div", { className:"home" },
      h("div", { className:"home-hero" },
        h("div", { className:"home-eyebrow" }, "日本 2026"),
        h("div", { className:"home-title" }, "Field guide"),
        h("div", { className:"home-sub" }, "A solo trip from Paris, 16 November to 5 December. Curated picks per city plus a practical layer, all editable and yours to shape."),
        h("div", { className:"home-meta" },
          h("div", null, h("div",{className:"home-stat-num"},"19"), h("div",{className:"home-stat-label"},"days")),
          h("div", null, h("div",{className:"home-stat-num"},cities.length), h("div",{className:"home-stat-label"},"destinations")),
          h("div", null, h("div",{className:"home-stat-num"},totalPicks), h("div",{className:"home-stat-label"},"picks"))
        )
      ),
      h("div", { className:"grid" },
        cities.map(c=>h(DestCard,{ key:c.id, node:c, count:c.items.length, countLabel:"picks", onOpen:()=>onOpen(c.id) })),
        h(DestCard,{ key:"general", node:general, count:general.items.length, countLabel:"notes", onOpen:()=>onOpen("general") }),
        !adding ? h("div",{key:"new",className:"dcard dcard-new",onClick:()=>setAdding(true)},"+ New destination")
          : h(AddCityForm,{ key:"newform", onCancel:()=>setAdding(false), onSave:(city)=>{ onAddCity(city); setAdding(false); } })
      )
    )
  );
}

function loadInitialData() {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return ensureIds(JSON.parse(s)); } catch(e){}
  return ensureIds(JSON.parse(JSON.stringify({ cities: DEFAULT_CITIES, general: DEFAULT_GENERAL })));
}

function exportData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = "japan-guide-backup-" + stamp + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function App() {
  const [data, setData] = useState(loadInitialData);
  const [active, setActive] = useState("home");
  const [itemId, setItemId] = useState(null);
  const fileInputRef = useRef(null);
  useEffect(()=>{ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch(e){} }, [data]);

  function doExport(){ exportData(data); }
  function doImportClick(){ if (fileInputRef.current) fileInputRef.current.click(); }
  function handleImportFile(e){
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); }
      catch(err) { alert("That file isn't valid JSON. Nothing was changed."); return; }
      if (!parsed || !Array.isArray(parsed.cities) || !parsed.general) {
        alert("That file doesn't look like a Japan Guide backup (missing cities/general). Nothing was changed.");
        return;
      }
      if (!confirm("Import this file? It will replace everything currently in the guide (your current data stays in place until you confirm).")) return;
      try { setData(ensureIds(parsed)); alert("Import complete."); }
      catch(err) { alert("Import failed: " + err.message); }
    };
    reader.onerror = () => alert("Couldn't read that file.");
    reader.readAsText(file);
  }
  const fileInput = h("input", { type:"file", accept:"application/json,.json", ref:fileInputRef, onChange:handleImportFile });

  const isGeneral = active==="general";
  const node = data.cities.find(c=>c.id===active) || (isGeneral ? data.general : null);
  const item = (node && itemId) ? node.items.find(i=>i.id===itemId) : null;

  function updateItem(it, field, val){ setData(p=>{ const n=JSON.parse(JSON.stringify(p)); const t=isGeneral?n.general:n.cities.find(c=>c.id===active); const idx=t.items.findIndex(x=>x.id===it.id); if(idx>-1) t.items[idx]={...t.items[idx],[field]:val}; return n; }); }
  function deleteItem(it){ setData(p=>{ const n=JSON.parse(JSON.stringify(p)); const t=isGeneral?n.general:n.cities.find(c=>c.id===active); t.items=t.items.filter(x=>x.id!==it.id); return n; }); if(itemId===it.id) setItemId(null); }
  function addItem(ni){ ni.id=genId(); setData(p=>{ const n=JSON.parse(JSON.stringify(p)); const t=isGeneral?n.general:n.cities.find(c=>c.id===active); t.items.push(ni); return n; }); }
  function updateNode(field,val){ setData(p=>{ const n=JSON.parse(JSON.stringify(p)); if(isGeneral){ n.general[field]=val; return n; } const t=n.cities.find(c=>c.id===active); if(t) t[field]=val; return n; }); }
  function addCity(city){ setData(p=>{ const n=JSON.parse(JSON.stringify(p)); n.cities.push(city); return n; }); }
  function updateCats(cats){ setData(p=>{ const n=JSON.parse(JSON.stringify(p)); n.categories = cats; return n; }); }

  const activeCats = isGeneral ? data.general.cats : (data.categories || CATS);
  const catLabel = item ? (function(){ const c = activeCats.find(x=>x.id===item.cat); return c ? c.label : item.cat; })() : null;

  if (node) return h("div",{className:"app"},
    fileInput,
    h(CityPage,{ node, cats:activeCats, stays:STAYS[node.id], onBack:()=>setActive("home"), onHome:()=>setActive("home"), onOpenItem:setItemId, onUpdateItem:updateItem, onDeleteItem:deleteItem, onAddItem:addItem, onUpdateNode:updateNode, onUpdateCats:updateCats, onExport:doExport, onImportClick:doImportClick }),
    item ? h(ItemModal,{ item, catLabel, onUpdate:(f,v)=>updateItem(item,f,v), onClose:()=>setItemId(null), onDelete:()=>deleteItem(item) }) : null
  );
  return h("div",{className:"app"},
    fileInput,
    h(Home,{ cities:data.cities, general:data.general, onOpen:setActive, onAddCity:addCity, onExport:doExport, onImportClick:doImportClick })
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
