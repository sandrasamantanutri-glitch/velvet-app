self.addEventListener("push", (event) => {
  let data = {
    title: "Nova mensagem",
    body: "Você recebeu uma mensagem",
    url: "/"
  };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error("Erro ao ler payload do push:", e);
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

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