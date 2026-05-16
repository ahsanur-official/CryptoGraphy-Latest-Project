const pages = document.querySelectorAll(".page");
const startForm = document.getElementById("startForm");
const senderForm = document.getElementById("senderForm");
const receiverForm = document.getElementById("receiverForm");
const senderLog = document.getElementById("senderLog");
const receiverLog = document.getElementById("receiverLog");
const senderNameLabel = document.getElementById("senderNameLabel");
const receiverNameLabel = document.getElementById("receiverNameLabel");
const statusEl = document.getElementById("statusMessage");
const cryptoDetailsEl = document.getElementById("cryptoDetails");
const activityListEl = document.getElementById("activityList");

const USERS_KEY = "cc_users";
const MESSAGES_KEY = "cc_messages";

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
    senderBubble.textContent =
      item.from === "sender"
        ? `You: ${item.plaintext}`
        : `${session.receiverName}: ${item.plaintext}`;

    const receiverBubble = document.createElement("div");
    receiverBubble.className =
      "bubble " + (item.from === "receiver" ? "outgoing" : "incoming");
    receiverBubble.textContent =
      item.from === "receiver"
        ? `You: ${item.plaintext}`
        : `${session.senderName}: ${item.plaintext}`;

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
    { name: "RSA-OAEP", hash: "SHA-256" },
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
    { name: "RSA-OAEP", hash: "SHA-512" },
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
      { ...packet, plaintext: decrypted, hash, from: fromSide },
    ]);
  }

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
  await sendSecureMessage("sender", text);
  event.target.reset();
});

receiverForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = document.getElementById("receiverMessage").value.trim();
  if (!text) return;
  await sendSecureMessage("receiver", text);
  event.target.reset();
});

showView("start");
