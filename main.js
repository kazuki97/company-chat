console.log("🚀 main.js v5 loaded");

const db              = firebase.firestore();
const auth            = firebase.auth();
let currentRoom       = "general";
let unsubscribeMsg    = null;
let unsubscribeRooms  = null;

// モーダル要素取得
const overlay          = document.getElementById("room-modal") || document.getElementById("overlay");
const newRoomInputElem = document.getElementById("new-room-input");
const btnAddRoom       = document.getElementById("add-room-btn");
const btnCancelRoom    = document.getElementById("cancel-room-btn");
const btnCreateRoom    = document.getElementById("create-room-btn");

/* ── 認証状態監視 ── */
auth.onAuthStateChanged(user => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  document.getElementById("logout").onclick = () => auth.signOut();

  // モーダルボタン
  btnAddRoom   .onclick = showModal;
  btnCancelRoom.onclick = hideModal;
  btnCreateRoom.onclick = () => createRoom(user);

  initRoomList(user);
  initChatInput(user);
  document.getElementById("room-search")
    .addEventListener("input", () => initRoomList(user));
});

/* ── モーダル開閉 ── */
function showModal() {
  overlay.classList.remove("hidden");
  newRoomInputElem.value = "";
  newRoomInputElem.focus();
}
function hideModal() {
  overlay.classList.add("hidden");
}

/* ── ルーム作成 ── */
async function createRoom(user) {
  const name = newRoomInputElem.value.trim();
  if (!name) return newRoomInputElem.focus();
  const id = name.replace(/\s+/g, "-").toLowerCase();
  await db.collection("rooms").doc(id)
    .set({ title: name, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  hideModal();
  currentRoom = id;
  document.getElementById("room-name").textContent = id;
  initRoomList(user);
}

/* ── ルーム一覧＋ライブフィルタ ── */
function initRoomList(user) {
  const ul      = document.getElementById("conv-list");
  const keyword = document.getElementById("room-search").value.trim().toLowerCase();

  if (unsubscribeRooms) unsubscribeRooms();
  unsubscribeRooms = db.collection("rooms")
    .orderBy("updatedAt", "desc")
    .onSnapshot(async snap => {
      ul.innerHTML = "";
      for (const doc of snap.docs) {
        const roomId = doc.id;
        const data   = doc.data();

        const lastSnap = await db.collection("rooms").doc(roomId)
          .collection("messages")
          .orderBy("timestamp", "desc")
          .limit(1).get();
        const preview = lastSnap.empty ? "" : lastSnap.docs[0].data().text.slice(0, 50);

        if (keyword &&
            !roomId.includes(keyword) &&
            !preview.toLowerCase().includes(keyword)) {
          continue;
        }

        const li = document.createElement("li");
        li.classList.toggle("active", roomId === currentRoom);
        li.onclick = () => selectRoom(roomId, user);

        const av = document.createElement("div");
        av.className = "conv-avatar";
        av.textContent = roomId.charAt(0).toUpperCase();
        li.appendChild(av);

        const info = document.createElement("div");
        info.className = "conv-info";
        info.textContent = `${data.title || roomId}  ${preview}`;
        li.appendChild(info);

        const unreadSnap = await db.collection("rooms").doc(roomId)
          .collection("messages")
          .where("readBy", "not-in", [[user.uid]])
          .get();
        if (!unreadSnap.empty) {
          const b = document.createElement("span");
          b.className = "unread-badge";
          b.textContent = unreadSnap.size;
          li.appendChild(b);
        }

        ul.appendChild(li);
      }
      loadRoomMessages(user);
    });
}

/* ── ルーム切替 ── */
function selectRoom(roomId, user) {
  currentRoom = roomId;
  document.getElementById("room-name").textContent = roomId;
  document.querySelectorAll("#conv-list li").forEach(li => {
    li.classList.toggle("active", li.onclick.toString().includes(roomId));
  });
  loadRoomMessages(user);
}

/* ── メッセージ送信設定 ── */
function initChatInput(user) {
  const input = document.getElementById("message-input");
  document.getElementById("send-btn").onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
    await db.collection("rooms").doc(currentRoom)
      .set({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("rooms").doc(currentRoom)
      .collection("messages")
      .add({
        uid: user.uid,
        displayName: user.displayName || user.email,
        text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        readBy: []
      });
    input.value = "";
  };
}

/* ── メッセージ読み込み＆描画 ── */
function loadRoomMessages(user) {
  const chatUl = document.getElementById("chat");
  if (unsubscribeMsg) unsubscribeMsg();
  unsubscribeMsg = db.collection("rooms").doc(currentRoom)
    .collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      chatUl.innerHTML = "";
      snapshot.docs.forEach((docSnap, i, arr) => {
        const d = docSnap.data();
        if (!d.readBy?.includes(user.uid)) {
          docSnap.ref.update({ readBy: firebase.firestore.FieldValue.arrayUnion(user.uid) });
        }
        const li = document.createElement("li");
        li.className = "msg " + (d.uid === user.uid ? "mine" : "other");
        const prev = i>0 ? arr[i-1].data() : null;
        if (!prev || prev.uid !== d.uid) li.classList.add("separate");

        if (d.uid !== user.uid) {
          const ava = document.createElement("div");
          ava.className = "avatar";
          ava.textContent = (d.displayName||"?")[0].toUpperCase();
          li.appendChild(ava);
        }

        const bub = document.createElement("div");
        bub.className = "bubble";
        bub.textContent = d.text;
        const ts  = document.createElement("span");
        ts.className = "timestamp";
        ts.textContent = d.timestamp
          ? new Date(d.timestamp.toDate()).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
          : "";
        bub.appendChild(ts);
        if (d.uid===user.uid && i===arr.length-1 && (d.readBy||[]).filter(id=>id!==user.uid).length) {
          const rd = document.createElement("span");
          rd.className = "read";
          rd.textContent = "既読";
          bub.appendChild(rd);
        }
        li.appendChild(bub);
        chatUl.appendChild(li);
      });
      chatUl.scrollTop = chatUl.scrollHeight;
    });
}

/* ── リサイズバー ── */
const resizer = document.getElementById("conv-resizer");
const appElem = document.querySelector(".app");
resizer.addEventListener("mousedown", () => {
  document.body.style.userSelect = "none";
  document.body.style.cursor     = "col-resize";
  window.addEventListener("mousemove", doDrag);
  window.addEventListener("mouseup",   stopDrag);
});
function doDrag(e) {
  const rect = appElem.getBoundingClientRect();
  let newW = e.clientX - rect.left;
  newW = Math.min(360, Math.max(200, newW));
  document.documentElement.style.setProperty("--conv-width", newW + "px");
}
function stopDrag() {
  document.body.style.userSelect = "";
  document.body.style.cursor     = "";
  window.removeEventListener("mousemove", doDrag);
  window.removeEventListener("mouseup",   stopDrag);
}
