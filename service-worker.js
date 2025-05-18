// service-worker.js
// 仮の内容。後でPush通知ロジックを追加します

self.addEventListener('install', function(event) {
  console.log('Service Worker: インストール完了');
});

self.addEventListener('activate', function(event) {
  console.log('Service Worker: アクティベート完了');
});
