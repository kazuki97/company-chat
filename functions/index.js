// functions/index.js
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin          = require('firebase-admin');
const moment         = require('moment-timezone');
admin.initializeApp();

exports.deleteTodayCompleted = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'Asia/Tokyo' },
  async () => {
    const db = admin.firestore();

    // JST の「今日 00:00」を取得
    const cutoff = moment().tz('Asia/Tokyo').startOf('day').toDate();

    console.log(`▶ [DEBUG] cutoff (JST midnight) = ${cutoff.toISOString()}`);

    const snapshot = await db.collection('orders')
      .where('status','==','completed')
      .where('completedAt','<',  cutoff)
      .get();

    if (snapshot.empty) {
      console.log('▶ [DEBUG] スナップショットが空でした。');
      return;
    }

    snapshot.docs.forEach(doc => {
      const ca = doc.data().completedAt.toDate().toISOString();
      console.log(`▶ [DEBUG] 削除対象: ${doc.id} (completedAt=${ca})`);
    });

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`✔ Deleted ${snapshot.size} completed orders.`);
  }
);
