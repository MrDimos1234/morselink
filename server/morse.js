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
  Object.entries(MORSE).map(([character, code]) => [code, character])
);

function encode(text) {
  return text
    .toUpperCase()
    .split("")
    .map(character => {
      if (character === " ") return "/";
      return MORSE[character] || "";
    })
    .filter(Boolean)
    .join(" ");
}

function decode(morse) {
  return morse
    .trim()
    .split(/\s+/)
    .map(code => {
      if (code === "/") return " ";
      return REVERSE_MORSE[code] || "";
    })
    .join("");
}

module.exports = {
  encode,
  decode
};
