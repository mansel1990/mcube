self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "MCube Stocks", {
      body: data.body || "",
      icon: "/logo.png",
      badge: "/logo.png",
      data: { url: data.url || "/stocks" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(event.notification.data.url);
          return client.focus();
        }
      }
      return clients.openWindow(event.notification.data.url);
    })
  );
});
