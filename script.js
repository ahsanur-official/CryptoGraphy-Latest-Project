const pages = document.querySelectorAll(".page");
const startForm = document.getElementById("startForm");
const senderForm = document.getElementById("senderForm");
const receiverForm = document.getElementById("receiverForm");
const senderLog = document.getElementById("senderLog");
const receiverLog = document.getElementById("receiverLog");
const senderNameLabel = document.getElementById("senderNameLabel");
const receiverNameLabel = document.getElementById("receiverNameLabel");
const senderPaneTitle = document.getElementById("senderPaneTitle");
const receiverPaneTitle = document.getElementById("receiverPaneTitle");
const logoutButton = document.getElementById("logoutButton");
const statusEl = document.getElementById("statusMessage");
const cryptoDetailsEl = document.getElementById("cryptoDetails");
const activityListEl = document.getElementById("activityList");
const openProofsBtn = document.getElementById("openProofsBtn");
const proofsModal = document.getElementById("proofsModal");
const closeProofsBtn = document.getElementById("closeProofsBtn");
const proofsListEl = document.getElementById("proofsList");
const proofsDetailEl = document.getElementById("proofsDetail");
const exportAllProofsBtn = document.getElementById("exportAllProofsBtn");

const USERS_KEY = "cc_users";
const MESSAGES_KEY = "cc_messages";
const PROOFS_KEY = "cc_proofs";
const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

const FIREBASE_ENABLED =
  typeof firebase !== "undefined" &&
  FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.apiKey !== "REPLACE_ME";

let firebaseDb = null;
let firebaseUnsubMessages = null;
let firebaseUnsubProofs = null;

let session = {
  senderName: "",
  receiverName: "",
  senderToken: "",
  receiverToken: "",
};
let messages = [];

function showView(id) {
  pages.forEach((page) => page.classList.toggle("active", page.id === id));
}

/* Proofs modal helpers */
function openProofsModal() {
  renderProofsModalList();
  if (proofsModal) proofsModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeProofsModal() {
  if (proofsModal) proofsModal.hidden = true;
  document.body.style.overflow = "";
}

function renderProofsModalList() {
  if (!proofsListEl) return;
  const proofs = getProofs();
  if (!proofs.length) {
    proofsListEl.innerHTML = '<div class="empty">No proofs recorded.</div>';
    if (proofsDetailEl) proofsDetailEl.textContent = "No proof selected.";
    return;
  }
  proofsListEl.innerHTML = "";
  proofs.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "modal-item";
    btn.innerHTML = `<strong>${p.type} • ${p.sender} → ${p.recipient}</strong><div class="muted">${formatTimestamp(p.ts)}</div>`;
    btn.addEventListener("click", () => showProofDetailsInModal(p.id));
    proofsListEl.appendChild(btn);
  });
}

function showProofDetailsInModal(id) {
  if (!proofsDetailEl) return;
  const proofs = getProofs();
  const p = proofs.find((x) => x.id === id);
  if (!p) {
    proofsDetailEl.textContent = "Proof not found.";
    return;
  }
  proofsDetailEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.6rem">
      <div>
        <strong>Type:</strong> ${p.type}<br>
        <strong>Sender:</strong> ${p.sender}<br>
        <strong>Recipient:</strong> ${p.recipient}<br>
        <strong>Timestamp:</strong> ${formatTimestamp(p.ts)}
      </div>
      <div style="display:flex;gap:0.5rem">
        <button id="exportProofBtn" class="small-btn">Export</button>
        <button id="deleteProofBtn" class="small-btn">Delete</button>
      </div>
    </div>
    <hr style="margin:0.6rem 0;opacity:0.06" />
    <strong>Plaintext:</strong>
    <div class="code">${p.plaintext || ""}</div>
    <strong>Hash:</strong>
    <div class="code">${p.hash || ""}</div>
    <strong>Ciphertext:</strong>
    <div class="code">${p.ciphertext || ""}</div>
    <strong>Signature:</strong>
    <div class="code">${p.signature || ""}</div>
    <div style="margin-top:0.6rem"><strong>Signature valid:</strong> ${p.signatureValid !== false}</div>
  `;
  // wire buttons
  const exportProofBtn = document.getElementById("exportProofBtn");
  const deleteProofBtn = document.getElementById("deleteProofBtn");
  if (exportProofBtn) exportProofBtn.addEventListener("click", () => exportProof(p.id));
  if (deleteProofBtn) deleteProofBtn.addEventListener("click", async () => {
    if (!confirm("Delete this proof? This action cannot be undone.")) return;
    await deleteProofById(p.id);
    renderProofsModalList();
    proofsDetailEl.textContent = "Proof deleted.";
  });
}

function exportProof(id) {
  const proofs = getProofs();
  const p = proofs.find((x) => x.id === id);
  if (!p) return;
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proof-${id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportAllProofs() {
  const proofs = getProofs();
  const blob = new Blob([JSON.stringify(proofs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proofs-all-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function deleteProofById(id) {
  const current = getProofs();
  const next = current.filter((p) => p.id !== id);
  saveProofs(next);
  // delete from firebase if enabled
  try {
    const db = await ensureFirebase();
    if (db) {
      await db.collection("proofs").doc(id).delete().catch(() => {});
    }
  } catch (e) {
    console.warn("Failed deleting proof from firebase", e);
  }
}

function setLogoutVisible(isVisible) {
  if (logoutButton) logoutButton.hidden = !isVisible;
}

function resetSessionView() {
  session.senderName = "";
  session.receiverName = "";
  session.senderToken = "";
  session.receiverToken = "";
  messages = [];
  senderNameLabel.textContent = "";
  receiverNameLabel.textContent = "";
  senderPaneTitle.textContent = "Sender";
  receiverPaneTitle.textContent = "Receiver";
  senderLog.innerHTML = "";
  receiverLog.innerHTML = "";
  activityListEl.textContent = "No activity yet.";
  cryptoDetailsEl.textContent =
    "Cryptography details will appear here after each message.";
  addStatus("You have been logged out.");
  setLogoutVisible(false);
  startForm.reset();
  senderForm.reset();
  receiverForm.reset();
  showView("start");
}

function b64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromB64(str) {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const fixed = pad === 0 ? normalized : normalized + "=".repeat(4 - pad);
  const binary = atob(fixed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toBase64Url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64UrlBytes(buffer) {
  return b64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const fixed = pad === 0 ? normalized : normalized + "=".repeat(4 - pad);
  return atob(fixed);
}

function addStatus(text, type = "info") {
  statusEl.textContent = text;
  statusEl.className = type === "error" ? "status error" : "status";
}

async function hashText(text) {
  const digest = await crypto.subtle.digest(
    "SHA-512",
    new TextEncoder().encode(text),
  );
  return b64(digest);
}

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString();
}

function renderCryptoDetails(details) {
  if (!details) {
    cryptoDetailsEl.textContent =
      "Cryptography details will appear here after each message.";
    return;
  }

  const entries = [
    ["Direction", details.direction],
    ["Plaintext", details.plaintext],
    ["SHA-512 hash", details.hash],
    ["Sender signing key", details.senderSigningKey],
    ["Recipient encryption key", details.recipientEncryptionKey],
    ["JWT subject", details.jwtSubject],
    ["JWT valid", details.jwtValid],
    ["IV (base64)", details.iv],
    ["Ciphertext (base64)", details.ciphertext],
    ["AES key wrapped with RSA-OAEP (base64)", details.wrappedKey],
    ["Signature (base64)", details.signature],
    ["Signature valid", details.signatureValid],
    ["Timestamp", details.timestamp],
  ];

  cryptoDetailsEl.innerHTML = entries
    .map(([label, value]) => {
      return `<strong>${label}:</strong> <span>${String(value)}</span>`;
    })
    .join("\n");
}

function renderActivityList() {
  if (!messages.length) {
    activityListEl.textContent = "No activity yet.";
    return;
  }

  activityListEl.innerHTML = "";
  messages.forEach((item, index) => {
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "activity-item";
    entry.innerHTML = `
      <strong>${item.sender} → ${item.recipient}</strong>
      <span>${item.from === "sender" ? "Sent" : "Received"} • ${formatTimestamp(item.ts)}</span>
      <span>Status: ${item.signatureValid === false ? "Invalid" : "Verified"}</span>
    `;
    entry.addEventListener("click", () => {
      document
        .querySelectorAll(".activity-item")
        .forEach((el) => el.classList.remove("active"));
      entry.classList.add("active");
      renderCryptoDetails({
        direction: `${item.sender} → ${item.recipient}`,
        plaintext: item.plaintext,
        hash: item.hash,
        senderSigningKey: JSON.stringify({
          kty: item.senderSigningKey?.kty || "rsa",
          e: item.senderSigningKey?.e || "",
          n: item.senderSigningKey?.n || "",
        }),
        recipientEncryptionKey: JSON.stringify({
          kty: item.recipientEncryptionKey?.kty || "rsa",
          e: item.recipientEncryptionKey?.e || "",
          n: item.recipientEncryptionKey?.n || "",
        }),
        jwtSubject: item.sender,
        jwtValid: item.jwtValid !== false,
        iv: item.iv,
        ciphertext: item.ciphertext,
        wrappedKey: item.wrappedKey,
        signature: item.signature,
        signatureValid: item.signatureValid !== false,
        timestamp: formatTimestamp(item.ts),
      });
    });
    activityListEl.appendChild(entry);
  });
}

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  void mirrorUsersToFirebase(users);
}

function getMessages() {
  try {
    return JSON.parse(localStorage.getItem(MESSAGES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveMessages(list) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(list));
  void mirrorMessagesToFirebase(list);
}

function getProofs() {
  try {
    return JSON.parse(localStorage.getItem(PROOFS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProofs(list) {
  localStorage.setItem(PROOFS_KEY, JSON.stringify(list));
  void mirrorProofsToFirebase(list);
  try {
    if (typeof proofsModal !== "undefined" && proofsModal && !proofsModal.hidden) {
      renderProofsModalList();
    }
  } catch (e) {
    // ignore rendering errors
  }
}

async function ensureFirebase() {
  if (!FIREBASE_ENABLED) return null;
  if (!firebaseDb) {
    const app = firebase.apps.length
      ? firebase.app()
      : firebase.initializeApp(FIREBASE_CONFIG);
    firebaseDb = app.firestore();
  }
  return firebaseDb;
}

async function mirrorUsersToFirebase(users) {
  const db = await ensureFirebase();
  if (!db) return;
  await Promise.all(
    Object.entries(users).map(([username, profile]) =>
      db.collection("users").doc(username).set(profile, { merge: true }),
    ),
  );
}

async function mirrorMessagesToFirebase(list) {
  const db = await ensureFirebase();
  if (!db) return;
  await Promise.all(
    list.map((item) =>
      db.collection("messages").doc(item.id).set(item, { merge: true }),
    ),
  );
}

async function mirrorProofsToFirebase(list) {
  const db = await ensureFirebase();
  if (!db) return;
  await Promise.all(
    list.map((item, index) =>
      db
        .collection("proofs")
        .doc(item.id || `${item.ts || Date.now()}-${index}`)
        .set(item, { merge: true }),
    ),
  );
}

async function hydrateFromFirebase() {
  const db = await ensureFirebase();
  if (!db) return;

  if (!Object.keys(getUsers()).length) {
    const usersSnap = await db.collection("users").get();
    const users = {};
    usersSnap.forEach((doc) => {
      users[doc.id] = doc.data();
    });
    if (Object.keys(users).length) saveUsers(users);
  }

  if (!getMessages().length) {
    const msgSnap = await db.collection("messages").orderBy("ts").get();
    const list = [];
    msgSnap.forEach((doc) => list.push(doc.data()));
    if (list.length) saveMessages(list);
  }

  if (!getProofs().length) {
    const proofSnap = await db.collection("proofs").orderBy("ts").get();
    const list = [];
    proofSnap.forEach((doc) => list.push(doc.data()));
    if (list.length) saveProofs(list);
  }
}

async function attachFirebaseListeners() {
  const db = await ensureFirebase();
  if (!db) return;

  if (firebaseUnsubMessages) firebaseUnsubMessages();
  if (firebaseUnsubProofs) firebaseUnsubProofs();

  firebaseUnsubMessages = db
    .collection("messages")
    .orderBy("ts")
    .onSnapshot((snapshot) => {
      const current = getMessages();
      let changed = false;
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const item = change.doc.data();
        if (!current.some((entry) => entry.id === item.id)) {
          current.push(item);
          changed = true;
        }
      });
      if (changed) {
        saveMessages(current);
        if (session.senderName && session.receiverName) loadHistory();
      }
    });

  firebaseUnsubProofs = db
    .collection("proofs")
    .orderBy("ts")
    .onSnapshot((snapshot) => {
      const current = getProofs();
      let changed = false;
      snapshot.docChanges().forEach((change) => {
        const item = change.doc.data();
        if (change.type === "added") {
          if (!current.some((entry) => entry.id === item.id)) {
            current.push(item);
            changed = true;
          }
        } else if (change.type === "modified") {
          const idx = current.findIndex((e) => e.id === item.id);
          if (idx >= 0) {
            current[idx] = item;
            changed = true;
          }
        } else if (change.type === "removed") {
          const next = current.filter((e) => e.id !== item.id);
          if (next.length !== current.length) {
            current.length = 0;
            next.forEach((x) => current.push(x));
            changed = true;
          }
        }
      });
      if (changed) saveProofs(current);
    });
}

async function generateUserProfile(username) {
  const signing = await crypto.subtle.generateKey(
    {
      name: "RSA-PSS",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-512",
    },
    true,
    ["sign", "verify"],
  );
  const wrapping = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-512",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const signingPub = await crypto.subtle.exportKey("jwk", signing.publicKey);
  const signingPriv = await crypto.subtle.exportKey("jwk", signing.privateKey);
  const encPub = await crypto.subtle.exportKey("jwk", wrapping.publicKey);
  const encPriv = await crypto.subtle.exportKey("jwk", wrapping.privateKey);
  const jwtSecretRaw = crypto.getRandomValues(new Uint8Array(64));
  return {
    signingPub,
    signingPriv,
    encPub,
    encPriv,
    jwtSecret: b64(jwtSecretRaw),
  };
}

async function createJWT(payload, secret) {
  const header = { alg: "HS512", typ: "JWT" };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    fromB64(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${toBase64UrlBytes(signature)}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header64, payload64, signature64] = parts;
  const signingInput = `${header64}.${payload64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    fromB64(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromB64(signature64),
    new TextEncoder().encode(signingInput),
  );
  if (!valid) return null;
  const payload = JSON.parse(fromBase64Url(payload64));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function ensureUser(username) {
  const users = getUsers();
  if (users[username]) return users[username];
  const profile = await generateUserProfile(username);
  users[username] = profile;
  saveUsers(users);
  return profile;
}

async function createSession(senderName, receiverName) {
  const users = getUsers();
  const sender = users[senderName] || (await ensureUser(senderName));
  const receiver = users[receiverName] || (await ensureUser(receiverName));
  const issuedAt = Math.floor(Date.now() / 1000);
  session.senderName = senderName;
  session.receiverName = receiverName;
  session.senderToken = await createJWT(
    { sub: senderName, iat: issuedAt, exp: issuedAt + 3600 },
    sender.jwtSecret,
  );
  session.receiverToken = await createJWT(
    { sub: receiverName, iat: issuedAt, exp: issuedAt + 3600 },
    receiver.jwtSecret,
  );
  senderNameLabel.textContent = senderName;
  receiverNameLabel.textContent = receiverName;
  senderPaneTitle.textContent = senderName;
  receiverPaneTitle.textContent = receiverName;
  setLogoutVisible(true);
  addStatus(
    "Secure session created. JWT authentication and encrypted message flow are active.",
  );
  loadHistory();
  showView("chat");
}

function loadHistory() {
  const all = getMessages();
  messages = all.filter(
    (item) =>
      (item.sender === session.senderName &&
        item.recipient === session.receiverName) ||
      (item.sender === session.receiverName &&
        item.recipient === session.senderName),
  );
  renderLogs();
  renderActivityList();
}

function renderLogs() {
  senderLog.innerHTML = "";
  receiverLog.innerHTML = "";

  messages.forEach((item) => {
    const senderBubble = document.createElement("div");
    senderBubble.className =
      "bubble " + (item.from === "sender" ? "outgoing" : "incoming");
    senderBubble.textContent = item.plaintext;

    const receiverBubble = document.createElement("div");
    receiverBubble.className =
      "bubble " + (item.from === "receiver" ? "outgoing" : "incoming");
    receiverBubble.textContent = item.plaintext;

    senderLog.appendChild(senderBubble);
    receiverLog.appendChild(receiverBubble);
  });

  senderLog.scrollTop = senderLog.scrollHeight;
  receiverLog.scrollTop = receiverLog.scrollHeight;
}

async function encryptMessage(recipientPublicKey, plaintext) {
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  );
  const rawKey = await crypto.subtle.exportKey("raw", aesKey);
  const recipientPub = await crypto.subtle.importKey(
    "jwk",
    recipientPublicKey,
    { name: "RSA-OAEP", hash: "SHA-512" },
    false,
    ["encrypt"],
  );
  const wrappedKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPub,
    rawKey,
  );
  return {
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    wrappedKey: b64(wrappedKey),
  };
}

async function signMessage(senderPrivateKey, plaintext) {
  const signingPriv = await crypto.subtle.importKey(
    "jwk",
    senderPrivateKey,
    { name: "RSA-PSS", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 64 },
    signingPriv,
    new TextEncoder().encode(plaintext),
  );
  return b64(signature);
}

async function decryptMessage(recipientPrivateKey, packet) {
  const priv = await crypto.subtle.importKey(
    "jwk",
    recipientPrivateKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const rawKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    priv,
    fromB64(packet.wrappedKey),
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(packet.iv) },
    aesKey,
    fromB64(packet.ciphertext),
  );
  return new TextDecoder().decode(plainBuffer);
}

async function verifySignature(senderPublicKey, plaintext, signature) {
  const signingPub = await crypto.subtle.importKey(
    "jwk",
    senderPublicKey,
    { name: "RSA-PSS", hash: "SHA-512" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "RSA-PSS", saltLength: 64 },
    signingPub,
    fromB64(signature),
    new TextEncoder().encode(plaintext),
  );
}

async function sendSecureMessage(fromSide, text) {
  const fromName =
    fromSide === "sender" ? session.senderName : session.receiverName;
  const toName =
    fromSide === "sender" ? session.receiverName : session.senderName;
  const token =
    fromSide === "sender" ? session.senderToken : session.receiverToken;

  const users = getUsers();
  const senderUser = users[fromName];
  const recipientUser = users[toName];
  if (!senderUser || !recipientUser) {
    addStatus("User information is missing from the database.", "error");
    return;
  }

  const validToken = await verifyJWT(token, senderUser.jwtSecret);
  if (!validToken) {
    addStatus("JWT token is invalid or expired. Restart the session.", "error");
    return;
  }

  const hash = await hashText(text);
  const encrypted = await encryptMessage(recipientUser.encPub, text);
  const signature = await signMessage(senderUser.signingPriv, text);
  const packet = {
    id: crypto.randomUUID(),
    from: fromSide,
    sender: fromName,
    recipient: toName,
    participants: [fromName, toName],
    token,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    wrappedKey: encrypted.wrappedKey,
    signature,
    plaintext: text,
    hash,
    senderSigningKey: {
      kty: senderUser.signingPub.kty,
      e: senderUser.signingPub.e,
      n: senderUser.signingPub.n,
    },
    recipientEncryptionKey: {
      kty: recipientUser.encPub.kty,
      e: recipientUser.encPub.e,
      n: recipientUser.encPub.n,
    },
    jwtValid: true,
    signatureValid: true,
    ts: Date.now(),
  };

  const stored = getMessages();
  saveMessages([...stored, packet]);
  saveProofs([
    ...getProofs(),
    {
      id: `${packet.id}-send`,
      type: "send",
      sender: fromName,
      recipient: toName,
      plaintext: text,
      hash,
      ciphertext: packet.ciphertext,
      signature,
      ts: packet.ts,
    },
  ]);
  loadHistory();
  addStatus(`Sent encrypted message from ${fromName} to ${toName}.`);
  renderCryptoDetails({
    direction: `${fromName} → ${toName}`,
    plaintext: text,
    hash,
    senderSigningKey: JSON.stringify({
      kty: senderUser.signingPub.kty,
      e: senderUser.signingPub.e,
      n: senderUser.signingPub.n,
    }),
    recipientEncryptionKey: JSON.stringify({
      kty: recipientUser.encPub.kty,
      e: recipientUser.encPub.e,
      n: recipientUser.encPub.n,
    }),
    jwtSubject: fromName,
    jwtValid: true,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    wrappedKey: encrypted.wrappedKey,
    signature,
    signatureValid: true,
    timestamp: new Date(packet.ts).toLocaleString(),
  });
}

async function handleIncomingMessage(packet) {
  if (!packet || !packet.sender || !packet.recipient || !packet.token) return;
  if (
    packet.recipient !== session.senderName &&
    packet.recipient !== session.receiverName
  )
    return;

  const users = getUsers();
  const senderUser = users[packet.sender];
  const recipientUser = users[packet.recipient];
  if (!senderUser || !recipientUser) return;

  const verified = await verifyJWT(packet.token, senderUser.jwtSecret);
  if (!verified || verified.sub !== packet.sender) {
    addStatus("Incoming packet failed JWT verification.", "error");
    return;
  }

  const decrypted = await decryptMessage(recipientUser.encPriv, packet);
  const signatureValid = await verifySignature(
    senderUser.signingPub,
    decrypted,
    packet.signature,
  );
  if (!signatureValid) {
    addStatus("Incoming packet signature is invalid.", "error");
    return;
  }

  const hash = await hashText(decrypted);
  const fromSide = packet.sender === session.senderName ? "sender" : "receiver";
  const stored = getMessages();
  if (!stored.some((item) => item.id === packet.id)) {
    saveMessages([
      ...stored,
      {
        ...packet,
        participants: [packet.sender, packet.recipient],
        plaintext: decrypted,
        hash,
        from: fromSide,
      },
    ]);
  }

  saveProofs([
    ...getProofs(),
    {
      id: `${packet.id}-receive`,
      type: "receive",
      sender: packet.sender,
      recipient: packet.recipient,
      plaintext: decrypted,
      hash,
      ciphertext: packet.ciphertext,
      signature: packet.signature,
      signatureValid,
      ts: packet.ts,
    },
  ]);

  loadHistory();
  addStatus(`Received and verified message from ${packet.sender}.`);
  renderCryptoDetails({
    direction:
      packet.sender === session.senderName
        ? `${packet.sender} → ${packet.recipient}`
        : `${packet.sender} → ${packet.recipient}`,
    plaintext: decrypted,
    hash,
    senderSigningKey: JSON.stringify(
      {
        kty: senderUser.signingPub.kty,
        e: senderUser.signingPub.e,
        n: senderUser.signingPub.n,
      },
      null,
      0,
    ),
    recipientEncryptionKey: JSON.stringify(
      {
        kty: recipientUser.encPub.kty,
        e: recipientUser.encPub.e,
        n: recipientUser.encPub.n,
      },
      null,
      0,
    ),
    jwtSubject: packet.sender,
    jwtValid: true,
    iv: packet.iv,
    ciphertext: packet.ciphertext,
    wrappedKey: packet.wrappedKey,
    signature: packet.signature,
    signatureValid,
    timestamp: new Date(packet.ts).toLocaleString(),
  });
}

startForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const sender = event.target.senderName.value.trim();
  const receiver = event.target.receiverName.value.trim();
  if (!sender || !receiver || sender === receiver) {
    addStatus("Enter two distinct user names.", "error");
    return;
  }
  await createSession(sender, receiver);
});

senderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = document.getElementById("senderMessage").value.trim();
  if (!text) return;
  try {
    await sendSecureMessage("sender", text);
    event.target.reset();
  } catch (error) {
    addStatus(`Error sending message: ${error.message}`, "error");
    console.error("Send error:", error);
  }
});

receiverForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = document.getElementById("receiverMessage").value.trim();
  if (!text) return;
  try {
    await sendSecureMessage("receiver", text);
    event.target.reset();
  } catch (error) {
    addStatus(`Error sending message: ${error.message}`, "error");
    console.error("Send error:", error);
  }
});

async function initApp() {
  await hydrateFromFirebase();
  await attachFirebaseListeners();
  showView("start");
}

initApp();

logoutButton.addEventListener("click", () => {
  resetSessionView();
});

// Modal event wiring
if (openProofsBtn) openProofsBtn.addEventListener("click", openProofsModal);
if (closeProofsBtn) closeProofsBtn.addEventListener("click", closeProofsModal);
if (proofsModal)
  proofsModal.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeProofsModal();
  });
if (exportAllProofsBtn) exportAllProofsBtn.addEventListener("click", exportAllProofs);
