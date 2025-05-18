const express         = require('express');
const admin           = require('firebase-admin');
const { readFileSync } = require('fs');

// ======================================
// Firebase Admin SDK の初期化
// ======================================
let serviceAccount;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  // 本番（Fly.ioなど環境変数）
  serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
} else {
  // ローカル（ファイル読み込み）
  serviceAccount = JSON.parse(
    require('fs').readFileSync(
      './company-chat-app-firebase-adminsdk-fbsvc-5e858554dc.json',
      'utf-8'
    )
  );
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ======================================
// Express アプリ設定
// ======================================
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// ======================================
// 1) 生存確認用エンドポイント
// ======================================
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// ======================================
// 2) WooCommerce Webhook 受信用エンドポイント
// ======================================
app.post('/webhook', async (req, res) => {
  const payload = req.body;
  console.log('Webhook受信:', payload);

  if (!payload) {
    console.error('Webhook のペイロードが undefined です。');
    return res.status(400).send('No payload received');
  }

  // 「処理中」ステータスだけ処理
  if (payload.status === 'processing') {
    console.log('「処理中」イベントが検出されました。');

    // ─── 情報の抽出 ────────────────────────────
    const orderId     = payload.id || payload.order_id || '不明';
    const currentDate = new Date().toISOString().slice(0, 10);
    const orderDate   = payload.date_created || '不明';

    // 請求先情報（例）
    const billing = payload.billing || {};
    const name = billing.company?.trim()
      ? billing.company.trim()
      : `${(billing.last_name || '')}${(billing.first_name || '')}`.trim() || '不明';
    const postcode = billing.postcode?.trim() || '（未入力）';
    const phone    = billing.phone?.trim()    || '（未入力）';
    const addrLines = [];
    if (billing.company)   addrLines.push(billing.company);
    if (billing.state)     addrLines.push(billing.state);
    if (billing.city)      addrLines.push(billing.city);
    if (billing.address_1) addrLines.push(billing.address_1);
    if (billing.address_2) addrLines.push(billing.address_2);
    const address = addrLines.length ? addrLines.join('\n') : '不明';

    // 商品リスト＆合計
    let productLines           = '';
    let aggregatedProductTotal = 0;
    if (Array.isArray(payload.line_items)) {
      payload.line_items.forEach(item => {
        const itemTotal = parseFloat(item.total) || 0;
        aggregatedProductTotal += itemTotal;
        productLines += `　→ ${item.name} × ${item.quantity} (¥${item.total})\n`;
      });
    } else {
      productLines = '　（商品情報なし）\n';
    }

    // 配送料・合計金額
    const shippingCost = payload.shipping_lines?.[0]?.total || '0';
    const totalAmount  = payload.total || aggregatedProductTotal;

    // ─── Firestore へ書き込み（orders コレクション追加） ─────────────
    try {
      await db
        .collection('orders')
        .doc(orderId.toString())
        .set({
          orderId,
          status:      payload.status,
          createdAt:   admin.firestore.FieldValue.serverTimestamp(),
          customer:    billing,
          items:       payload.line_items,
          total:       Number(totalAmount),
          shippingCost: Number(shippingCost)   // ← ここを追加
        });
      console.log(`✅ Firestore 書き込み完了 (orders/${orderId})`);
    } catch (err) {
      console.error('❌ orders書き込みエラー:', err);
    }

    // ─── メッセージ組み立て ────────────────────────
    const text = `【注文通知】

注文番号: ${orderId}
【現在の日付】: ${currentDate}
【注文日】: ${orderDate}

お名前: ${name}
電話番号: ${phone}
郵便番号: ${postcode}
住所:
${address}

購入商品:
${productLines}商品金額: ¥${aggregatedProductTotal}
配送料: ¥${shippingCost}
合計金額: ¥${totalAmount}

発送手続きをお願いします。`;

    // ─── Firestore へ書き込み（WING ルームへのチャット通知） ──────
    try {
      const roomId = 'wing';

      // 1) ルームの updatedAt を更新
      await db
        .collection('rooms')
        .doc(roomId)
        .set(
          { updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );

      // 2) メッセージを追加
      await db
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .add({
          uid: 'system',
          displayName: 'システム',
          text,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          readBy: []
        });

      console.log('✅ Firestore 書き込み完了 (wing):', text);
    } catch (err) {
      console.error('❌ room書き込みエラー:', err);
    }
  } else {
    console.log('対象外のステータス:', payload.status);
  }

  return res.status(200).send('OK');
});

// ======================================
// サーバー起動（0.0.0.0バインド）
// ======================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`サーバー起動: http://0.0.0.0:${PORT}`);
});
