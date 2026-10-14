const { useState, useMemo, useEffect, useRef, createElement: h } = React;

const STORAGE_KEY = "japan-guide-data-v4";

const SECTIONS = [
  { id: "shopping", label: "Shopping", cats: ["shopping"] },
  {
    id: "food",
    label: "Food",
    cats: ["sushi", "izakaya", "ramen", "yakitori", "yakiniku", "tonkatsu", "noodles", "street", "dining", "bar"],
  },
  { id: "coffee", label: "Coffee", cats: ["coffee", "tea"] },
  { id: "experiences", label: "Experiences", cats: ["area", "otaku", "experience", "daytrip"] },
  { id: "tips", label: "Tips", tips: true },
];

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
  maxW = maxW || 1600; quality = quality || 0.85;
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

function applyFileImages(data) {
  const byTitle = {};
  DEFAULT_CITIES.forEach((c) => c.items.forEach((it) => {
    if (it.img) byTitle[it.title] = it.img;
  }));
  data.cities.forEach((c) => c.items.forEach((it) => {
    const file = byTitle[it.title];
    if (!file) return;
    // Restore file covers when missing; keep user data-URL uploads
    if (!it.img || (typeof it.img === "string" && it.img.indexOf("data:") !== 0 && it.img.indexOf("img/") !== 0)) {
      it.img = file;
    }
    if (!it.img) it.img = file;
  }));
  return data;
}

function loadInitialData() {
  const defaults = ensureIds(JSON.parse(JSON.stringify({ cities: DEFAULT_CITIES, general: DEFAULT_GENERAL })));
  const keys = [STORAGE_KEY, "japan-guide-data-v3", "japan-guide-data-v2", "japan-guide-data-v1"];
  let best = null, bestImgs = -1;
  keys.forEach((key) => {
    try {
      const s = localStorage.getItem(key);
      if (!s) return;
      const parsed = JSON.parse(s);
      const n = countStoredImages(parsed);
      if (n > bestImgs) { best = parsed; bestImgs = n; }
    } catch (e) {}
  });
  let merged = best ? mergeStoredMedia(defaults, best) : defaults;
  merged.categories = JSON.parse(JSON.stringify(CATS));
  merged = applyFileImages(merged);
  return ensureIds(merged);
}

function diversifyByCity(items, limit) {
  const buckets = {};
  const order = [];
  items.forEach((it) => {
    const k = it.cityId || "x";
    if (!buckets[k]) { buckets[k] = []; order.push(k); }
    buckets[k].push(it);
  });
  const out = [];
  let i = 0;
  while (out.length < limit) {
    let added = false;
    for (let r = 0; r < order.length && out.length < limit; r++) {
      const k = order[(i + r) % order.length];
      if (buckets[k] && buckets[k].length) {
        out.push(buckets[k].shift());
        added = true;
      }
    }
    if (!added) break;
    i++;
  }
  return out;
}

function coverStyle(item) {
  const py = item.imgPosY != null ? item.imgPosY : 50;
  if (item.img) {
    return { backgroundImage: 'url("' + item.img + '")', backgroundPosition: "center " + py + "%" };
  }
  return { background: (HERO_COLORS && HERO_COLORS[item.cat]) || (HERO_COLORS && HERO_COLORS.default) || "#222" };
}

function catLabel(cats, id) {
  const c = (cats || []).find((x) => x.id === id);
  return (c && c.label) || id;
}

function allPlaces(data) {
  const out = [];
  data.cities.forEach((c) => c.items.forEach((it) => out.push({
    ...it, cityId: c.id, cityName: c.name, scope: "city",
  })));
  return out;
}

function allTips(data) {
  return (data.general.items || []).map((it) => ({
    ...it, cityId: "general", cityName: "Tips", scope: "tip",
  }));
}

function filterPlaces(places, { city, cat, q }) {
  let list = places;
  if (city && city !== "all") list = list.filter((p) => p.cityId === city);
  if (cat && cat !== "all") list = list.filter((p) => p.cat === cat);
  if (q) {
    const s = q.toLowerCase();
    list = list.filter((p) =>
      (p.title || "").toLowerCase().includes(s) ||
      (p.note || "").toLowerCase().includes(s) ||
      (p.addr || "").toLowerCase().includes(s) ||
      (p.cityName || "").toLowerCase().includes(s) ||
      (p.tip || "").toLowerCase().includes(s)
    );
  }
  return list;
}

function Editable({ tag, className, value, onSave, placeholder, editing }) {
  if (!editing) return h(tag, { className }, value || null);
  return h(tag, {
    className: (className || "") + " t2-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: (e) => e.stopPropagation(),
    onBlur: (e) => { const v = e.target.innerText.trim(); if (v !== value) onSave(v); },
    "data-placeholder": placeholder || "",
  }, value);
}

function TopBar({ filterOn, onFilter, onHome }) {
  return h("header", { className: "t2-top" },
    h("div", { className: "t2-top-row" },
      h("button", { className: "t2-brand", type: "button", onClick: onHome, "aria-label": "Home" },
        h("img", { src: "taberu-yellow.svg", alt: "taberu" })
      ),
      h("button", {
        className: "t2-filter-btn" + (filterOn ? " on" : ""),
        type: "button",
        "aria-label": "Filters",
        onClick: onFilter,
      }, h("img", { className: "t2-filter-ico", src: "Filter.svg", alt: "" }))
    )
  );
}

function BottomSearch({ query, onQuery }) {
  return h("div", { className: "t2-bottom-search" },
    h("label", { className: "t2-search" },
      h("span", { className: "t2-search-ico", "aria-hidden": true }, "⌕"),
      h("input", {
        type: "search",
        value: query,
        placeholder: "Search places, food, tips…",
        enterKeyHint: "search",
        onChange: (e) => onQuery(e.target.value),
      })
    )
  );
}

function RailTile({ item, onOpen }) {
  return h("article", { className: "t2-tile" },
    h("button", { className: "t2-tile-hit", type: "button", onClick: onOpen },
      h("div", { className: "t2-tile-cover", style: coverStyle(item) },
        item.cityName ? h("span", { className: "t2-tile-city" }, item.cityName) : null
      ),
      h("div", { className: "t2-tile-title" }, item.title),
      h("p", { className: "t2-tile-note" }, item.note || item.tip || "")
    ),
    item.scope !== "tip" && (item.addr || item.title)
      ? h("a", {
        className: "t2-tile-maps",
        href: mapsUrl(item),
        target: "_blank",
        rel: "noopener noreferrer",
        onClick: (e) => e.stopPropagation(),
      }, "Maps")
      : null
  );
}

function PlaceCard({ item, cats, onOpen }) {
  return h("article", { className: "t2-card" },
    h("button", { className: "t2-card-hit", type: "button", onClick: onOpen },
      h("div", { className: "t2-card-cover", style: coverStyle(item) },
        item.cityName && item.scope !== "tip"
          ? h("span", { className: "t2-card-city" }, item.cityName)
          : null,
        h("span", { className: "t2-card-cat" }, catLabel(cats, item.cat))
      ),
      h("div", { className: "t2-card-title" }, item.title),
      h("p", { className: "t2-card-note" }, item.note || item.tip || "")
    ),
    item.scope !== "tip" && (item.addr || item.title)
      ? h("a", {
        className: "t2-card-maps",
        href: mapsUrl(item),
        target: "_blank",
        rel: "noopener noreferrer",
      }, "Open in Maps")
      : null
  );
}

function HomeRails({ data, onOpenItem, onSeeAll }) {
  const places = useMemo(() => allPlaces(data), [data]);
  const tips = useMemo(() => allTips(data), [data]);

  return h("div", { className: "t2-main" },
    SECTIONS.map((sec) => {
      const raw = sec.tips
        ? tips
        : places.filter((p) => sec.cats.includes(p.cat));
      const items = diversifyByCity(raw, 14);
      if (!items.length) return null;
      return h("section", { key: sec.id, className: "t2-rail" },
        h("div", { className: "t2-rail-head" },
          h("h2", { className: "t2-rail-title" }, sec.label),
          h("button", {
            className: "t2-rail-more",
            type: "button",
            "aria-label": "See all " + sec.label,
            onClick: () => onSeeAll(sec.id),
          }, "→")
        ),
        h("div", { className: "t2-rail-scroll" },
          h("div", { className: "t2-rail-spacer", "aria-hidden": true }),
          items.map((item) => h(RailTile, {
            key: item.id,
            item,
            onOpen: () => onOpenItem(item),
          })),
          h("div", { className: "t2-rail-spacer", "aria-hidden": true })
        )
      );
    }),
    h("div", { className: "t2-see-all-wrap" },
      h("button", {
        className: "t2-btn primary",
        type: "button",
        onClick: () => onSeeAll("all"),
      }, "See all picks")
    )
  );
}

function ListView({ title, items, cats, onOpenItem }) {
  return h("div", { className: "t2-main" },
    h("div", { className: "t2-list-head" },
      h("h1", { className: "t2-list-title" }, title),
      h("span", { className: "t2-list-count" }, items.length + " places")
    ),
    items.length === 0
      ? h("div", { className: "t2-empty" }, "Nothing matched. Try another filter or search.")
      : h("div", { className: "t2-grid" },
        items.map((item) => h(PlaceCard, {
          key: item.id, item, cats, onOpen: () => onOpenItem(item),
        }))
      )
  );
}

function FilterSheet({ data, city, cat, onApply, onClose }) {
  const [c, setC] = useState(city || "all");
  const [k, setK] = useState(cat || "all");
  const placeCats = (data.categories || CATS).filter((x) => x.id !== "all");

  return h("div", { className: "t2-sheet-bg", onClick: onClose },
    h("div", { className: "t2-sheet", onClick: (e) => e.stopPropagation() },
      h("div", { className: "t2-sheet-handle" }),
      h("div", { className: "t2-sheet-title" }, "Filters"),
      h("div", { className: "t2-field-label" }, "City"),
      h("div", { className: "t2-chips" },
        h("button", {
          type: "button", className: "t2-chip" + (c === "all" ? " on" : ""),
          onClick: () => setC("all"),
        }, "All"),
        data.cities.map((cityRow) => h("button", {
          key: cityRow.id, type: "button",
          className: "t2-chip" + (c === cityRow.id ? " on" : ""),
          onClick: () => setC(cityRow.id),
        }, cityRow.name))
      ),
      h("div", { className: "t2-field-label" }, "Type"),
      h("div", { className: "t2-chips" },
        h("button", {
          type: "button", className: "t2-chip" + (k === "all" ? " on" : ""),
          onClick: () => setK("all"),
        }, "All"),
        placeCats.map((row) => h("button", {
          key: row.id, type: "button",
          className: "t2-chip" + (k === row.id ? " on" : ""),
          onClick: () => setK(row.id),
        }, row.label))
      ),
      h("div", { className: "t2-sheet-actions" },
        h("button", {
          className: "t2-btn", type: "button",
          onClick: () => { setC("all"); setK("all"); },
        }, "Reset"),
        h("button", {
          className: "t2-btn primary", type: "button",
          onClick: () => onApply({ city: c, cat: k }),
        }, "Apply")
      )
    )
  );
}

function AddSheet({ cities, cats, onSave, onClose }) {
  const placeCats = cats.filter((c) => c.id !== "all");
  const [cityId, setCityId] = useState(cities[0] && cities[0].id);
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState(placeCats[0] && placeCats[0].id);
  const [note, setNote] = useState("");
  const [addr, setAddr] = useState("");

  function save() {
    if (!title.trim() || !cityId) return;
    onSave({
      cityId,
      item: {
        id: genId(),
        title: title.trim(),
        cat: cat || "dining",
        note: note.trim(),
        addr: addr.trim(),
      },
    });
  }

  return h("div", { className: "t2-sheet-bg", onClick: onClose },
    h("div", { className: "t2-sheet", onClick: (e) => e.stopPropagation() },
      h("div", { className: "t2-sheet-handle" }),
      h("div", { className: "t2-sheet-title" }, "Add a place"),
      h("div", { className: "t2-field-label" }, "City"),
      h("div", { className: "t2-chips" },
        cities.map((c) => h("button", {
          key: c.id, type: "button",
          className: "t2-chip" + (cityId === c.id ? " on" : ""),
          onClick: () => setCityId(c.id),
        }, c.name))
      ),
      h("div", { className: "t2-field-label" }, "Type"),
      h("div", { className: "t2-chips" },
        placeCats.map((c) => h("button", {
          key: c.id, type: "button",
          className: "t2-chip" + (cat === c.id ? " on" : ""),
          onClick: () => setCat(c.id),
        }, c.label))
      ),
      h("div", { className: "t2-field-label" }, "Name"),
      h("input", {
        value: title, onChange: (e) => setTitle(e.target.value),
        placeholder: "Place name",
        style: { width: "100%", height: 44, borderRadius: 12, border: "1px solid var(--line)", padding: "0 12px" },
      }),
      h("div", { className: "t2-field-label" }, "Note"),
      h("textarea", {
        value: note, onChange: (e) => setNote(e.target.value),
        placeholder: "Why go / what to order",
        rows: 3,
        style: { width: "100%", borderRadius: 12, border: "1px solid var(--line)", padding: 12, resize: "vertical" },
      }),
      h("div", { className: "t2-field-label" }, "Address / Maps query"),
      h("input", {
        value: addr, onChange: (e) => setAddr(e.target.value),
        placeholder: "Paste a Maps name or address",
        style: { width: "100%", height: 44, borderRadius: 12, border: "1px solid var(--line)", padding: "0 12px" },
      }),
      h("div", { className: "t2-sheet-actions" },
        h("button", { className: "t2-btn", type: "button", onClick: onClose }, "Cancel"),
        h("button", { className: "t2-btn primary", type: "button", onClick: save }, "Save")
      )
    )
  );
}

function ModalNotes({ item, onUpdate, editing }) {
  const hostRef = useRef(null);
  const quillRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return;
    if (quillRef.current) {
      quillRef.current.enable(!!editing);
      return;
    }
    if (!window.Quill) return;
    const q = new window.Quill(hostRef.current, {
      theme: "bubble",
      placeholder: editing ? "Write anything here…" : "",
      modules: { toolbar: editing ? ["bold", "italic", "underline", "link"] : false },
      readOnly: !editing,
    });
    const seed = item.body != null ? item.body : (item.note ? "<p>" + item.note + "</p>" : "");
    if (seed) q.root.innerHTML = seed;
    q.on("text-change", () => {
      if (!editing) return;
      onUpdate("body", q.root.innerHTML);
    });
    quillRef.current = q;
  }, [editing]);

  if (!editing && !item.body && !item.note && !item.tip) return null;
  return h("div", { className: "t2-modal-notes" }, h("div", { ref: hostRef }));
}

function ItemModal({ item, cats, onUpdate, onClose, onDelete }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);

  function up(field, val) { onUpdate(field, val); }
  const label = catLabel(cats, item.cat);
  const py = item.imgPosY != null ? item.imgPosY : 50;

  return h("div", { className: "t2-modal-bg", onClick: onClose },
    h("div", { className: "t2-modal", onClick: (e) => e.stopPropagation() },
      h("button", { className: "t2-modal-close", type: "button", onClick: onClose, "aria-label": "Close" }, "✕"),
      item.img
        ? h("div", {
          className: "t2-modal-cover",
          style: { backgroundImage: 'url("' + item.img + '")', backgroundPosition: "center " + py + "%" },
        },
          editing ? h("label", { className: "t2-modal-cover-btn" }, "Change photo",
            h("input", {
              type: "file", accept: "image/*",
              onChange: (e) => {
                const f = e.target.files && e.target.files[0];
                if (f) resizeImageFile(f).then((d) => up("img", d));
              },
            })
          ) : null
        )
        : h("div", { className: "t2-modal-cover empty" },
          editing
            ? h("label", { className: "t2-modal-cover-btn", style: { position: "static" } }, "Add cover photo",
              h("input", {
                type: "file", accept: "image/*",
                onChange: (e) => {
                  const f = e.target.files && e.target.files[0];
                  if (f) resizeImageFile(f).then((d) => up("img", d));
                },
              })
            )
            : "No photo"
        ),
      h("div", { className: "t2-modal-body" },
        h("div", { className: "t2-modal-toolbar" },
          h("span", { className: "t2-modal-cat" }, label),
          h("div", { className: "t2-modal-actions" },
            editing ? h("button", {
              className: "t2-mini danger", type: "button",
              onClick: () => { if (window.confirm('Delete "' + item.title + '"?')) onDelete(); },
            }, "Delete") : null,
            h("button", {
              className: "t2-mini" + (editing ? " primary" : ""),
              type: "button",
              onClick: () => setEditing((v) => !v),
            }, editing ? "Done" : "Edit")
          )
        ),
        h(Editable, {
          tag: "h1", className: "t2-modal-title", value: item.title,
          onSave: (v) => up("title", v), editing,
        }),
        item.cityName ? h("div", { className: "t2-modal-city" }, item.cityName) : null,
        h(ModalNotes, { item, onUpdate: up, editing }),
        h("div", { className: "t2-facts" },
          (item.tip || editing) ? h("div", { className: "t2-fact" },
            h("div", { className: "t2-fact-label" }, "Tip"),
            h("div", { className: "t2-fact-tip" },
              h(Editable, {
                tag: "div", className: "t2-fact-val", value: item.tip || "",
                onSave: (v) => up("tip", v), placeholder: "Add a tip", editing,
              })
            )
          ) : null,
          (item.addr || editing) ? h("div", { className: "t2-fact" },
            h("div", { className: "t2-fact-label" }, "Address"),
            h(Editable, {
              tag: "div", className: "t2-fact-val", value: item.addr || "",
              onSave: (v) => up("addr", v), placeholder: "Add an address", editing,
            })
          ) : null,
          item.scope !== "tip" ? h("div", { className: "t2-fact" },
            h("div", { className: "t2-fact-label" }, "Map"),
            h("div", { className: "t2-map" },
              h("iframe", { src: mapsEmbed(item), loading: "lazy", title: "map" })
            ),
            h("a", {
              className: "t2-maps-cta",
              href: mapsUrl(item),
              target: "_blank",
              rel: "noopener noreferrer",
            }, "Open in Maps")
          ) : null
        )
      )
    )
  );
}

function App() {
  const [data, setData] = useState(loadInitialData);
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ mode: "home" });
  const [filters, setFilters] = useState({ city: "all", cat: "all" });
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }, [data]);

  const cats = data.categories || CATS;
  const places = useMemo(() => allPlaces(data), [data]);
  const tips = useMemo(() => allTips(data), [data]);

  const filterActive = filters.city !== "all" || filters.cat !== "all";

  const listItems = useMemo(() => {
    if (view.mode !== "list") return [];
    if (view.section === "tips") {
      return filterPlaces(tips, { city: "all", cat: filters.cat === "all" ? "all" : filters.cat, q: query });
    }
    let base = places;
    const sec = SECTIONS.find((s) => s.id === view.section);
    if (sec && sec.cats) base = places.filter((p) => sec.cats.includes(p.cat));
    return filterPlaces(base, { city: filters.city, cat: filters.cat, q: query });
  }, [view, places, tips, filters, query]);

  const searchItems = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim();
    const fromPlaces = filterPlaces(places, { city: filters.city, cat: filters.cat, q });
    const fromTips = filterPlaces(tips, { city: "all", cat: "all", q });
    return fromPlaces.concat(fromTips);
  }, [query, places, tips, filters]);

  function goHome() {
    setView({ mode: "home" });
    setQuery("");
    window.scrollTo(0, 0);
  }

  function seeAll(sectionId) {
    setView({ mode: "list", section: sectionId });
    window.scrollTo(0, 0);
  }

  function openItem(item) {
    setOpen(item);
  }

  function mutateOpen(field, val) {
    if (!open) return;
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (open.scope === "tip") {
        const it = next.general.items.find((x) => x.id === open.id);
        if (it) it[field] = val;
      } else {
        const city = next.cities.find((c) => c.id === open.cityId);
        const it = city && city.items.find((x) => x.id === open.id);
        if (it) it[field] = val;
      }
      return next;
    });
    setOpen((p) => (p ? { ...p, [field]: val } : p));
  }

  function deleteOpen() {
    if (!open) return;
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (open.scope === "tip") {
        next.general.items = next.general.items.filter((x) => x.id !== open.id);
      } else {
        const city = next.cities.find((c) => c.id === open.cityId);
        if (city) city.items = city.items.filter((x) => x.id !== open.id);
      }
      return next;
    });
    setOpen(null);
  }

  const listTitle = (() => {
    if (searchItems) return "Search";
    if (view.section === "all") return "All picks";
    const sec = SECTIONS.find((s) => s.id === view.section);
    return (sec && sec.label) || "Picks";
  })();

  const showingSearch = !!searchItems;

  return h("div", { className: "app2" },
    h(TopBar, {
      filterOn: filterActive || showFilters,
      onFilter: () => setShowFilters(true),
      onHome: goHome,
    }),
    showingSearch
      ? h(ListView, { title: listTitle, items: searchItems, cats, onOpenItem: openItem })
      : (view.mode === "home"
        ? h(HomeRails, { data, onOpenItem: openItem, onSeeAll: seeAll })
        : h(ListView, { title: listTitle, items: listItems, cats, onOpenItem: openItem })),
    h(BottomSearch, { query, onQuery: setQuery }),
    showFilters ? h(FilterSheet, {
      data,
      city: filters.city,
      cat: filters.cat,
      onClose: () => setShowFilters(false),
      onApply: (f) => {
        setFilters(f);
        setShowFilters(false);
        if (view.mode === "home" && (f.city !== "all" || f.cat !== "all")) {
          setView({ mode: "list", section: "all" });
        }
      },
    }) : null,
    open ? h(ItemModal, {
      item: open,
      cats,
      onUpdate: mutateOpen,
      onClose: () => setOpen(null),
      onDelete: deleteOpen,
    }) : null
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
