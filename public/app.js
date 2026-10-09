let myKey = null;
let socket = null;
let cachedMessages = [];
let selectedConversationKey = "";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

const LOWERCASE_MARKER = "..--.-";

const MORSE = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",

  0: "-----",
  1: ".----",
  2: "..---",
  3: "...--",
  4: "....-",
  5: ".....",
  6: "-....",
  7: "--...",
  8: "---..",
  9: "----.",

  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "!": "-.-.--",
  "'": ".----.",
  '"': ".-..-.",
  "(": "-.--.",
  ")": "-.--.-",
  "&": ".-...",
  ":": "---...",
  ";": "-.-.-.",
  "/": "-..-.",
  "=": "-...-",
  "+": ".-.-.",
  "-": "-....-",
  "_": "..--.-",
  "$": "...-..-",
  "@": ".--.-."
};

const REVERSE_MORSE = Object.fromEntries(
  Object.entries(MORSE).map(([character, code]) => [
    code,
    character
  ])
);

const myKeyElement = document.getElementById("myKey");
const receiverElement = document.getElementById("receiver");
const messageElement = document.getElementById("message");
const sendButton = document.getElementById("send");
const sendStatus = document.getElementById("sendStatus");
const messagesElement = document.getElementById("messages");
const conversationListElement = document.getElementById("conversationList");
const refreshButton = document.getElementById("refresh");
const copyKeyButton = document.getElementById("copyKey");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

function caesarEncode(text) {
  return [...text]
    .map(character => {
      const index = BASE64_ALPHABET.indexOf(character);

      if (index === -1) {
        throw new Error(
          `Invalid Base64 character: ${character}`
        );
      }

      return BASE64_ALPHABET[
        (index + 4) % BASE64_ALPHABET.length
      ];
    })
    .join("");
}

function caesarDecode(text) {
  return [...text]
    .map(character => {
      const index = BASE64_ALPHABET.indexOf(character);

      if (index === -1) {
        throw new Error(
          `Invalid Caesar character: ${character}`
        );
      }

      return BASE64_ALPHABET[
        (index - 4 + BASE64_ALPHABET.length) %
        BASE64_ALPHABET.length
      ];
    })
    .join("");
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToText(base64) {
  const binary = atob(base64);

  const bytes = Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}

/*
 * Morse encoding with lowercase preservation.
 *
 * Normal uppercase character:
 *   A -> .-
 *
 * Lowercase character:
 *   a -> LOWERCASE_MARKER + .-
 *
 * This is necessary because standard Morse itself
 * does not distinguish uppercase and lowercase.
 */
function morseEncode(text) {
  return text
    .split("")
    .map(character => {
      if (character === " ") {
        return "/";
      }

      const upper = character.toUpperCase();

      if (!MORSE[upper]) {
        throw new Error(
          `Character cannot be represented in Morse: ${character}`
        );
      }

      if (
        character >= "a" &&
        character <= "z"
      ) {
        return `${LOWERCASE_MARKER} ${MORSE[upper]}`;
      }

      return MORSE[upper];
    })
    .join(" ");
}

function morseDecode(morse) {
  const tokens = morse.trim().split(/\s+/);

  const result = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "/") {
      result.push(" ");
      continue;
    }

    if (token === LOWERCASE_MARKER) {
      i++;

      if (i >= tokens.length) {
        throw new Error("Invalid lowercase Morse marker");
      }

      const character = REVERSE_MORSE[tokens[i]];

      if (!character) {
        throw new Error("Invalid Morse character");
      }

      result.push(character.toLowerCase());
      continue;
    }

    const character = REVERSE_MORSE[token];

    if (!character) {
      throw new Error(
        `Unknown Morse code: ${token}`
      );
    }

    result.push(character);
  }

  return result.join("");
}

function encodeMessage(text) {
  const base64 = textToBase64(text);
  const shifted = caesarEncode(base64);
  const morse = morseEncode(shifted);

  return {
    base64,
    shifted,
    morse
  };
}

function decodeMessage(morse) {
  const shifted = morseDecode(morse);
  const base64 = caesarDecode(shifted);
  const text = base64ToText(base64);

  return {
    shifted,
    base64,
    text
  };
}

async function createUser() {
  const response = await fetch("/api/users", {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error("Could not create user");
  }

  const data = await response.json();

  myKey = data.userKey;
  localStorage.setItem("morselinkKey", myKey);

  showKey();
  await ensureEncryptionKeys().catch(error => {
    console.error("Encryption key setup failed:", error);
  });
  connectWebSocket();
  loadMessages();
}

async function initialize() {
  const savedKey = localStorage.getItem("morselinkKey");

  if (!savedKey) {
    await createUser();
    return;
  }

  const response = await fetch(
    `/api/users/${savedKey}`
  );

  if (!response.ok) {
    await createUser();
    return;
  }

  const data = await response.json();

  if (!data.exists) {
    await createUser();
    return;
  }

  myKey = savedKey;

  showKey();
  await ensureEncryptionKeys().catch(error => {
    console.error("Encryption key setup failed:", error);
  });
  connectWebSocket();
  loadMessages();
}

function showKey() {
  myKeyElement.textContent = myKey;
}

function setConnectionStatus(online) {
  statusDot.className =
    online
      ? "status-dot online"
      : "status-dot offline";

  statusText.textContent =
    online ? "Online" : "Offline";
}

function connectWebSocket() {
  setConnectionStatus(false);
  const protocol =
    location.protocol === "https:"
      ? "wss:"
      : "ws:";

  socket = new WebSocket(
    `${protocol}//${location.host}`
  );

  socket.addEventListener("open", () => {
    setConnectionStatus(true);

    socket.send(JSON.stringify({
      type: "identify",
      userKey: myKey
    }));
  });

  socket.addEventListener("close", () => {
    setConnectionStatus(false);
  });

  socket.addEventListener("error", () => {
    setConnectionStatus(false);
  });

  socket.addEventListener("message", event => {
    const data = JSON.parse(event.data);

    if (data.type === "message") {
      loadMessages();

      const incoming = data.message;

      if (
        incomingAudioEnabled &&
        incoming &&
        incoming.receiverKey === myKey
      ) {
        try {
          playMorseAudio(
            decodeMessage(incoming.morse).text
          );
        } catch (error) {
          console.warn("Incoming Morse audio failed:", error);
        }
      }
    }
  });
}

async function loadMessages() {
  if (!myKey) return;

  const response = await fetch(
    `/api/messages/${myKey}`
  );

  if (!response.ok) return;

  const messages = await response.json();

  cachedMessages = messages;

  if (selectedConversationKey) {
    markConversationRead(selectedConversationKey, messages);
  }

  renderConversations(messages);
  renderMessages(messages);
}


function getReadMarkers() {
  try {
    return JSON.parse(
      localStorage.getItem(`morselinkReadThrough:${myKey}`) || "{}"
    );
  } catch {
    return {};
  }
}

function markConversationRead(key, messages) {
  if (!key || !myKey) return;

  const markers = getReadMarkers();
  const latestIncomingId = messages.reduce((latest, message) => {
    if (
      message.senderKey === key &&
      message.receiverKey === myKey
    ) {
      return Math.max(latest, Number(message.id) || 0);
    }

    return latest;
  }, 0);

  markers[key] = Math.max(
    Number(markers[key]) || 0,
    latestIncomingId
  );

  try {
    localStorage.setItem(
      `morselinkReadThrough:${myKey}`,
      JSON.stringify(markers)
    );
  } catch (error) {
    console.warn("Could not save read status.", error);
  }
}

function renderConversations(messages) {
  if (!conversationListElement) return;

  const contacts = getContacts();
  const contactNames = new Map(
    contacts.map(contact => [contact.key, contact.name])
  );

  const conversations = new Map();

  for (const contact of contacts) {
    conversations.set(contact.key, {
      key: contact.key,
      name: contact.name,
      latest: null
    });
  }

  for (const message of messages) {
    const otherKey =
      message.senderKey === myKey
        ? message.receiverKey
        : message.senderKey;

    if (!otherKey || otherKey === myKey) continue;

    if (!conversations.has(otherKey)) {
      conversations.set(otherKey, {
        key: otherKey,
        name: contactNames.get(otherKey) || otherKey,
        latest: message
      });
    } else {
      const conversation = conversations.get(otherKey);

      if (
        !conversation.latest ||
        Number(message.id) > Number(conversation.latest.id)
      ) {
        conversation.latest = message;
      }
    }
  }

  const readMarkers = getReadMarkers();

  const items = [...conversations.values()].sort((a, b) => {
    if (!a.latest && !b.latest) return a.name.localeCompare(b.name);
    if (!a.latest) return 1;
    if (!b.latest) return -1;
    return Number(b.latest.id) - Number(a.latest.id);
  });

  if (items.length === 0) {
    conversationListElement.innerHTML =
      '<p class="conversation-empty">No conversations yet. Save a contact or exchange a message to get started.</p>';
    return;
  }

  conversationListElement.innerHTML = items.map(item => {
    const unreadCount = messages.filter(message =>
      message.senderKey === item.key &&
      message.receiverKey === myKey &&
      (Number(message.id) || 0) >
        (Number(readMarkers[item.key]) || 0)
    ).length;

    let preview = "No messages yet";
    let time = "";

    if (item.latest) {
      try {
        preview = decodeMessage(item.latest.morse).text;
      } catch {
        preview = "Unable to decode message";
      }

      const date = new Date(item.latest.createdAt);

      time = Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleString();
    }

    return `
      <button
        type="button"
        class="conversation-item ${
          selectedConversationKey === item.key ? "active" : ""
        }"
        data-conversation-key="${escapeHtml(item.key)}"
      >
        <span class="conversation-details">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="conversation-key">${escapeHtml(item.key)}</span>
          <span class="conversation-preview">${escapeHtml(preview)}</span>
        </span>
        <span class="conversation-meta">
          <span class="conversation-time">${escapeHtml(time)}</span>
          ${unreadCount > 0
            ? `<span class="conversation-unread">${unreadCount}</span>`
            : ""}
        </span>
      </button>
    `;
  }).join("");

  conversationListElement
    .querySelectorAll(".conversation-item")
    .forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.conversationKey;

        selectedConversationKey = key;
        receiverElement.value = key;

        markConversationRead(key, cachedMessages);
        renderConversations(cachedMessages);
        renderMessages(cachedMessages);
      });
    });
}

function renderMessages(messages) {
  const visibleMessages = selectedConversationKey
    ? messages.filter(message =>
        (
          message.senderKey === myKey &&
          message.receiverKey === selectedConversationKey
        ) ||
        (
          message.senderKey === selectedConversationKey &&
          message.receiverKey === myKey
        )
      )
    : messages;

  if (visibleMessages.length === 0) {
    messagesElement.innerHTML = `
      <div class="empty">
        <div class="empty-icon">•−−•</div>
        <div>No messages yet.</div>
        <span>Send a Morse message to get started.</span>
      </div>
    `;

    return;
  }

  messagesElement.innerHTML = visibleMessages.map(message => {
    const isReceived =
      message.receiverKey === myKey;

    const direction =
      isReceived ? "Received" : "Sent";

    const otherKey =
      isReceived
        ? message.senderKey
        : message.receiverKey;

    let decodedText;

    try {
      decodedText =
        decodeMessage(message.morse).text;
    } catch {
      decodedText =
        "[Unable to decode message]";
    }

    const date =
      new Date(message.createdAt);

    const safeMorse =
      escapeHtml(message.morse);

    return `
      <article
        class="message ${
          isReceived ? "received" : "sent"
        }"
      >

        <div class="message-top">

          <div>
            <div class="message-direction">
              ${direction}
            </div>

            <div class="message-key">
              ${escapeHtml(otherKey)}
            </div>
          </div>

          <span class="message-time">
            ${escapeHtml(
              date.toLocaleString()
            )}
          </span>

        </div>


        <div class="decoded">
          ${escapeHtml(decodedText)}
        </div>


        <div class="morse-box">

          <div class="morse-label">

            <span>
              Morse payload
            </span>

            <button
              class="copy-morse"
              data-morse="${safeMorse}"
            >
              Copy
            </button>

          </div>

          <div class="morse-code">
            ${safeMorse}
          </div>

        </div>

      </article>
    `;
  }).join("");

  document
    .querySelectorAll(".copy-morse")
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const morse =
            button.dataset.morse;

          try {
            await navigator.clipboard
              .writeText(morse);

            button.textContent =
              "Copied";

            setTimeout(() => {
              button.textContent =
                "Copy";
            }, 1000);

          } catch {
            button.textContent =
              "Failed";
          }
        }
      );
    });
}
async function sendMessage() {
  const receiverKey =
    receiverElement.value
      .trim()
      .toUpperCase();

  const text =
    messageElement.value.trim();

  sendStatus.textContent = "";

  if (!/^[A-Z0-9]{6}$/.test(receiverKey)) {
    sendStatus.textContent =
      "Enter a valid 6-character receiver key.";

    return;
  }

  if (!text) {
    sendStatus.textContent =
      "Enter a message.";

    return;
  }

  sendButton.disabled = true;

  sendStatus.textContent =
    "Base64 → Caesar +4 → Morse...";

  try {
    const encoded =
      encodeMessage(text);

    const response =
      await fetch("/api/messages", {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          senderKey: myKey,
          receiverKey,
          morse: encoded.morse
        })
      });

    const data =
      await response.json();

    if (!response.ok) {
      sendStatus.textContent =
        data.error || "Failed to send.";

      return;
    }

    selectedConversationKey = receiverKey;
    messageElement.value = "";

    sendStatus.textContent =
      "Sent through Base64 → Caesar +4 → Morse.";

    await loadMessages();

  } catch (error) {
    console.error(error);

    sendStatus.textContent =
      `Encoding error: ${error.message}`;
  } finally {
    sendButton.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// Contacts are saved locally in this browser.
const contactSelect = document.getElementById("contactSelect");
const contactName = document.getElementById("contactName");
const contactKey = document.getElementById("contactKey");
const saveContactButton = document.getElementById("saveContact");
const useContactButton = document.getElementById("useContact");
const deleteContactButton = document.getElementById("deleteContact");
const contactStatus = document.getElementById("contactStatus");

function getContacts() {
  try {
    const contacts = JSON.parse(
      localStorage.getItem("morselinkContacts") || "[]"
    );

    return Array.isArray(contacts)
      ? contacts.filter(contact =>
          contact &&
          typeof contact.name === "string" &&
          typeof contact.key === "string" &&
          /^[A-Z0-9]{6}$/.test(contact.key)
        )
      : [];
  } catch {
    return [];
  }
}

function loadContacts(selectedKey = "") {
  const contacts = getContacts();
  contactSelect.replaceChildren();

  if (contacts.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No contacts saved yet";
    contactSelect.appendChild(option);
  } else {
    for (const contact of contacts) {
      const option = document.createElement("option");
      option.value = contact.key;
      option.textContent = `${contact.name} (${contact.key})`;
      contactSelect.appendChild(option);
    }

    if (contacts.some(contact => contact.key === selectedKey)) {
      contactSelect.value = selectedKey;
    }
  }

  updateContactButtons();
}

function updateContactButtons() {
  const hasSelection = Boolean(contactSelect.value);
  useContactButton.disabled = !hasSelection;
  deleteContactButton.disabled = !hasSelection;
}

function useSelectedContact() {
  const key = contactSelect.value;

  if (!key) {
    contactStatus.textContent = "Choose a saved contact first.";
    return;
  }

  receiverElement.value = key;
  contactStatus.textContent = "Receiver key filled in.";
  receiverElement.focus();
}

saveContactButton.addEventListener("click", () => {
  const name = contactName.value.trim();
  const key = contactKey.value.trim().toUpperCase();

  if (!name) {
    contactStatus.textContent = "Enter a nickname.";
    contactName.focus();
    return;
  }

  if (!/^[A-Z0-9]{6}$/.test(key)) {
    contactStatus.textContent = "Enter a valid 6-character key.";
    contactKey.focus();
    return;
  }

  if (key === myKey) {
    contactStatus.textContent = "That's your own key.";
    return;
  }

  const contacts = getContacts();
  const existing = contacts.find(contact => contact.key === key);

  if (existing) {
    existing.name = name;
  } else {
    contacts.push({ name, key });
  }

  try {
    localStorage.setItem("morselinkContacts", JSON.stringify(contacts));
    loadContacts(key);
    contactName.value = "";
    contactKey.value = "";
    contactStatus.textContent = existing
      ? "Contact nickname updated."
      : "Contact saved.";
  } catch {
    contactStatus.textContent = "Could not save contacts in browser storage.";
  }
});

useContactButton.addEventListener("click", useSelectedContact);

contactSelect.addEventListener("change", () => {
  updateContactButtons();

  if (contactSelect.value) {
    receiverElement.value = contactSelect.value;
    contactStatus.textContent = "Receiver key filled in.";
  }
});

deleteContactButton.addEventListener("click", () => {
  const key = contactSelect.value;

  if (!key) {
    contactStatus.textContent = "Choose a contact to delete.";
    return;
  }

  const contacts = getContacts().filter(contact => contact.key !== key);

  try {
    localStorage.setItem("morselinkContacts", JSON.stringify(contacts));
    loadContacts();
    contactStatus.textContent = "Contact deleted.";
  } catch {
    contactStatus.textContent = "Could not update browser storage.";
  }
});

loadContacts();

sendButton.addEventListener(
  "click",
  sendMessage
);

refreshButton.addEventListener(
  "click",
  loadMessages
);

copyKeyButton.addEventListener(
  "click",
  async () => {
    try {
      await navigator.clipboard.writeText(myKey);

      copyKeyButton.textContent = "Copied";

      setTimeout(() => {
        copyKeyButton.textContent = "Copy";
      }, 1200);

    } catch {
      copyKeyButton.textContent =
        "Copy manually";
    }
  }
);

initialize().catch(error => {
  console.error(error);

  sendStatus.textContent =
    "Could not initialize MorseLink.";
});


// Incoming Morse audio: disabled until the user enables it.
let incomingAudioEnabled = false;
let morseAudioContext = null;

function playMorseAudio(text) {
  if (!incomingAudioEnabled || !morseAudioContext) return;

  const ctx = morseAudioContext;
  const unit = 0.09;
  let cursor = ctx.currentTime + 0.05;

  for (const character of text.toUpperCase()) {
    if (character === " ") {
      cursor += unit * 4;
      continue;
    }

    const code = MORSE[character];

    if (!code) {
      cursor += unit * 3;
      continue;
    }

    for (const symbol of code) {
      const duration = symbol === "." ? unit : unit * 3;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.frequency.value = 650;
      gain.gain.value = 0.12;

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(cursor);
      oscillator.stop(cursor + duration);

      cursor += duration + unit;
    }

    cursor += unit * 2;
  }
}

const incomingAudioToggle =
  document.getElementById("incomingAudioToggle");

incomingAudioToggle.addEventListener("click", async () => {
  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    incomingAudioToggle.textContent = "Audio not supported";
    return;
  }

  if (!incomingAudioEnabled) {
    try {
      if (!morseAudioContext) {
        morseAudioContext = new AudioContextClass();
      }

      await morseAudioContext.resume();
      incomingAudioEnabled = true;
      incomingAudioToggle.textContent =
        "Incoming Morse audio: ON";
    } catch (error) {
      console.warn("Could not enable audio:", error);
      incomingAudioToggle.textContent =
        "Tap to retry audio";
    }
  } else {
    incomingAudioEnabled = false;
    incomingAudioToggle.textContent =
      "Enable incoming Morse audio";
  }
});


// Browser-side ECDH key registration.
// Only the public key is sent to the server.
async function ensureEncryptionKeys() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable. Use localhost or HTTPS.");
  }

  const storageKey = `morselinkPrivateKeyJwk:${myKey}`;
  const savedPrivate = localStorage.getItem(storageKey);

  const response = await fetch(`/api/keys/${myKey}`);
  if (!response.ok) throw new Error("Could not retrieve public key record.");

  const record = await response.json();

  let privateJwk;
  let publicKey;

  if (savedPrivate) {
    privateJwk = JSON.parse(savedPrivate);

    const publicJwk = {
      kty: privateJwk.kty,
      crv: privateJwk.crv,
      x: privateJwk.x,
      y: privateJwk.y,
      ext: true
    };

    const importedPublic = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    );

    const raw = await crypto.subtle.exportKey("raw", importedPublic);
    publicKey = btoa(
      String.fromCharCode(...new Uint8Array(raw))
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/g, "");

    if (record.publicKey && record.publicKey !== publicKey) {
      throw new Error(
        "This browser's private key does not match the server key. " +
        "Do not overwrite either key."
      );
    }
  } else {
    if (record.publicKey) {
      throw new Error(
        "A public key already exists, but this browser has no private key. " +
        "Refusing to replace the registered key."
      );
    }

    const pair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );

    privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

    const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
    publicKey = btoa(
      String.fromCharCode(...new Uint8Array(raw))
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/g, "");

    // Store locally before registration so a network retry won't
    // accidentally generate a different identity key.
    localStorage.setItem(storageKey, JSON.stringify(privateJwk));
  }

  if (!record.publicKey) {
    const registration = await fetch(`/api/keys/${myKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey })
    });

    if (!registration.ok) {
      throw new Error(
        `Public key registration failed (${registration.status}).`
      );
    }
  }

  console.info("Browser encryption key is registered for", myKey);
}
