const fs = require("fs");
const path = require("path");

const dataDirectory = path.join(__dirname, "..", "data");
const databaseFile = path.join(dataDirectory, "morselink.json");

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

if (!fs.existsSync(databaseFile)) {
  fs.writeFileSync(
    databaseFile,
    JSON.stringify({
      users: [],
      messages: []
    }, null, 2)
  );
}

function loadDatabase() {
  return JSON.parse(fs.readFileSync(databaseFile, "utf8"));
}

function saveDatabase(database) {
  fs.writeFileSync(
    databaseFile,
    JSON.stringify(database, null, 2)
  );
}

function createUser(userKey) {
  const database = loadDatabase();

  database.users.push({
    userKey,
    createdAt: new Date().toISOString()
  });

  saveDatabase(database);
}

function userExists(userKey) {
  const database = loadDatabase();

  return database.users.some(
    user => user.userKey === userKey
  );
}

function addMessage(message) {
  const database = loadDatabase();

  const id =
    database.messages.length > 0
      ? database.messages[database.messages.length - 1].id + 1
      : 1;

  const newMessage = {
    id,
    ...message
  };

  database.messages.push(newMessage);

  saveDatabase(database);

  return newMessage;
}

function getMessagesForUser(userKey) {
  const database = loadDatabase();

  return database.messages
    .filter(
      message =>
        message.senderKey === userKey ||
        message.receiverKey === userKey
    )
    .sort((a, b) => b.id - a.id)
    .slice(0, 100);
}

module.exports = {
  createUser,
  userExists,
  addMessage,
  getMessagesForUser
};
