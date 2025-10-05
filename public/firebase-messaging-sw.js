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
  const { title, body } = payload.notification || {};
  const data = payload.data || {};
  const options = {
    body: body || '',
    icon: '/logo192.png',
    data
  };
  self.registration.showNotification(title || 'DateScape', options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const matchId = event.notification?.data?.matchId;
  const url = matchId ? `/app/chat/${matchId}` : '/';
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


