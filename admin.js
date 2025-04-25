// admin.js

// 1. Firebase 初期化
const firebaseConfig = {
    apiKey: "AIzaSyAC_A8dMvfzc2I8SaKTSfklFDWHgqFZThQ",
    authDomain: "company-chat-app.firebaseapp.com",
    projectId: "company-chat-app",
    storageBucket: "company-chat-app.firebasestorage.app",
    messagingSenderId: "409983657200",
    appId: "1:409983657200:web:bf2f037efb6a292799ce35",
    measurementId: "G-KDL141H28M"
  };
  firebase.initializeApp(firebaseConfig);
  
  const db = firebase.firestore();
  const auth = firebase.auth();
  
  // 2. 認証＆権限チェック
  auth.onAuthStateChanged(async user => {
    if (!user) {
      // 未ログインならログイン画面へ
      location.href = 'login.html';
      return;
    }
  
    // カスタムクレームを含む最新のトークンを必ず取得
    await user.getIdToken(true);
  
    // トークンを取得して admin クレームをチェック
    const token = await user.getIdTokenResult();
    if (!token.claims.admin) {
      alert('管理者権限が必要です');
      location.href = 'index.html';
      return;
    }
  });
  
  // 3. エクスポート処理
  document.getElementById('export-btn').addEventListener('click', async () => {
    // エクスポート前にもトークンを強制リフレッシュ
    await auth.currentUser.getIdToken(true);
  
    const startInput = document.getElementById('start-date').value;
    const endInput   = document.getElementById('end-date').value;
    const startDate = new Date(startInput);
    const endDate   = new Date(endInput);
    if (isNaN(startDate) || isNaN(endDate)) {
      return alert('開始日・終了日を正しく入力してください');
    }
    // 終了日の23:59:59まで含める
    endDate.setHours(23, 59, 59, 999);
  
    try {
      // 全ルームの messages サブコレクションを横断検索
      const snapshot = await db
        .collectionGroup('messages')
        .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(startDate))
        .where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(endDate))
        .orderBy('timestamp')
        .get();
  
      // CSV ヘッダー行
      const rows = [
        ['roomId', 'messageId', 'uid', 'displayName', 'text', 'timestamp']
      ];
  
      snapshot.forEach(doc => {
        const data = doc.data();
        // ドキュメント参照からルーム ID を取得
        const roomId = doc.ref.parent.parent.id;
        rows.push([
          roomId,
          doc.id,
          data.uid,
          data.displayName || '',
          `"${(data.text || '').replace(/"/g, '""')}"`,
          data.timestamp.toDate().toISOString()
        ]);
      });
  
      // CSV 文字列化とダウンロード
      const csvContent = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-logs-${startInput}_to_${endInput}.csv`;
      a.click();
      URL.revokeObjectURL(url);
  
    } catch (err) {
      console.error(err);
      alert('ログ取得に失敗しました: ' + err.message);
    }
  });
  