let myKey = null;
let socket = null;

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

  renderMessages(messages);
}

function renderMessages(messages) {
  if (messages.length === 0) {
    messagesElement.innerHTML = `
      <div class="empty">
        <div class="empty-icon">•−−•</div>
        <div>No messages yet.</div>
        <span>Send a Morse message to get started.</span>
      </div>
    `;

    return;
  }

  messagesElement.innerHTML = messages.map(message => {
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
