/* ============================================================
   Service worker de "Mi cuaderno"
   1) OFFLINE: precachea el cascarón de la app al instalarse y
      responde todas las peticiones desde el caché primero, para
      que la app abra instantánea y completa sin datos ni WiFi.
   2) NOTIFICACIONES: permite mostrarlas en Android y enfoca la
      app cuando el usuario toca una.
   ============================================================ */

/* Sube el número de versión cuando cambies index.html:
   el caché viejo se limpia solo en la activación. */
const CACHE = "cuaderno-v1";

const CASCARON = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

/* ---------- Instalación: guardar el cascarón ---------- */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CASCARON))
  );
  self.skipWaiting();
});

/* ---------- Activación: limpiar cachés de versiones viejas ---------- */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- Intercepción de peticiones ---------- */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);

    /* Navegación (abrir la app): responder al instante con el HTML
       cacheado y, si hay red, refrescar la copia en segundo plano
       para que la próxima apertura traiga la versión nueva. */
    if (e.request.mode === "navigate") {
      const guardado = await cache.match("./index.html");
      const red = fetch(e.request)
        .then((resp) => {
          if (resp && resp.ok) cache.put("./index.html", resp.clone());
          return resp;
        })
        .catch(() => null);
      return guardado || (await red) || Response.error();
    }

    /* Todo lo demás (tipografías de Google, íconos, manifest…):
       caché primero; si no está, se trae de la red y se guarda
       para la próxima vez sin conexión. */
    const guardado = await cache.match(e.request);
    if (guardado) return guardado;

    try {
      const resp = await fetch(e.request);
      if (resp && (resp.ok || resp.type === "opaque")) {
        cache.put(e.request, resp.clone());
      }
      return resp;
    } catch (err) {
      /* Sin red y sin caché: respuesta vacía controlada
         (la app tiene tipografías de respaldo, así que no se rompe). */
      return new Response("", { status: 504, statusText: "Sin conexión" });
    }
  })());
});

/* ---------- Notificaciones: enfocar la app al tocarlas ---------- */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      if (ventanas.length > 0) return ventanas[0].focus();
      return self.clients.openWindow("./");
    })
  );
});
