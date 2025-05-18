// service-worker.js
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "新着メッセージ";
  const options = {
    body: data.body || "",
    icon: '/path/to/icon.png', // 必要に応じて変更
    tag: 'chat-message'
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 通知クリックでページをアクティブに
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(clientList => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
