const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const database = require("./database");
const { encode } = require("./morse");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

async function generateUserKey() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let key;

  do {
    key = "";

    for (let i = 0; i < 6; i++) {
      key += characters[crypto.randomInt(0, characters.length)];
    }
  } while (await database.userExists(key));

  return key;
}

function sendToUser(userKey, payload) {
  for (const client of wss.clients) {
    if (
      client.readyState === WebSocket.OPEN &&
      client.userKey === userKey
    ) {
      client.send(JSON.stringify(payload));
    }
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "MorseLink"
  });
});

app.post("/api/users", async (req, res) => {
  const userKey = await generateUserKey();

  await database.createUser(userKey);

  res.json({
    userKey
  });
});

app.get("/api/users/:key", async (req, res) => {
  const userKey = req.params.key.toUpperCase();

  res.json({
    exists: await database.userExists(userKey)
  });
});

app.get("/api/keys/:key", async (req, res) => {
  const userKey = req.params.key.toUpperCase();

  if (!(await database.userExists(userKey))) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    userKey,
    publicKey: await database.getUserPublicKey(userKey)
  });
});

app.put("/api/keys/:key", async (req, res) => {
  const userKey = req.params.key.toUpperCase();
  const publicKey = String(req.body.publicKey || "");

  if (!(await database.userExists(userKey))) {
    return res.status(404).json({ error: "User not found" });
  }

  // Expected format: base64url-encoded raw P-256 public key.
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(publicKey)) {
    return res.status(400).json({ error: "Invalid public key format" });
  }

  const result = await database.setUserPublicKey(userKey, publicKey);

  if (result === "exists") {
    return res.status(409).json({
      error: "A public key is already registered for this account"
    });
  }

  if (result === "not_found") {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    saved: result === "saved",
    publicKeyRegistered: true
  });
});

app.get("/api/messages/:key", async (req, res) => {
  const userKey = req.params.key.toUpperCase();

  if (!(await database.userExists(userKey))) {
    return res.status(404).json({
      error: "User not found"
    });
  }

  res.json(await database.getMessagesForUser(userKey));
});

app.post("/api/messages", async (req, res) => {
  const senderKey = String(req.body.senderKey || "").toUpperCase();
  const receiverKey = String(req.body.receiverKey || "").toUpperCase();
  const morse = String(req.body.morse || "").trim();

  if (!/^[A-Z0-9]{6}$/.test(senderKey)) {
    return res.status(400).json({
      error: "Invalid sender key"
    });
  }

  if (!/^[A-Z0-9]{6}$/.test(receiverKey)) {
    return res.status(400).json({
      error: "Invalid receiver key"
    });
  }

  if (!(await database.userExists(senderKey))) {
    return res.status(404).json({
      error: "Sender key does not exist"
    });
  }

  if (!(await database.userExists(receiverKey))) {
    return res.status(404).json({
      error: "Receiver key does not exist"
    });
  }

  if (!morse) {
    return res.status(400).json({
      error: "Morse payload cannot be empty"
    });
  }

  if (morse.length > 10000) {
    return res.status(400).json({
      error: "Message is too long"
    });
  }

  const message = await database.addMessage({
    senderKey,
    receiverKey,
    morse,
    createdAt: new Date().toISOString()
  });

  sendToUser(receiverKey, {
    type: "message",
    message
  });

  res.json(message);
});

wss.on("connection", ws => {
  ws.send(JSON.stringify({
    type: "connected"
  }));

  ws.on("message", async raw => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "identify") {
        const userKey = String(data.userKey || "").toUpperCase();

        if (!(await database.userExists(userKey))) {
          ws.send(JSON.stringify({
            type: "error",
            error: "Invalid user key"
          }));
          return;
        }

        ws.userKey = userKey;

        ws.send(JSON.stringify({
          type: "identified",
          userKey
        }));
      }
    } catch {
      ws.send(JSON.stringify({
        type: "error",
        error: "Invalid WebSocket message"
      }));
    }
  });
});

database.init().then(() => server.listen(PORT, HOST, () => {
  console.log(`MorseLink running on http://${HOST}:${PORT}`);
})).catch(error => {
  console.error("MorseLink startup failed:", error);
  process.exit(1);
});
