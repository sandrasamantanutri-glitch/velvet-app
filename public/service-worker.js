self.addEventListener("push", (event) => {
  console.log("[SW] push recebido");

  let data = {
    title: "Nova mensagem",
    body: "Você recebeu uma mensagem",
    url: "/"
  };

  try {
    if (event.data) {
      data = event.data.json();
    }
    console.log("[SW] payload:", data);
  } catch (e) {
    console.error("[SW] Erro ao ler payload do push:", e);
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Velvet", {
      body: data.body || "Você recebeu uma mensagem",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";
  console.log("[SW] notificationclick url:", url);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if (client.url.includes(url)) {
            return client.focus();
          }
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});