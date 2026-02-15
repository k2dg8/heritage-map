import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import places from "./data/places.json";

const STORAGE_KEY_VIEWED = "viewed_places_v1";
const STORAGE_KEY_ROUTE = "route_places_v1";

// حساب المسافة (Haversine) بالكيلو
function distanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// HTML Icons (marker)
const normalIcon = L.divIcon({
  className: "custom-pin",
  html: `<div class="pin pin-normal" title="لم يتم عرضه بعد">📍</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  popupAnchor: [0, -28],
});

const viewedIcon = L.divIcon({
  className: "custom-pin",
  html: `<div class="pin pin-viewed" title="تم عرض هذا المكان">✅</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  popupAnchor: [0, -28],
});

// أيقونة لموقع المستخدم
const userIcon = L.divIcon({
  className: "custom-pin",
  html: `<div class="pin pin-user" title="موقعك الحالي">📍</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  popupAnchor: [0, -28],
});

export default function App() {
  const mapRef = useRef(null);

  const [query, setQuery] = useState("");
  const [mapType, setMapType] = useState("satellite"); // "normal" | "satellite"
  const [selectedId, setSelectedId] = useState(null);

  // تم العرض
  const [viewedIds, setViewedIds] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VIEWED);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // مسار الزيارة (IDs بالترتيب)
  const [routeIds, setRouteIds] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ROUTE);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // موقع المستخدم
  const [userLoc, setUserLoc] = useState(null); // { lat, lng, accuracy }
  const [locError, setLocError] = useState("");
  const [nearPlaces, setNearPlaces] = useState([]); // أقرب 5

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VIEWED, JSON.stringify(viewedIds));
    } catch {}
  }, [viewedIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ROUTE, JSON.stringify(routeIds));
    } catch {}
  }, [routeIds]);

  const viewedSet = useMemo(() => new Set(viewedIds), [viewedIds]);
  const routeSet = useMemo(() => new Set(routeIds), [routeIds]);

  const markViewed = (id) => {
    setViewedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const clearViewed = () => setViewedIds([]);

  // فلترة + عرض فقط اللي عنده إحداثيات صحيحة
  const validPlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? places
      : places.filter((p) => (p.name || "").toLowerCase().includes(q));

    return list.filter(
      (p) =>
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        !(p.lat === 0 && p.lng === 0)
    );
  }, [query]);

  const viewedCount = useMemo(
    () => validPlaces.filter((p) => viewedSet.has(p.id)).length,
    [validPlaces, viewedSet]
  );

  // مركز المدينة المنورة تقريبًا (fallback)
  const fallbackCenter = useMemo(() => [24.4686, 39.6142], []);

  const center = useMemo(() => {
    const firstValid = places.find(
      (p) =>
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        !(p.lat === 0 && p.lng === 0)
    );
    return firstValid ? [firstValid.lat, firstValid.lng] : fallbackCenter;
  }, [fallbackCenter]);

  const selectedPlace = useMemo(
    () => validPlaces.find((p) => p.id === selectedId) || null,
    [validPlaces, selectedId]
  );

  const goTo = (lat, lng, zoom = 14) => {
    const map = mapRef.current;
    if (map) map.setView([lat, lng], zoom, { animate: true });
  };

  const fitToPoints = (points) => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds.pad(0.2), { animate: true });
  };

  const goToUserLocation = () => {
    setLocError("");

    if (!("geolocation" in navigator)) {
      setLocError("المتصفح لا يدعم تحديد الموقع.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 50;

        setUserLoc({ lat, lng, accuracy });
        goTo(lat, lng, 14);
      },
      (err) => {
        if (err.code === 1) setLocError("تم رفض إذن الموقع. فعّل الإذن من المتصفح.");
        else if (err.code === 2) setLocError("تعذر تحديد موقعك الآن. جرّب مرة ثانية.");
        else if (err.code === 3) setLocError("انتهت مهلة تحديد الموقع. جرّب مرة ثانية.");
        else setLocError("حدث خطأ أثناء تحديد الموقع.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 20000 }
    );
  };

  const calcNearest = () => {
    if (!userLoc) {
      setLocError("اضغط (موقعي 📍) أولاً لتحديد موقعك.");
      return;
    }
    setLocError("");

    const sorted = [...validPlaces]
      .map((p) => ({
        ...p,
        distKm: distanceInKm(userLoc.lat, userLoc.lng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 5);

    setNearPlaces(sorted);
  };

  // ===== مسار الزيارة =====
  const addToRoute = (id) => {
    setRouteIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const removeFromRoute = (id) => {
    setRouteIds((prev) => prev.filter((x) => x !== id));
  };

  const clearRoute = () => setRouteIds([]);

  const moveRouteItem = (id, dir) => {
    setRouteIds((prev) => {
      const i = prev.indexOf(id);
      if (i === -1) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const routePlaces = useMemo(() => {
    // نحافظ على الترتيب حسب routeIds
    const mapById = new Map(validPlaces.map((p) => [p.id, p]));
    return routeIds.map((id) => mapById.get(id)).filter(Boolean);
  }, [routeIds, validPlaces]);

  const routePolylinePositions = useMemo(
    () => routePlaces.map((p) => [p.lat, p.lng]),
    [routePlaces]
  );

  const routeDistanceKm = useMemo(() => {
    if (routePlaces.length === 0) return 0;

    let total = 0;

    // لو عندك موقع، نحسب من موقعك لأول نقطة
    if (userLoc && routePlaces.length > 0) {
      total += distanceInKm(
        userLoc.lat,
        userLoc.lng,
        routePlaces[0].lat,
        routePlaces[0].lng
      );
    }

    for (let i = 0; i < routePlaces.length - 1; i++) {
      const a = routePlaces[i];
      const b = routePlaces[i + 1];
      total += distanceInKm(a.lat, a.lng, b.lat, b.lng);
    }
    return total;
  }, [routePlaces, userLoc]);

  const zoomToRoute = () => {
    if (routePlaces.length === 0) return;
    fitToPoints(routePlaces);
  };

  return (
    <div className="h-screen w-screen bg-slate-50">
      {/* CSS لأيقونات الماركر */}
      <style>{`
        .custom-pin { background: transparent; border: none; }
        .pin{
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          border-radius: 999px;
          box-shadow: 0 12px 22px rgba(0,0,0,.18);
          border: 1px solid rgba(0,0,0,.10);
          user-select: none;
          transform: translateY(-2px);
        }
        .pin-normal{ background: #ffffff; }
        .pin-viewed{ background: #eaffea; }
        .pin-user{ background: #e8f1ff; }
      `}</style>

      {/* Top Bar */}
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white">
              🕌
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                دليل آثار المدينة
              </div>
              <div className="text-xs text-slate-500">المدينة المنورة</div>
            </div>
          </div>

          <div className="rounded-full border px-3 py-1 text-xs text-slate-700">
            ✅ تم عرض {viewedCount} من {validPlaces.length}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMapType("normal")}
              className={`rounded-2xl border px-3 py-2 text-sm transition ${
                mapType === "normal"
                  ? "bg-slate-900 text-white"
                  : "bg-white hover:bg-slate-50"
              }`}
            >
              🗺️ عادية
            </button>

            <button
              onClick={() => setMapType("satellite")}
              className={`rounded-2xl border px-3 py-2 text-sm transition ${
                mapType === "satellite"
                  ? "bg-slate-900 text-white"
                  : "bg-white hover:bg-slate-50"
              }`}
            >
              🛰️ ستلايت
            </button>

            <button
              onClick={clearViewed}
              className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              title="مسح حالة (تم العرض)"
            >
              إعادة تعيين ✅
            </button>

            <button
              onClick={goToUserLocation}
              className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              title="عرض موقعك الحالي"
            >
              موقعي 📍
            </button>

            <button
              onClick={calcNearest}
              className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              title="عرض أقرب 5 مواقع"
            >
              الأقرب لي ⭐
            </button>

            <button
              onClick={zoomToRoute}
              className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              title="تكبير على مسار الزيارة"
              disabled={routePlaces.length === 0}
            >
              عرض المسار 🧭
            </button>
          </div>

          <div className="flex-1" />

          <div className="relative w-full max-w-sm">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setNearPlaces([]);
              }}
              placeholder="ابحث باسم المكان..."
              className="w-full rounded-2xl border bg-white px-4 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>

          {locError ? (
            <div className="w-full text-sm text-red-600">{locError}</div>
          ) : null}
        </div>
      </div>

      {/* Layout */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[360px_1fr]">
        {/* Sidebar */}
        <aside className="rounded-2xl border bg-white p-3 shadow-sm">
          {/* مسار الزيارة */}
          <div className="rounded-2xl border bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">مسار الزيارة 🧭</div>
              <button
                onClick={clearRoute}
                className="rounded-xl border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                disabled={routePlaces.length === 0}
                title="تفريغ المسار"
              >
                تفريغ
              </button>
            </div>

            <div className="mt-2 text-xs text-slate-600">
              عدد الأماكن: {routePlaces.length} • المسافة التقريبية:{" "}
              <span className="font-semibold text-slate-800">
                {routeDistanceKm.toFixed(2)} كم
              </span>
              {userLoc ? <span className="text-slate-500"> (تشمل من موقعك)</span> : null}
            </div>

            {routePlaces.length === 0 ? (
              <div className="mt-2 text-sm text-slate-600">
                لإضافة مسار: اختر مكان ثم اضغط “إضافة للمسار”.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {routePlaces.map((p, idx) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border bg-white p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {idx + 1}. {p.name}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveRouteItem(p.id, -1)}
                          className="rounded-xl border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                          disabled={idx === 0}
                          title="للأعلى"
                        >
                          ⬆️
                        </button>
                        <button
                          onClick={() => moveRouteItem(p.id, +1)}
                          className="rounded-xl border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                          disabled={idx === routePlaces.length - 1}
                          title="للأسفل"
                        >
                          ⬇️
                        </button>
                        <button
                          onClick={() => removeFromRoute(p.id)}
                          className="rounded-xl border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                          title="حذف"
                        >
                          ✖
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedId(p.id);
                          goTo(p.lat, p.lng, 15);
                        }}
                        className="rounded-2xl border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        عرض
                      </button>

                      <a
                        className="rounded-2xl border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        اذهب ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* قائمة المواقع */}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">قائمة المواقع</div>
            <div className="text-xs text-slate-500">{validPlaces.length} موقع</div>
          </div>

          <div className="mt-2 max-h-[38vh] space-y-2 overflow-auto pr-1">
            {validPlaces.map((p) => {
              const isViewed = viewedSet.has(p.id);
              const active = selectedId === p.id;

              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    goTo(p.lat, p.lng, 14);
                  }}
                  className={`w-full rounded-2xl border p-3 text-right transition ${
                    active
                      ? "border-slate-400 bg-slate-50"
                      : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="text-lg">{isViewed ? "✅" : "📍"}</div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">
                        {p.name}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {p.desc}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* أقرب مواقع */}
          {nearPlaces.length > 0 ? (
            <div className="mt-3 rounded-2xl border bg-blue-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">أقرب مواقع لك</div>
                <button
                  onClick={() => setNearPlaces([])}
                  className="rounded-xl border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                  title="إخفاء"
                >
                  إغلاق
                </button>
              </div>

              <div className="space-y-2">
                {nearPlaces.map((p) => (
                  <div key={p.id} className="rounded-2xl border bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-600">{p.distKm.toFixed(2)} كم</div>
                    </div>

                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedId(p.id);
                          goTo(p.lat, p.lng, 15);
                        }}
                        className="rounded-2xl border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        عرض
                      </button>

                      <button
                        onClick={() => addToRoute(p.id)}
                        className="rounded-2xl border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        إضافة للمسار ➕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* المحدد الآن */}
          {selectedPlace ? (
            <div className="mt-3 rounded-2xl border bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">المحدد الآن</div>
                  <div className="mt-1 text-sm text-slate-800">{selectedPlace.name}</div>
                </div>

                <button
                  onClick={() => addToRoute(selectedPlace.id)}
                  className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  disabled={routeSet.has(selectedPlace.id)}
                  title="إضافة المكان للمسار"
                >
                  {routeSet.has(selectedPlace.id) ? "مضاف ✅" : "إضافة للمسار ➕"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.lat},${selectedPlace.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  اذهب للموقع ↗
                </a>

                {!viewedSet.has(selectedPlace.id) ? (
                  <button
                    className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => markViewed(selectedPlace.id)}
                  >
                    تعليم كتم عرضه ✅
                  </button>
                ) : (
                  <span className="rounded-2xl border bg-white px-3 py-2 text-sm text-slate-700">
                    ✅ تم العرض
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border bg-slate-50 p-3 text-sm text-slate-600">
              اختر موقع من القائمة أو اضغط على دبوس في الخريطة.
            </div>
          )}
        </aside>

        {/* Map */}
        <main className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="h-[72vh] md:h-[80vh]">
            <MapContainer
              center={center}
              zoom={12}
              style={{ height: "100%", width: "100%" }}
              ref={mapRef}
            >
              {mapType === "normal" ? (
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              ) : (
                <>
                  <TileLayer
                    attribution="Tiles &copy; Esri"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                  <TileLayer
                    attribution="Labels &copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    opacity={0.35}
                  />
                </>
              )}

              {/* مسار الزيارة على الخريطة */}
              {routePolylinePositions.length >= 2 ? (
                <Polyline positions={routePolylinePositions} />
              ) : null}

              {/* موقع المستخدم + دائرة الدقة */}
              {userLoc ? (
                <>
                  <Marker position={[userLoc.lat, userLoc.lng]} icon={userIcon}>
                    <Popup>
                      <div style={{ maxWidth: 220 }}>
                        <b>موقعك الحالي</b>
                        <p style={{ margin: "6px 0" }}>
                          الدقة تقريبًا: {Math.round(userLoc.accuracy)} متر
                        </p>
                      </div>
                    </Popup>
                  </Marker>

                  <Circle
                    center={[userLoc.lat, userLoc.lng]}
                    radius={Math.max(20, Math.min(userLoc.accuracy, 300))}
                    pathOptions={{ opacity: 0.4, fillOpacity: 0.12 }}
                  />
                </>
              ) : null}

              {validPlaces.map((p) => {
                const isViewed = viewedSet.has(p.id);

                return (
                  <Marker
                    key={p.id}
                    position={[p.lat, p.lng]}
                    icon={isViewed ? viewedIcon : normalIcon}
                    eventHandlers={{
                      click: () => {
                        setSelectedId(p.id);
                        markViewed(p.id);
                      },
                    }}
                  >
                    <Popup>
                      <div style={{ maxWidth: 280 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <b style={{ flex: 1 }}>{p.name}</b>
                          {isViewed ? (
                            <span
                              style={{
                                fontSize: 12,
                                padding: "3px 8px",
                                borderRadius: 999,
                                border: "1px solid #ddd",
                              }}
                            >
                              ✅ تم العرض
                            </span>
                          ) : null}
                        </div>

                        <p style={{ margin: "8px 0" }}>{p.desc}</p>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-block",
                              padding: "8px 10px",
                              borderRadius: 12,
                              textDecoration: "none",
                              border: "1px solid #ddd",
                            }}
                          >
                            اذهب للموقع ↗
                          </a>

                          <button
                            onClick={() => addToRoute(p.id)}
                            disabled={routeSet.has(p.id)}
                            style={{
                              display: "inline-block",
                              padding: "8px 10px",
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              background: "white",
                              cursor: routeSet.has(p.id) ? "not-allowed" : "pointer",
                              opacity: routeSet.has(p.id) ? 0.6 : 1,
                            }}
                          >
                            {routeSet.has(p.id) ? "مضاف ✅" : "إضافة للمسار ➕"}
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </main>
      </div>
    </div>
  );
}
