const { useState, useMemo, useEffect, useRef, createElement: h } = React;

const STORAGE_KEY = "japan-guide-data-v4";

const genId = () => "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);

function ensureIds(data) {
  if (!data.categories) data.categories = JSON.parse(JSON.stringify(CATS));
  data.cities.forEach((c) => {
    if (!c.id) c.id = genId();
    c.items.forEach((it) => { if (!it.id) it.id = genId(); });
  });
  data.general.items.forEach((it) => { if (!it.id) it.id = genId(); });
  return data;
}

function mapsUrl(item) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(item.addr || item.title);
}
function mapsEmbed(item) {
  return "https://maps.google.com/maps?q=" + encodeURIComponent(item.addr || item.title) + "&z=15&output=embed";
}

function resizeImageFile(file, maxW, quality) {
  maxW = maxW || 900; quality = quality || 0.82;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), hgt = Math.round(img.height * scale);
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
  return f && f.type && f.type.indexOf("image") === 0 ? f : null;
}
function useImageDrag(posY, onPos, enabled) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef({ y: 0, p: 0, h: 1 });
  const boxRef = useRef(null);
  function onPointerDown(e) {
    if (!enabled) return;
    const r = boxRef.current.getBoundingClientRect();
    ref.current = { y: e.clientY, p: posY, h: r.height || 1 };
    setDragging(true);
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!enabled || !dragging) return;
    const d = ((e.clientY - ref.current.y) / ref.current.h) * 100;
    let n = ref.current.p - d; n = Math.max(0, Math.min(100, n));
    onPos(Math.round(n));
  }
  function onPointerUp() { setDragging(false); }
  return { dragging, boxRef, onPointerDown, onPointerMove, onPointerUp };
}

function Editable({ tag, className, value, onSave, placeholder, editing }) {
  if (!editing) return h(tag, { className }, value || null);
  return h(tag, {
    className: (className || "") + " editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: (e) => e.stopPropagation(),
    onBlur: (e) => { const v = e.target.innerText.trim(); if (v !== value) onSave(v); },
    "data-placeholder": placeholder || "",
  }, value);
}

/* ---------- chrome ---------- */
function AppHeader({ showBack, onBack, onHome, flash, hideOnHome }) {
  if (hideOnHome) return null;
  return h("header", { className: "app-header" },
    h("div", { className: "app-header-inner" },
      showBack
        ? h("button", { className: "header-back", type: "button", onClick: onBack }, "← Back")
        : h("span", { className: "header-spacer" }),
      h("button", { className: "brand", type: "button", onClick: onHome },
        h("img", { className: "brand-logo", src: "taberu-yellow.svg", alt: "taberu" })
      ),
      h("div", { className: "header-right" },
        flash ? h("span", { className: "saved-flash show" }, "✓") : null
      )
    )
  );
}

function BottomNav({ tab, onTab }) {
  const items = [
    { id: "home", label: "Home", ico: "⌂" },
    { id: "search", label: "Search", ico: "⌕" },
    { id: "tips", label: "Tips", ico: "☰" },
  ];
  return h("nav", { className: "bottom-nav", "aria-label": "Primary" },
    items.map((it) => h("button", {
      key: it.id,
      className: "bnav-btn" + (tab === it.id ? " active" : ""),
      onClick: () => onTab(it.id),
      type: "button",
    }, h("span", { className: "bnav-ico", "aria-hidden": true }, it.ico), it.label))
  );
}

/* ---------- media ---------- */
function Cover({ img, posY, onSetImg, onSetPos, editing }) {
  const py = posY != null ? posY : 50;
  const drag = useImageDrag(py, onSetPos, editing);
  const [over, setOver] = useState(false);
  function set(file) { if (file) resizeImageFile(file, 1600, 0.85).then(onSetImg); }
  function onDrop(e) {
    if (!editing) return;
    e.preventDefault(); e.stopPropagation(); setOver(false); set(fileFromDrop(e));
  }
  if (!img) {
    if (!editing) return null;
    return h("div", { className: "cover-empty" },
      h("label", {
        className: "cover-empty-inner" + (over ? " dragover" : ""),
        onDragOver: (e) => { e.preventDefault(); setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop,
      }, "Add a cover photo",
        h("input", { type: "file", accept: "image/*", onChange: (e) => set(e.target.files && e.target.files[0]) })
      )
    );
  }
  return h("div", {
    className: "cover" + (editing ? " editing" : "") + (drag.dragging ? " dragging" : ""),
    ref: drag.boxRef,
    style: { backgroundImage: 'url("' + img + '")', backgroundPosition: "center " + py + "%" },
    onPointerDown: drag.onPointerDown,
    onPointerMove: drag.onPointerMove,
    onPointerUp: drag.onPointerUp,
    onPointerLeave: drag.onPointerUp,
    onDragOver: editing ? (e) => { e.preventDefault(); setOver(true); } : undefined,
    onDragLeave: editing ? () => setOver(false) : undefined,
    onDrop,
  },
    editing ? h("div", { className: "cover-controls" },
      h("label", { className: "cover-btn", onPointerDown: (e) => e.stopPropagation() },
        "Change photo",
        h("input", { type: "file", accept: "image/*", onChange: (e) => set(e.target.files && e.target.files[0]) })
      )
    ) : null
  );
}

function ModalCover({ img, posY, onSetImg, onSetPos, editing }) {
  const py = posY != null ? posY : 50;
  const drag = useImageDrag(py, onSetPos, editing);
  const [over, setOver] = useState(false);
  function set(file) { if (file) resizeImageFile(file, 1600, 0.85).then(onSetImg); }
  function onDrop(e) {
    if (!editing) return;
    e.preventDefault(); e.stopPropagation(); setOver(false); set(fileFromDrop(e));
  }
  if (!img) {
    if (!editing) return h("div", { style: { height: 12 } });
    return h("label", {
      className: "modal-cover-empty" + (over ? " dragover" : ""),
      onDragOver: (e) => { e.preventDefault(); setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop,
    }, "Add a cover photo",
      h("input", { type: "file", accept: "image/*", onChange: (e) => set(e.target.files && e.target.files[0]) })
    );
  }
  return h("div", {
    className: "modal-cover" + (drag.dragging ? " dragging" : ""),
    ref: drag.boxRef,
    style: { backgroundImage: 'url("' + img + '")', backgroundPosition: "center " + py + "%" },
    onPointerDown: drag.onPointerDown,
    onPointerMove: drag.onPointerMove,
    onPointerUp: drag.onPointerUp,
    onPointerLeave: drag.onPointerUp,
    onDragOver: editing ? (e) => { e.preventDefault(); setOver(true); } : undefined,
    onDragLeave: editing ? () => setOver(false) : undefined,
    onDrop,
  },
    editing ? h("div", { className: "cover-controls modal-cover-controls" },
      h("label", { className: "cover-btn", onPointerDown: (e) => e.stopPropagation() },
        "Change photo",
        h("input", { type: "file", accept: "image/*", onChange: (e) => set(e.target.files && e.target.files[0]) })
      )
    ) : null
  );
}

function ModalNotes({ item, onUpdate, editing }) {
  const hostRef = useRef(null);
  const quillRef = useRef(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    if (quillRef.current) {
      quillRef.current.enable(!!editing);
      return;
    }
    const q = new window.Quill(hostRef.current, {
      theme: "bubble",
      placeholder: editing ? "Write anything here…" : "",
      modules: { toolbar: editing ? ["bold", "italic", "underline", "link"] : false },
      readOnly: !editing,
    });
    const seed = item.body != null ? item.body
      : (item.note ? "<p>" + item.note + "</p>" : "");
    if (seed) q.root.innerHTML = seed;
    q.on("text-change", () => {
      if (!editing) return;
      onUpdate("body", q.root.innerHTML);
    });
    quillRef.current = q;
  }, [editing]);

  function onDrop(e) {
    if (!editing) return;
    e.preventDefault(); e.stopPropagation(); setOver(false);
    const f = fileFromDrop(e); if (!f || !quillRef.current) return;
    const r = quillRef.current.getSelection(true) || { index: quillRef.current.getLength() };
    resizeImageFile(f, 1000, 0.8).then((d) => {
      quillRef.current.insertEmbed(r.index, "image", d, "user");
      quillRef.current.setSelection(r.index + 1);
    });
  }

  if (!editing && !item.body && !item.note && !item.tip) return null;

  return h("div", { className: "modal-notes" },
    h("div", {
      className: "modal-notes-drop" + (over ? " dragover" : ""),
      onDragOver: editing ? (e) => { e.preventDefault(); setOver(true); } : undefined,
      onDragLeave: editing ? () => setOver(false) : undefined,
      onDrop,
    }, h("div", { ref: hostRef })),
    editing ? h("div", { className: "modal-notes-hint" }, "Select text to format. Drop a photo to add it.") : null
  );
}

function ItemModal({ item, catLabel, onUpdate, onClose, onDelete }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);

  function up(field, val) { onUpdate(field, val); }

  return h("div", { className: "modal-backdrop", onClick: onClose },
    h("div", { className: "modal", onClick: (e) => e.stopPropagation() },
      h("div", { className: "modal-sheet-handle" }),
      h("button", { className: "modal-close", onClick: onClose, "aria-label": "Close" }, "✕"),
      h(ModalCover, {
        img: item.img, posY: item.imgPosY, editing,
        onSetImg: (d) => up("img", d), onSetPos: (v) => up("imgPosY", v),
      }),
      h("div", { className: "modal-body" },
        h("div", { className: "modal-main" },
          h("div", { className: "modal-toolbar" },
            h("span", { className: "modal-cat-pill" }, catLabel || item.cat),
            h("div", { className: "modal-toolbar-actions" },
              editing ? h("button", {
                className: "chip-btn danger",
                type: "button",
                onClick: () => { if (window.confirm('Delete "' + item.title + '"?')) onDelete(); },
              }, "Delete") : null,
              h("button", {
                className: "chip-btn" + (editing ? " primary" : ""),
                type: "button",
                onClick: () => setEditing((e) => !e),
              }, editing ? "Done" : "Edit")
            )
          ),
          h(Editable, {
            tag: "h1", className: "modal-title", value: item.title,
            onSave: (v) => up("title", v), editing,
          }),
          h(ModalNotes, { item, onUpdate: up, editing })
        ),
        h("aside", { className: "facts" },
          editing ? h("div", { className: "fact" },
            h("div", { className: "fact-label" }, "Tip"),
            h("div", { className: "fact-tip" },
              h(Editable, {
                tag: "div", className: "fact-val", value: item.tip || "",
                onSave: (v) => up("tip", v), placeholder: "Add a tip", editing,
              })
            )
          ) : null,
          h("div", { className: "fact" },
            h("div", { className: "fact-label" }, "Address"),
            h(Editable, {
              tag: "div", className: "fact-val", value: item.addr || "",
              onSave: (v) => up("addr", v), placeholder: "Add an address", editing,
            })
          ),
          item.metro || editing ? h("div", { className: "fact" },
            h("div", { className: "fact-label" }, "Nearest station"),
            h(Editable, {
              tag: "div", className: "fact-val", value: item.metro || "",
              onSave: (v) => up("metro", v), placeholder: "Metro / train", editing,
            })
          ) : null,
          item.cuisine || editing ? h("div", { className: "fact" },
            h("div", { className: "fact-label" }, "Type"),
            h(Editable, {
              tag: "div", className: "fact-val", value: item.cuisine || "",
              onSave: (v) => up("cuisine", v), placeholder: "Cuisine / type", editing,
            })
          ) : null,
          item.price || editing ? h("div", { className: "fact" },
            h("div", { className: "fact-label" }, "Price"),
            h(Editable, {
              tag: "div", className: "fact-val", value: item.price || "",
              onSave: (v) => up("price", v), placeholder: "e.g. ¥¥", editing,
            })
          ) : null,
          item.hours || editing ? h("div", { className: "fact" },
            h("div", { className: "fact-label" }, "Hours"),
            h(Editable, {
              tag: "div", className: "fact-val", value: item.hours || "",
              onSave: (v) => up("hours", v), placeholder: "Hours / closed days", editing,
            })
          ) : null,
          item.website || editing ? h("div", { className: "fact" },
            h("div", { className: "fact-label" }, "Website"),
            h(Editable, {
              tag: "div", className: "fact-val", value: item.website || "",
              onSave: (v) => up("website", v), placeholder: "Website URL", editing,
            }),
            item.website ? h("a", {
              className: "fact-link",
              href: item.website.indexOf("http") === 0 ? item.website : "https://" + item.website,
              target: "_blank", rel: "noopener noreferrer",
            }, "Visit site →") : null
          ) : null,
          h("div", { className: "fact" },
            h("div", { className: "fact-label" }, "Map"),
            h("div", { className: "fact-map" },
              h("iframe", { src: mapsEmbed(item), loading: "lazy", referrerPolicy: "no-referrer-when-downgrade", title: "map" })
            )
          ),
          h("div", { className: "fab-maps" },
            h("a", { href: mapsUrl(item), target: "_blank", rel: "noopener noreferrer" }, "Open in Maps")
          )
        )
      )
    )
  );
}

function catInfo(cats, id) {
  const c = cats && cats.find((x) => x.id === id);
  if (c) return { label: c.label, color: c.color || null };
  return { label: id, color: null };
}

function PlaceCard({ item, cats, onOpen, cityName }) {
  const py = item.imgPosY != null ? item.imgPosY : 50;
  const info = catInfo(cats, item.cat);
  const style = item.img
    ? { backgroundImage: 'url("' + item.img + '")', backgroundPosition: "center " + py + "%" }
    : { background: HERO_COLORS[item.cat] || HERO_COLORS.default };

  return h("article", { className: "pcard", onClick: onOpen },
    h("div", { className: "pcard-cover" + (item.img ? "" : " ph"), style },
      h("span", { className: "pcard-badge" }, info.label)
    ),
    h("div", { className: "pcard-body" },
      h("div", { className: "pcard-title-row" },
        h("span", { className: "pcard-title" }, item.title),
        item.price ? h("span", { className: "pcard-price" }, item.price) : null
      ),
      cityName ? h("div", { className: "pcard-city" }, cityName) : null,
      h("p", { className: "pcard-note" }, item.note),
      h("div", { className: "pcard-actions" },
        h("a", {
          className: "mini-btn maps",
          href: mapsUrl(item),
          target: "_blank",
          rel: "noopener noreferrer",
          onClick: (e) => e.stopPropagation(),
        }, "Maps"),
        h("button", {
          className: "mini-btn",
          type: "button",
          onClick: (e) => { e.stopPropagation(); onOpen(); },
        }, "Details")
      )
    )
  );
}

function AddItemForm({ cats, onSave, onCancel }) {
  const first = cats.find((c) => c.id !== "all");
  const [f, setF] = useState({ title: "", cat: first ? first.id : "experience", note: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return h("div", { className: "form" },
    h("input", { placeholder: "Title", value: f.title, onChange: set("title") }),
    h("select", { value: f.cat, onChange: set("cat") },
      cats.filter((c) => c.id !== "all").map((c) => h("option", { key: c.id, value: c.id }, c.label))
    ),
    h("textarea", { placeholder: "Short description", rows: 2, value: f.note, onChange: set("note") }),
    h("div", { className: "form-row" },
      h("button", { className: "btn-ghost", type: "button", onClick: onCancel }, "Cancel"),
      h("button", {
        className: "btn-primary", type: "button",
        onClick: () => {
          if (!f.title.trim()) return;
          onSave({ cat: f.cat, title: f.title.trim(), note: f.note.trim() || "Tell me more about this place…" });
        },
      }, "Add")
    )
  );
}

function CatEditor({ cats, onSave, onClose }) {
  const editable = cats.filter((c) => c.id !== "all");
  const [rows, setRows] = useState(editable.map((c) => ({ ...c, color: c.color || "#121212" })));
  function setRow(i, k, v) { const n = rows.slice(); n[i] = { ...n[i], [k]: v }; setRows(n); }
  function del(i) { setRows(rows.filter((_, j) => j !== i)); }
  function add() { setRows([...rows, { id: "cat-" + Date.now().toString(36), label: "New category", color: "#9A9A9A" }]); }
  function save() {
    const cleaned = rows.filter((r) => r.label.trim()).map((r) => ({ id: r.id, label: r.label.trim(), color: r.color }));
    onSave([{ id: "all", label: "All" }, ...cleaned]);
    onClose();
  }
  return h("div", { className: "cat-editor" },
    rows.map((r, i) => h("div", { className: "cat-editor-row", key: r.id },
      h("input", { type: "color", value: r.color, onChange: (e) => setRow(i, "color", e.target.value) }),
      h("input", { value: r.label, onChange: (e) => setRow(i, "label", e.target.value) }),
      h("button", { className: "cat-editor-del", type: "button", onClick: () => del(i) }, "✕")
    )),
    h("button", { className: "cat-editor-add", type: "button", onClick: add }, "+ Add category"),
    h("div", { className: "form-row", style: { marginTop: 10 } },
      h("button", { className: "btn-ghost", type: "button", onClick: onClose }, "Cancel"),
      h("button", { className: "btn-primary", type: "button", onClick: save }, "Save")
    )
  );
}

const CATEGORY_GROUPS = {
  shopping: { label: "Shopping", cats: ["shopping"], img: "img/cat-shopping.jpg", tall: false },
  food: {
    label: "Food",
    cats: ["coffee", "tea", "sushi", "izakaya", "ramen", "yakitori", "yakiniku", "tonkatsu", "noodles", "street", "dining", "bar"],
    img: "img/cat-food.jpg",
    tall: true,
  },
  experiences: {
    label: "Experiences",
    cats: ["area", "otaku", "experience", "daytrip"],
    img: "img/cat-experiences.jpg",
    tall: false,
  },
};

const CITY_COVERS = {
  tokyo: "img/hero-tokyo.jpg",
  kyoto: "../Kyoto/kyoto.jpg",
  osaka: "../Osaka/osaka.jpg",
  kamakura: "img/cat-experiences.jpg",
};

function itemsForGroup(cities, groupKey) {
  const keys = groupKey === "all" ? Object.keys(CATEGORY_GROUPS) : [groupKey];
  const cats = keys.reduce((a, k) => a.concat(CATEGORY_GROUPS[k].cats), []);
  const out = [];
  cities.forEach((c) => c.items.forEach((it) => {
    if (cats.includes(it.cat)) out.push({ ...it, cityId: c.id, cityName: c.name });
  }));
  return out;
}

function getFeatured(cities) {
  return Object.keys(CATEGORY_GROUPS)
    .map((key) => itemsForGroup(cities, key)[0])
    .filter(Boolean);
}

function allItems(data) {
  const out = [];
  data.cities.forEach((c) => c.items.forEach((it) => out.push({ ...it, cityId: c.id, cityName: c.name, scope: "city" })));
  data.general.items.forEach((it) => out.push({ ...it, cityId: "general", cityName: "Tips", scope: "general" }));
  return out;
}

/* ---------- pages ---------- */
function Home({ data, onOpenCity, onOpenCat, onOpenItem }) {
  const cities = data.cities;
  const cats = data.categories || CATS;
  const featured = getFeatured(cities);
  const left = cities.slice(0, 2);
  const right = cities.slice(2, 4);

  return h("div", { className: "home" },
    h("div", { className: "hero-wrap" },
      h("div", { className: "hero", style: { backgroundImage: 'url("img/hero-tokyo.jpg")' } },
        h("div", { className: "hero-nav" },
          h("div", { className: "hero-nav-side" },
            left.map((c) => h("button", {
              key: c.id, className: "hero-nav-link", type: "button",
              onClick: () => onOpenCity(c.id),
            }, c.name.toUpperCase()))
          ),
          h("img", { className: "hero-logo", src: "taberu-yellow.svg", alt: "taberu" }),
          h("div", { className: "hero-nav-side right" },
            right.map((c) => h("button", {
              key: c.id, className: "hero-nav-link", type: "button",
              onClick: () => onOpenCity(c.id),
            }, c.name.toUpperCase()))
          )
        )
      )
    ),

    h("section", { className: "section adventure-section" },
      h("h2", { className: "adventure-title" }, "Pick your adventure"),
      h("div", { className: "adv-grid" },
        Object.keys(CATEGORY_GROUPS).map((key) => {
          const g = CATEGORY_GROUPS[key];
          return h("button", {
            key, className: "adv-card" + (g.tall ? " tall" : ""),
            type: "button",
            onClick: () => onOpenCat(key),
          },
            h("div", { className: "adv-capsule", style: { backgroundImage: 'url("' + g.img + '")' } }),
            h("div", { className: "adv-label" }, g.label.toUpperCase())
          );
        })
      ),
      h("div", { className: "adventure-cta" },
        h("button", { className: "btn-pill", type: "button", onClick: () => onOpenCat("all") },
          "View all categories", h("span", { className: "btn-pill-arrow" }, "→")
        )
      )
    ),

    h("div", { className: "wash" },
      h("section", { className: "section" },
        h("div", { className: "section-head" },
          h("h2", { className: "section-title" }, "Featured"),
          h("button", { className: "btn-pill", type: "button", onClick: () => onOpenCat("all") },
            "View all", h("span", { className: "btn-pill-arrow" }, "→")
          )
        ),
        h("div", { className: "card-grid" },
          featured.map((item) => h(PlaceCard, {
            key: item.id, item, cats, cityName: item.cityName,
            onOpen: () => onOpenItem(item.cityId, item.id),
          }))
        )
      )
    )
  );
}

function parseMapsLink(url) {
  if (!url || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    const q = u.searchParams.get("q") || u.searchParams.get("query");
    if (q) {
      const decoded = decodeURIComponent(q.replace(/\+/g, " "));
      return { title: decoded.split(",")[0].trim(), addr: decoded.trim() };
    }
    const m = u.pathname.match(/\/place\/([^/]+)/);
    if (m) {
      const name = decodeURIComponent(m[1].replace(/\+/g, " "));
      return { title: name, addr: name };
    }
  } catch (e) {}
  return null;
}

function AddPlaceSheet({ cities, cats, defaults, onSave, onClose }) {
  const placeCats = cats.filter((c) => c.id !== "all");
  const [f, setF] = useState({
    cityId: defaults.cityId || (cities[0] && cities[0].id) || "tokyo",
    cat: defaults.cat || (placeCats[0] && placeCats[0].id) || "dining",
    title: "",
    note: "",
    maps: "",
    addr: "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function onMapsBlur() {
    const parsed = parseMapsLink(f.maps);
    if (!parsed) return;
    setF((prev) => ({
      ...prev,
      title: prev.title.trim() ? prev.title : parsed.title,
      addr: parsed.addr,
    }));
  }

  function submit() {
    const parsed = parseMapsLink(f.maps);
    const title = f.title.trim() || (parsed && parsed.title) || "";
    if (!title) return;
    onSave({
      cityId: f.cityId,
      item: {
        cat: f.cat,
        title,
        note: f.note.trim() || "Tell me more about this place…",
        addr: (f.addr || (parsed && parsed.addr) || title),
      },
    });
  }

  return h("div", { className: "modal-backdrop", onClick: onClose },
    h("div", { className: "add-sheet", onClick: (e) => e.stopPropagation() },
      h("div", { className: "modal-sheet-handle" }),
      h("div", { className: "add-sheet-head" },
        h("h2", null, "Add a place"),
        h("button", { className: "modal-close", type: "button", onClick: onClose, "aria-label": "Close", style: { position: "static" } }, "✕")
      ),
      h("div", { className: "form" },
        h("label", { className: "form-label" }, "Google Maps link (optional)"),
        h("input", {
          placeholder: "Paste a Maps URL…",
          value: f.maps,
          onChange: set("maps"),
          onBlur: onMapsBlur,
        }),
        h("label", { className: "form-label" }, "City"),
        h("select", { value: f.cityId, onChange: set("cityId") },
          cities.map((c) => h("option", { key: c.id, value: c.id }, c.name))
        ),
        h("label", { className: "form-label" }, "Category"),
        h("select", { value: f.cat, onChange: set("cat") },
          placeCats.map((c) => h("option", { key: c.id, value: c.id }, c.label))
        ),
        h("label", { className: "form-label" }, "Title"),
        h("input", { placeholder: "Place name", value: f.title, onChange: set("title") }),
        h("label", { className: "form-label" }, "Short note"),
        h("textarea", { placeholder: "Why it’s on the list", rows: 3, value: f.note, onChange: set("note") }),
        h("div", { className: "form-row" },
          h("button", { className: "btn-ghost", type: "button", onClick: onClose }, "Cancel"),
          h("button", { className: "btn-primary", type: "button", onClick: submit }, "Add place")
        )
      )
    )
  );
}

function SearchPage({ data, query, setQuery, onOpenItem }) {
  const cats = data.categories || CATS;
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const items = allItems(data).filter((it) => it.scope === "city");
    if (!q) return items.slice(0, 16);
    return items.filter((it) => {
      const hay = [it.title, it.note, it.tip, it.addr, it.cityName, it.cat, it.cuisine].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }, [data, q]);

  return h("div", { className: "page search-wrap" },
    h("h1", { className: "page-title", style: { marginBottom: 14 } }, "Search"),
    h("div", { className: "search-box" },
      h("span", { "aria-hidden": true }, "⌕"),
      h("input", {
        value: query,
        onChange: (e) => setQuery(e.target.value),
        placeholder: "Ramen, vintage, Ebisu…",
        autoFocus: true,
        enterKeyHint: "search",
      })
    ),
    h("div", { className: "search-count" }, q ? results.length + " results" : "Browse picks"),
    results.length === 0
      ? h("div", { className: "empty" }, "Nothing matched. Try a neighbourhood, dish, or shop name.")
      : h("div", { className: "card-grid" },
        results.map((item) => h(PlaceCard, {
          key: item.id, item, cats, cityName: item.cityName,
          onOpen: () => onOpenItem(item.cityId, item.id),
        }))
      )
  );
}

function CategoryPage({ groupKey, data, onOpenItem }) {
  const cats = data.categories || CATS;
  const isAll = groupKey === "all";
  const title = isAll ? "All picks" : CATEGORY_GROUPS[groupKey].label;
  const items = itemsForGroup(data.cities, groupKey);
  const cityIds = [];
  const cityMeta = {};
  items.forEach((it) => {
    if (!cityMeta[it.cityId]) {
      cityMeta[it.cityId] = it.cityName;
      cityIds.push(it.cityId);
    }
  });
  const catIds = [];
  items.forEach((it) => {
    if (it.cat && catIds.indexOf(it.cat) === -1) catIds.push(it.cat);
  });
  const [cityTab, setCityTab] = useState("all");
  const [catTab, setCatTab] = useState("all");
  let shown = cityTab === "all" ? items : items.filter((it) => it.cityId === cityTab);
  if (catTab !== "all") shown = shown.filter((it) => it.cat === catTab);

  return h("div", { className: "page" },
    h("div", { className: "page-body" },
      h("h1", { className: "page-title" }, title),
      cityIds.length > 1 ? h("div", { className: "tabs" },
        h("button", {
          type: "button",
          className: "tab" + (cityTab === "all" ? " active" : ""),
          onClick: () => setCityTab("all"),
        }, "All cities"),
        cityIds.map((id) => h("button", {
          key: id, type: "button",
          className: "tab" + (cityTab === id ? " active" : ""),
          onClick: () => setCityTab(id),
        }, cityMeta[id]))
      ) : null,
      catIds.length > 1 ? h("div", { className: "tabs cat-tabs" },
        h("button", {
          type: "button",
          className: "tab" + (catTab === "all" ? " active" : ""),
          onClick: () => setCatTab("all"),
        }, "All types"),
        catIds.map((id) => {
          const info = catInfo(cats, id);
          return h("button", {
            key: id, type: "button",
            className: "tab" + (catTab === id ? " active" : ""),
            onClick: () => setCatTab(id),
          }, info.label);
        })
      ) : null,
      shown.length === 0
        ? h("div", { className: "empty" }, "Nothing tagged here yet.")
        : h("div", { className: "card-grid" },
          shown.map((item) => h(PlaceCard, {
            key: item.id, item, cats,
            cityName: cityTab === "all" ? item.cityName : null,
            onOpen: () => onOpenItem(item.cityId, item.id),
          }))
        )
    )
  );
}

function CityPage({
  node, cats, stays,
  onOpenItem, onAddItem, onUpdateNode, onUpdateCats,
}) {
  const [tab, setTab] = useState("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingCats, setEditingCats] = useState(false);
  const list = useMemo(
    () => cats.filter((c) => c.id === "all" || node.items.some((i) => i.cat === c.id)),
    [cats, node]
  );
  const shown = tab === "all" ? node.items : node.items.filter((i) => i.cat === tab);

  return h("div", { className: "page city" + (editing ? " is-editing" : "") },
    h(Cover, {
      img: node.img || CITY_COVERS[node.id],
      posY: node.imgPosY,
      editing,
      onSetImg: (d) => onUpdateNode("img", d),
      onSetPos: (v) => onUpdateNode("imgPosY", v),
    }),
    h("div", { className: "page-body" },
      h("div", { className: "page-toolbar" },
        h("button", {
          className: "chip-btn" + (editing ? " primary" : ""),
          type: "button",
          onClick: () => setEditing((e) => !e),
        }, editing ? "Done" : "Edit page")
      ),
      h(Editable, { tag: "h1", className: "page-title", value: node.name, onSave: (v) => onUpdateNode("name", v), editing }),
      h("div", { className: "page-kana" }, node.kana),
      h("div", { className: "page-dates" }, node.dates),
      h(Editable, {
        tag: "div", className: "page-blurb", value: node.blurb,
        onSave: (v) => onUpdateNode("blurb", v), placeholder: "Add a description…", editing,
      }),
      stays && stays.length ? h("div", { className: "stays" },
        stays.map((s, i) => h("div", { className: "stay", key: i },
          h("div", null,
            h("div", { className: "stay-hotel" }, s.hotel),
            h("div", { className: "stay-dates" }, s.dates + " · " + s.addr)
          ),
          h("a", {
            className: "stay-link",
            href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.addr),
            target: "_blank", rel: "noopener noreferrer",
          }, "Maps →")
        ))
      ) : null,
      h("div", { className: "tabs" },
        list.map((c) => h("button", {
          key: c.id, type: "button",
          className: "tab" + (tab === c.id ? " active" : ""),
          onClick: () => setTab(c.id),
        }, c.label)),
        editing && onUpdateCats ? h("span", { className: "cat-manage" },
          h("button", {
            className: "cat-edit-btn", type: "button",
            onClick: () => setEditingCats(!editingCats),
          }, editingCats ? "Done" : "Edit cats")
        ) : null
      ),
      editingCats && onUpdateCats ? h(CatEditor, { cats, onSave: onUpdateCats, onClose: () => setEditingCats(false) }) : null,
      h("div", { className: "card-grid" },
        shown.map((item) => h(PlaceCard, {
          key: item.id, item, cats,
          onOpen: () => onOpenItem(item.id),
        })),
        editing
          ? (!adding
            ? h("button", { className: "add-place", type: "button", onClick: () => setAdding(true) }, "+ Add a place")
            : h(AddItemForm, {
              cats,
              onCancel: () => setAdding(false),
              onSave: (n) => { onAddItem(n); setAdding(false); },
            }))
          : null
      )
    )
  );
}

function TipsPage({ data, onOpenItem, onAddItem, onUpdateNode }) {
  return h(CityPage, {
    node: data.general,
    cats: data.general.cats,
    stays: null,
    onOpenItem: (id) => onOpenItem(id),
    onAddItem, onUpdateNode, onUpdateCats: null,
  });
}

function countStoredImages(data) {
  let n = 0;
  (data.cities || []).forEach((c) => {
    if (c.img) n++;
    (c.items || []).forEach((it) => { if (it.img) n++; });
  });
  return n;
}

function mergeStoredMedia(base, overlay) {
  if (!overlay || !overlay.cities) return base;
  const cityIndex = {};
  overlay.cities.forEach((c) => {
    if (c.id) cityIndex[c.id] = c;
    if (c.name) cityIndex[c.name] = c;
  });
  base.cities.forEach((c) => {
    const o = cityIndex[c.id] || cityIndex[c.name];
    if (!o) return;
    if (o.img) c.img = o.img;
    if (o.imgPosY != null) c.imgPosY = o.imgPosY;
    const itemIndex = {};
    (o.items || []).forEach((it) => {
      if (it.id) itemIndex[it.id] = it;
      if (it.title) itemIndex[it.title] = it;
    });
    c.items.forEach((it) => {
      const p = itemIndex[it.id] || itemIndex[it.title];
      if (!p) return;
      if (p.img) it.img = p.img;
      if (p.imgPosY != null) it.imgPosY = p.imgPosY;
      if (p.body != null) it.body = p.body;
    });
  });
  return base;
}

function loadInitialData() {
  const defaults = ensureIds(JSON.parse(JSON.stringify({ cities: DEFAULT_CITIES, general: DEFAULT_GENERAL })));
  const keys = [STORAGE_KEY, "japan-guide-data-v3", "japan-guide-data-v2", "japan-guide-data-v1"];
  let best = null;
  let bestImgs = -1;
  keys.forEach((key) => {
    try {
      const s = localStorage.getItem(key);
      if (!s) return;
      const parsed = JSON.parse(s);
      const n = countStoredImages(parsed);
      if (n > bestImgs) {
        best = parsed;
        bestImgs = n;
      }
    } catch (e) {}
  });
  if (!best) return defaults;
  const merged = mergeStoredMedia(defaults, best);
  merged.categories = JSON.parse(JSON.stringify(CATS));
  return ensureIds(merged);
}

function App() {
  const [data, setData] = useState(loadInitialData);
  const [tab, setTab] = useState("home");
  const [active, setActive] = useState(null);
  const [itemLoc, setItemLoc] = useState(null);
  const [query, setQuery] = useState("");
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);
  const [addingPlace, setAddingPlace] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }, [data]);

  function bumpFlash() {
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1400);
  }

  function goTab(id) {
    setTab(id);
    setActive(id === "tips" ? "general" : null);
    setItemLoc(null);
    window.scrollTo(0, 0);
  }
  function openCity(id) {
    setActive(id);
    setTab("home");
    setItemLoc(null);
    window.scrollTo(0, 0);
  }
  function openCat(key) {
    setActive("cat:" + key);
    setTab("home");
    setItemLoc(null);
    window.scrollTo(0, 0);
  }
  function openItem(cityId, itemId) {
    setItemLoc({ cityId, itemId });
  }
  function goHome() {
    setTab("home");
    setActive(null);
    setItemLoc(null);
    window.scrollTo(0, 0);
  }
  function goBack() {
    if (itemLoc) { setItemLoc(null); return; }
    if (active && typeof active === "string" && active.indexOf("cat:") === 0) {
      setActive(null); setTab("home"); window.scrollTo(0, 0); return;
    }
    if (active && active !== "general") {
      setActive(null); setTab("home"); window.scrollTo(0, 0); return;
    }
    goHome();
  }

  const isCategory = typeof active === "string" && active.indexOf("cat:") === 0;
  const isGeneral = active === "general";
  const node = isCategory || !active ? null
    : (data.cities.find((c) => c.id === active) || (isGeneral ? data.general : null));

  const item = itemLoc ? (function () {
    if (itemLoc.cityId === "general") return data.general.items.find((i) => i.id === itemLoc.itemId) || null;
    const city = data.cities.find((c) => c.id === itemLoc.cityId);
    return city ? city.items.find((i) => i.id === itemLoc.itemId) || null : null;
  })() : null;

  function mutateItem(it, field, val) {
    setData((p) => {
      const n = JSON.parse(JSON.stringify(p));
      const t = itemLoc.cityId === "general" ? n.general : n.cities.find((c) => c.id === itemLoc.cityId);
      const idx = t.items.findIndex((x) => x.id === it.id);
      if (idx > -1) t.items[idx] = { ...t.items[idx], [field]: val };
      return n;
    });
    bumpFlash();
  }
  function deleteItem(it) {
    setData((p) => {
      const n = JSON.parse(JSON.stringify(p));
      const t = itemLoc.cityId === "general" ? n.general : n.cities.find((c) => c.id === itemLoc.cityId);
      t.items = t.items.filter((x) => x.id !== it.id);
      return n;
    });
    setItemLoc(null);
  }
  function addItem(ni) {
    ni.id = genId();
    setData((p) => {
      const n = JSON.parse(JSON.stringify(p));
      const t = active === "general" ? n.general : n.cities.find((c) => c.id === active);
      t.items.push(ni);
      return n;
    });
    bumpFlash();
  }
  function addItemToCity(cityId, ni) {
    ni.id = genId();
    setData((p) => {
      const n = JSON.parse(JSON.stringify(p));
      const t = cityId === "general" ? n.general : n.cities.find((c) => c.id === cityId);
      if (t) t.items.push(ni);
      return n;
    });
    bumpFlash();
  }
  function updateNode(field, val) {
    setData((p) => {
      const n = JSON.parse(JSON.stringify(p));
      if (active === "general") { n.general[field] = val; return n; }
      const t = n.cities.find((c) => c.id === active);
      if (t) t[field] = val;
      return n;
    });
    bumpFlash();
  }
  function updateCats(cats) {
    setData((p) => { const n = JSON.parse(JSON.stringify(p)); n.categories = cats; return n; });
    bumpFlash();
  }

  const activeCats = isGeneral ? data.general.cats : (data.categories || CATS);
  const catMeta = item ? (activeCats.find((x) => x.id === item.cat) || {}) : {};
  const catLabel = item ? (catMeta.label || item.cat) : null;

  const onHomeScreen = tab === "home" && !active;
  const showBack = !onHomeScreen || !!itemLoc;

  let main;
  if (isCategory) {
    main = h(CategoryPage, {
      groupKey: active.slice(4), data,
      onOpenItem: openItem,
    });
  } else if (tab === "tips" || isGeneral) {
    main = h(TipsPage, {
      data,
      onOpenItem: (id) => openItem("general", id),
      onAddItem: addItem,
      onUpdateNode: updateNode,
    });
  } else if (active && node && !isGeneral) {
    main = h(CityPage, {
      node, cats: activeCats, stays: STAYS[node.id],
      onOpenItem: (id) => openItem(node.id, id),
      onAddItem: addItem,
      onUpdateNode: updateNode,
      onUpdateCats: updateCats,
    });
  } else if (tab === "search") {
    main = h(SearchPage, {
      data, query, setQuery,
      onOpenItem: openItem,
    });
  } else {
    main = h(Home, {
      data,
      onOpenCity: openCity,
      onOpenCat: openCat,
      onOpenItem: openItem,
    });
  }

  const navTab = isCategory ? "home"
    : (active && !isGeneral ? "home" : tab);

  const fabDefaults = (function () {
    if (active && !isCategory && !isGeneral) return { cityId: active, cat: "dining" };
    if (isCategory && active !== "cat:all") {
      const g = CATEGORY_GROUPS[active.slice(4)];
      return { cityId: data.cities[0].id, cat: g && g.cats[0] };
    }
    return { cityId: data.cities[0].id, cat: "dining" };
  })();

  return h("div", { className: "app" + (onHomeScreen ? " on-home" : "") },
    h(AppHeader, {
      hideOnHome: onHomeScreen,
      showBack,
      onBack: goBack,
      onHome: goHome,
      flash,
    }),
    main,
    h("button", {
      className: "fab-add",
      type: "button",
      "aria-label": "Add a place",
      onClick: () => setAddingPlace(true),
    }, "+"),
    h(BottomNav, { tab: navTab, onTab: goTab }),
    addingPlace ? h(AddPlaceSheet, {
      cities: data.cities,
      cats: data.categories || CATS,
      defaults: fabDefaults,
      onClose: () => setAddingPlace(false),
      onSave: ({ cityId, item }) => {
        addItemToCity(cityId, item);
        setAddingPlace(false);
        openItem(cityId, item.id);
      },
    }) : null,
    item ? h(ItemModal, {
      item, catLabel,
      onUpdate: (f, v) => mutateItem(item, f, v),
      onClose: () => setItemLoc(null),
      onDelete: () => deleteItem(item),
    }) : null
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
