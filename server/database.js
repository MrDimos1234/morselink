const fs = require("fs");
const path = require("path");

const connectionString = process.env.DATABASE_URL;
let pool = null;

const dataDirectory = path.join(__dirname, "..", "data");
const databaseFile = path.join(dataDirectory, "morselink.json");

function ensureJsonDatabase() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(databaseFile)) {
    fs.writeFileSync(
      databaseFile,
      JSON.stringify({ users: [], messages: [] }, null, 2)
    );
  }
}

function loadDatabase() {
  return JSON.parse(fs.readFileSync(databaseFile, "utf8"));
}

function saveDatabase(data) {
  fs.writeFileSync(databaseFile, JSON.stringify(data, null, 2));
}

async function init() {
  if (!connectionString) {
    ensureJsonDatabase();
    console.log("MorseLink database: local JSON");
    return;
  }

  const { Pool } = require("pg");
  pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10000
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_key TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      public_key TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      sender_key TEXT NOT NULL REFERENCES users(user_key),
      receiver_key TEXT NOT NULL REFERENCES users(user_key),
      morse TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS messages_sender_id_idx
      ON messages(sender_key, id DESC);

    CREATE INDEX IF NOT EXISTS messages_receiver_id_idx
      ON messages(receiver_key, id DESC);
  `);

  console.log("MorseLink database: PostgreSQL");
}

async function createUser(userKey) {
  if (pool) {
    await pool.query(
      "INSERT INTO users (user_key) VALUES ($1)",
      [userKey]
    );
    return;
  }

  const data = loadDatabase();
  data.users.push({ userKey, createdAt: new Date().toISOString() });
  saveDatabase(data);
}

async function userExists(userKey) {
  if (pool) {
    const result = await pool.query(
      "SELECT 1 FROM users WHERE user_key = $1",
      [userKey]
    );
    return result.rowCount > 0;
  }

  return loadDatabase().users.some(user => user.userKey === userKey);
}

async function getUserPublicKey(userKey) {
  if (pool) {
    const result = await pool.query(
      "SELECT public_key FROM users WHERE user_key = $1",
      [userKey]
    );
    return result.rows[0]?.public_key ?? null;
  }

  const user = loadDatabase().users.find(entry => entry.userKey === userKey);
  return user ? user.publicKey || null : null;
}

async function setUserPublicKey(userKey, publicKey) {
  if (pool) {
    const updated = await pool.query(
      `UPDATE users
       SET public_key = $2
       WHERE user_key = $1 AND public_key IS NULL
       RETURNING user_key`,
      [userKey, publicKey]
    );

    if (updated.rowCount) return "saved";

    const existing = await pool.query(
      "SELECT public_key FROM users WHERE user_key = $1",
      [userKey]
    );

    if (!existing.rowCount) return "not_found";
    return existing.rows[0].public_key === publicKey ? "unchanged" : "exists";
  }

  const data = loadDatabase();
  const user = data.users.find(entry => entry.userKey === userKey);

  if (!user) return "not_found";
  if (user.publicKey) {
    return user.publicKey === publicKey ? "unchanged" : "exists";
  }

  user.publicKey = publicKey;
  saveDatabase(data);
  return "saved";
}

async function addMessage(message) {
  if (pool) {
    const result = await pool.query(
      `INSERT INTO messages (sender_key, receiver_key, morse, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sender_key AS "senderKey",
                 receiver_key AS "receiverKey", morse,
                 created_at AS "createdAt"`,
      [
        message.senderKey,
        message.receiverKey,
        message.morse,
        message.createdAt
      ]
    );
    return result.rows[0];
  }

  const data = loadDatabase();
  const id = data.messages.length
    ? data.messages[data.messages.length - 1].id + 1
    : 1;
  const newMessage = { id, ...message };
  data.messages.push(newMessage);
  saveDatabase(data);
  return newMessage;
}

async function getMessagesForUser(userKey) {
  if (pool) {
    const result = await pool.query(
      `SELECT id, sender_key AS "senderKey",
              receiver_key AS "receiverKey", morse,
              created_at AS "createdAt"
       FROM messages
       WHERE sender_key = $1 OR receiver_key = $1
       ORDER BY id DESC
       LIMIT 100`,
      [userKey]
    );
    return result.rows;
  }

  return loadDatabase().messages
    .filter(message =>
      message.senderKey === userKey || message.receiverKey === userKey
    )
    .sort((a, b) => b.id - a.id)
    .slice(0, 100);
}

module.exports = {
  init,
  createUser,
  userExists,
  getUserPublicKey,
  setUserPublicKey,
  addMessage,
  getMessagesForUser
};
