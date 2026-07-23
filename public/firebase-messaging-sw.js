/* global self */
importScripts('https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBagpj_hR9hCLZsbqUlQvtTQb2ncaaH6OY",
  authDomain: "datescape-ed925.firebaseapp.com",
  projectId: "datescape-ed925",
  storageBucket: "datescape-ed925.appspot.com",
  messagingSenderId: "156304129791",
  appId: "1:156304129791:web:410647e39d18227d14d6ca",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = payload.notification?.title || data.title || 'DateScape';
  const body = payload.notification?.body || data.body || '';
  const clickPath = data.clickPath || (data.matchId ? `/app/chat/${data.matchId}` : '/app/match-queue');
  const options = {
    body,
    icon: '/afterlight-icon-192.png',
    badge: '/afterlight-icon-192.png',
    tag: data.type && data.matchId ? `${data.type}-${data.matchId}` : 'datescape',
    data: { ...data, clickPath }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.clickPath || '/app/match-queue';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});


