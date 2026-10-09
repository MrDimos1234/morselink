# MorseLink

MorseLink is a web-based messaging application that encodes messages into
Morse code before sending them between users.

## Features

- User identity keys
- Send and receive messages
- Real-time messaging using WebSockets
- Morse code message encoding
- Base64 and Caesar cipher encoding pipeline
- Message history stored locally
- Responsive dark-themed interface
- Copy Morse payloads

## Requirements

- Node.js (current LTS version recommended)
- npm (included with Node.js)
- Git (optional, for cloning the repository)

## Installation

### 1. Install the requirements

**Android / Termux:**

    pkg update
    pkg install nodejs git

**Linux (Debian/Ubuntu):**

    sudo apt update
    sudo apt install nodejs npm git

On other operating systems, install Node.js from:
https://nodejs.org/

### 2. Get the project

Clone the repository:

    git clone https://github.com/YOUR_GITHUB_USERNAME/morselink.git
    cd morselink

Alternatively, enter the existing project directory if you already have it.

### 3. Install dependencies

    npm install

This installs the dependencies listed in package.json.

### 4. Start the server

    npm start

### 5. Open MorseLink

On the same device, open:

    http://127.0.0.1:3000

To stop the server, press Ctrl+C in the terminal.

## Development

Start the server with:

    npm run dev

## Project Structure

    morselink/
    ├── public/
    │   ├── index.html
    │   ├── style.css
    │   └── app.js
    ├── server/
    │   ├── index.js
    │   ├── database.js
    │   └── morse.js
    ├── data/
    ├── package.json
    ├── package-lock.json
    ├── .gitignore
    └── README.md

## Data and Privacy

- Application data is stored locally in a JSON file.
- The data directory may contain private messages and user keys.
- Do not commit private data, credentials, or environment files.
- Back up important data separately.
- Local JSON storage is not suitable for reliable persistent storage
  on hosting platforms with ephemeral filesystems.

## Important Security Note

Morse code, Base64, and Caesar ciphers are encoding or obfuscation methods,
not modern encryption. Do not use them to protect sensitive information.

A user key should not be treated as secure authentication.

## Dependencies

Dependencies are declared in package.json and locked in package-lock.json.

Install them using:

    npm install

