#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.NPM_GPT_UNICODE18 ??= "1";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const API = "https://penguingpt.gpgpg4445.workers.dev/v1";
const HISTORY_FILE = path.join(ROOT, "chat-history.json");
const IMAGE_DIR = path.join(ROOT, "generated");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[96m",
  blue: "\x1b[94m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  red: "\x1b[91m",
  magenta: "\x1b[95m",
  white: "\x1b[97m",
  gray: "\x1b[90m"
};

const U18 = {
  kartRight: String.fromCodePoint(0x1CC01),
  rocketLeft: String.fromCodePoint(0x1CC56),
  rocketUp: String.fromCodePoint(0x1CC57),
  rocketRight: String.fromCodePoint(0x1CC58),
  rocketDown: String.fromCodePoint(0x1CC59),
  antenna: String.fromCodePoint(0x1CC08),
  sparse: String.fromCodePoint(0x1CC40),
  cross: String.fromCodePoint(0x1CC42),
  dense: String.fromCodePoint(0x1CC44),
  ufo: String.fromCodePoint(0x1CC4A),
  monsterOpen: String.fromCodePoint(0x1CC4C),
  monsterClosed: String.fromCodePoint(0x1CC4D),
  squidOpen: String.fromCodePoint(0x1CC4E),
  squidClosed: String.fromCodePoint(0x1CC4F),
  crabRight: String.fromCodePoint(0x1CC50),
  crabLeft: String.fromCodePoint(0x1CC51),
  spiderCrouch: String.fromCodePoint(0x1CC52),
  spiderSpread: String.fromCodePoint(0x1CC53),
  monsterStep1: String.fromCodePoint(0x1CC54),
  monsterStep2: String.fromCodePoint(0x1CC55),
  robotLeftTop: String.fromCodePoint(0x1CC5A),
  robotFrontTop: String.fromCodePoint(0x1CC5B),
  robotRightTop: String.fromCodePoint(0x1CC5C),
  robotLeftBottom: String.fromCodePoint(0x1CC5D),
  robotFrontBottom: String.fromCodePoint(0x1CC5E),
  robotRightBottom: String.fromCodePoint(0x1CC5F),
  raysIn: String.fromCodePoint(0x1CC69),
  raysOut: String.fromCodePoint(0x1CC6A)
};
const color = (value, c) => `${c}${value}${C.reset}`;
const line = "-".repeat(Math.max(38, Math.min(process.stdout.columns || 80, 76) - 4));

let chatModels = [];
let imageModels = [];
let selectedChatModel = "gemini-3.6-flash";
let selectedImageModel = "sana";
let mode = "chat";
let menuOpen = false;
let menuIndex = 0;
let busy = false;
let spinnerFrame = 0;
let spinnerTimer = null;
let unicodeTimer = null;
let unicodeFrame = 0;
let input = "";
let promptHistory = [];
let promptHistoryIndex = -1;
let messages = [];
let transcript = [];
let pendingImage = null;
let latestImage = null;
let statusMessage = "Connected to PenguinGPT gateway";
let shouldExit = false;

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.setEncoding("utf8");

function safeText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value, null, 2);
}

function cleanTerminal() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function wrapText(value, width = 68) {
  const output = [];
  for (const original of String(value).split("\n")) {
    if (!original) {
      output.push("");
      continue;
    }
    let current = "";
    for (const word of original.split(/\s+/)) {
      if (!current) current = word;
      else if ((current + " " + word).length <= width) current += " " + word;
      else {
        output.push(current);
        current = word;
      }
    }
    if (current) output.push(current);
  }
  return output;
}

function renderCard(role, content) {
  const isAI = role === "assistant";
  const label = isAI ? "AI" : "YOU";
  const accent = isAI ? C.cyan : C.green;
  const width = Math.max(58, Math.min(process.stdout.columns || 80, 88));
  const textWidth = width - 9;
  const rows = wrapText(safeText(content), textWidth);

  const top = `+--[${label}]${"-".repeat(width - label.length - 6)}+`;
  const bottom = "+" + "-".repeat(width - 2) + "+";

  console.log(color(top, accent));

  for (const row of rows) {
    console.log(
      color("|", accent) +
      " " +
      color(label.padEnd(4), accent + C.bold) +
      " " +
      color(row.padEnd(textWidth), C.white) +
      color(" |", accent)
    );
  }

  console.log(color(bottom, accent));
  console.log("");
}

function renderHeader() {
  const width = Math.max(58, Math.min(process.stdout.columns || 80, 88));
  const border = "+" + "=".repeat(width - 2) + "+";

  const row = (value, style = C.white) => {
    const text = String(value).slice(0, width - 4).padEnd(width - 4);
    return color("|", C.cyan) +
      color(" " + text + " ", style) +
      color("|", C.cyan);
  };

  const model = mode === "chat" ? selectedChatModel : selectedImageModel;
  const totalModels = chatModels.length + imageModels.length;

  console.log(color(border, C.cyan + C.bold));
  console.log(row("npm-gpt  //  TERMINAL AI STUDIO", C.bold + C.white));
  console.log(
    row(
      `[${mode.toUpperCase()}]  MODEL: ${model}  [ONLINE]`,
      C.cyan + C.bold
    )
  );
  console.log(
    row(
      `GATEWAY: PENGUINGPT  |  MODELS: ${totalModels}  |  STATUS: READY`,
      C.gray
    )
  );
  console.log(color(border, C.cyan + C.bold));
  console.log("");
}

function renderHelp() {
  const help = [
    ["[ENTER]",   "Send message / confirm selection"],
    ["[TAB]",     "Open or close model selector"],
    ["[UP/DOWN]", "Navigate models / previous prompts"],
    ["[LEFT/RIGHT]", "Switch Chat and Image"],
    ["[CTRL+G]",  "Open Image Studio"],
    ["[CTRL+E]",  "Exit Image Studio"],
    ["[CTRL+M/O]", "Upload image (Windows)"],
    ["[CTRL+S]",  "Save latest generated image"],
    ["[CTRL+H]",  "Show conversation history"],
    ["[ESC]",     "Cancel image mode / close menu"],
    ["[CTRL+C]",  "Exit npm-gpt"]
  ];

  const width = 76;
  const divider = "+" + "-".repeat(width - 2) + "+";

  console.log("");
  console.log(color("  [KEYBOARD] SHORTCUTS", C.yellow + C.bold));
  console.log(color("  " + divider, C.gray));

  for (const [key, description] of help) {
    const row = "  " + key.padEnd(14) + description;
    console.log("  " + color(key.padEnd(14), C.cyan) + color(description, C.white));
  }

  console.log(color("  " + divider, C.gray));
  console.log("");
}
function unicodeColor(value, ansi) {
  return `\x1b[${ansi}m${value}\x1b[0m`;
}

function unicodeScene() {
  const f = unicodeFrame;
  const phase = f % 16;

  const rocket = [
    U18.rocketRight,
    U18.rocketUp,
    U18.rocketLeft,
    U18.rocketDown
  ][Math.floor(f / 4) % 4];

  const alien = f % 2 ? U18.monsterOpen : U18.monsterClosed;
  const squid = f % 2 ? U18.squidOpen : U18.squidClosed;
  const crab = f % 2 ? U18.crabRight : U18.crabLeft;
  const spider = f % 2 ? U18.spiderSpread : U18.spiderCrouch;
  const rays = f % 2 ? U18.raysOut : U18.raysIn;

  const robotTop = [
    U18.robotLeftTop,
    U18.robotFrontTop,
    U18.robotRightTop
  ][Math.floor(f / 3) % 3];

  const robotBottom = [
    U18.robotLeftBottom,
    U18.robotFrontBottom,
    U18.robotRightBottom
  ][Math.floor(f / 3) % 3];

  const step = f % 2 ? U18.monsterStep1 : U18.monsterStep2;
  const antenna = U18.antenna.repeat(1 + (phase % 3));

  const stars = [".", "*", "+", "x", "o", "^"];
  const star = stars[f % stars.length];

  const line1 =
    `  ${unicodeColor(U18.sparse.repeat(2), "90")} ` +
    `${unicodeColor(U18.ufo, "96;1")} ` +
    `${unicodeColor(antenna, "96")} ` +
    `${unicodeColor(star, "93")} ` +
    `${unicodeColor(U18.dense.repeat(2), "90")}`;

  const line2 =
    `  ${unicodeColor(rays, "95;1")} ` +
    `${unicodeColor(alien, "91;1")} ` +
    `${unicodeColor(squid, "96;1")} ` +
    `${unicodeColor(step, "91")} ` +
    `${unicodeColor(rocket, "92;1")} ` +
    `${unicodeColor(star, "93")}`;

  const line3 =
    `  ${unicodeColor(spider, "95;1")} ` +
    `${unicodeColor(crab, "92;1")} ` +
    `${unicodeColor(robotTop + robotBottom, "96;1")} ` +
    `${unicodeColor(U18.cross, "90")} ` +
    `${unicodeColor(U18.kartRight, "93;1")}`;

  return [line1, line2, line3];
}

function drawUnicodeScene(initial = false) {
  if (!process.stdout.isTTY) return;

  // Default: works without installing Unicode 18 fonts.
  if (process.env.NPM_GPT_UNICODE18 !== "1") {
    const f = unicodeFrame;
    const phase = f % 12;
    const stars = [".", "*", "+", "x", "o", "^"];
    const star = stars[f % stars.length];
    const alien = f % 2 ? "ALIEN" : "MONSTER";
    const robot = f % 2 ? "[ROBOT]" : "[R2-D2]";
    const rocket = ["<===>", "--->", "====>", "---->"][Math.floor(f / 3) % 4];

    const lines = [
      `  ${star}       .      ${star}       .       *`,
      `       .     [ UFO ]     .     ${star}`,
      `  [${alien}]   ${robot}   ${rocket}`
    ];

    if (initial) {
      console.log("");
      console.log(color("  SCI-FI DISPLAY // UNIVERSAL MODE", C.magenta + C.bold));
      for (const line of lines) console.log(color(line, C.cyan));
      console.log("");
    } else {
      process.stdout.write(
        "\x1b7\x1b[3A" +
        "\x1b[2K" + color(lines[0], C.cyan) + "\n" +
        "\x1b[2K" + color(lines[1], C.cyan) + "\n" +
        "\x1b[2K" + color(lines[2], C.green) +
        "\x1b8"
      );
    }
    return;
  }

  // Optional Unicode 18.0 mode
  const lines = unicodeScene();

  if (initial) {
    console.log("");
    console.log(color("  UNICODE 18.0 // GALACTIC DISPLAY", C.magenta + C.bold));
    for (const line of lines) console.log(line);
    console.log("");
    return;
  }

  process.stdout.write(
    "\x1b7\x1b[3A" +
    "\x1b[2K" + lines[0] + "\n" +
    "\x1b[2K" + lines[1] + "\n" +
    "\x1b[2K" + lines[2] +
    "\x1b8"
  );
}
function startUnicodeAnimation() {
  // Disabled: the AI Studio dashboard replaces the old Unicode animation.
  stopUnicodeAnimation();
}

function stopUnicodeAnimation() {
  if (unicodeTimer) {
    clearInterval(unicodeTimer);
    unicodeTimer = null;
  }
}
function renderDashboard() {
  const width = Math.max(38, Math.min(process.stdout.columns || 80, 76) - 4);
  const modeLabel = String(mode || "chat").toUpperCase();
  const count = Array.isArray(messages) ? messages.length : 0;
  const state = busy ? "PROCESSING" : "READY";
  const rule = "  " + "=".repeat(width);

  console.log("");
  console.log(color(rule, C.cyan));
  console.log(color("  AI STUDIO  /  LIVE SESSION", C.cyan + C.bold));
  console.log(
    color("  MODE       ", C.gray) +
    color(modeLabel, C.magenta + C.bold)
  );
  console.log(
    color("  MESSAGES   ", C.gray) +
    color(String(count), C.white + C.bold) +
    color("     STATUS   ", C.gray) +
    color(state, busy ? C.yellow + C.bold : C.green + C.bold)
  );
  console.log(color(rule, C.cyan));
  console.log("");
}

function render() {
  cleanTerminal();
  renderHeader();
  renderDashboard();
  if (transcript.length === 0) {
    renderCard("assistant",
      "Hello! I'm connected to PenguinGPT. Ask me anything, or switch to Image Studio to create an image.");
  } else {
    for (const item of transcript.slice(-12)) {
      renderCard(item.role, item.content);
    }
  }

  if (pendingImage) {
    console.log(color("  [IMAGE ATTACHED] ", C.magenta) + path.basename(pendingImage.name));
    console.log("");
  }

  if (busy) {
    const frames = ["Ã¢â€”Â", "Ã¢â€”â€œ", "Ã¢â€”â€˜", "Ã¢â€”â€™"];
    console.log(color(`  ${frames[spinnerFrame % frames.length]} PenguinGPT is thinking...`, C.yellow + C.bold));
    console.log("");
  }

  if (menuOpen) {
    const list = mode === "chat" ? chatModels : imageModels;
    console.log(color("  SELECT MODEL", C.magenta + C.bold));
    console.log(color("  " + line, C.gray));
    list.forEach((model, index) => {
      const selected = index === menuIndex;
      console.log(
        (selected ? color("  Ã¢ÂÂ¯ ", C.green + C.bold) : "    ") +
        (selected ? color(model, C.green + C.bold) : model)
      );
    });
    console.log(color("  Use Ã¢â€ â€˜ Ã¢â€ â€œ and ENTER. Press ESC to close.", C.gray));
    console.log("");
  }

  console.log(color("  " + statusMessage, C.gray));
  console.log("");
  renderHelp();
  console.log("");
  const prefix = mode === "chat" ? "YOU > " : "IMAGE PROMPT > ";
  process.stdout.write(color(prefix, mode === "chat" ? C.green + C.bold : C.magenta + C.bold) + input);
}

function saveHistory() {
  try {
    const safeMessages = messages.map(message => {
      if (Array.isArray(message.content)) {
        return {
          role: message.role,
          content: "[Previous image attachment omitted from saved history]"
        };
      }
      return message;
    });

    fs.writeFileSync(HISTORY_FILE, JSON.stringify({
      version: 2,
      messages: safeMessages,
      transcript: transcript.slice(-100),
      updatedAt: new Date().toISOString()
    }, null, 2), "utf8");
  } catch (error) {
    statusMessage = "Could not save history: " + error.message;
  }
}

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return;

    const saved = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));

    if (Array.isArray(saved.messages)) {
      messages = saved.messages.filter(m =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        (
          typeof m.content === "string" ||
          Array.isArray(m.content)
        )
      ).slice(-40);

      // Rebuild the visible conversation from messages only.
      // Never reuse the old transcript, which may contain duplicate YOU cards.
      transcript = messages.map(m => {
        let content = m.content;

        if (Array.isArray(content)) {
          const textParts = content
            .filter(part => part && part.type === "text")
            .map(part => part.text || "");

          content = textParts.join(" ").trim() || "[Image attached]";
        }

        return {
          role: m.role,
          content: String(content)
        };
      });
    } else {
      messages = [];
      transcript = [];
    }
  } catch {
    statusMessage = "History could not be loaded; starting a new chat.";
    messages = [];
    transcript = [];
  }
}
async function fetchModels() {
  try {
    const response = await fetch(`${API}/models`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 300)}`);

    const data = JSON.parse(raw);
    const all = Array.isArray(data.data) ? data.data : [];

    chatModels = all
      .filter(item => {
        const id = typeof item === "string" ? item : item.id;
        return id && !/image|sana/i.test(id);
      })
      .map(item => typeof item === "string" ? item : item.id);

    imageModels = all
      .filter(item => {
        const id = typeof item === "string" ? item : item.id;
        const modalities = item?.architecture?.output_modalities || [];
        return id && (/image|sana/i.test(id) || modalities.includes("image"));
      })
      .map(item => typeof item === "string" ? item : item.id);

    if (!chatModels.length) {
      chatModels = ["gemini-3.6-flash", "gpt-5-6", "gpt-4o", "llama3.1-8B"];
    }
    if (!imageModels.length) imageModels = ["sana"];

    if (!chatModels.includes(selectedChatModel)) {
      selectedChatModel = chatModels.includes("gemini-3.6-flash")
        ? "gemini-3.6-flash" : chatModels[0];
    }
    if (!imageModels.includes(selectedImageModel)) {
      selectedImageModel = imageModels.includes("sana") ? "sana" : imageModels[0];
    }
    statusMessage = `${all.length} models loaded from PenguinGPT`;
  } catch (error) {
    chatModels = ["gemini-3.6-flash", "gpt-5-6", "gpt-4o", "llama3.1-8B"];
    imageModels = ["sana"];
    statusMessage = "Model list unavailable; using fallback models. " + error.message;
  }
}

function extractText(data) {
  if (!data) return "";

  const direct = data.choices?.[0]?.message?.content ??
    data.choices?.[0]?.text ??
    data.output_text ??
    data.response ??
    data.text;

  if (typeof direct === "string") return direct;
  if (Array.isArray(direct)) {
    return direct.map(part => {
      if (typeof part === "string") return part;
      return part?.text || part?.content || "";
    }).join("");
  }

  if (data.message?.content) return safeText(data.message.content);
  if (data.content && typeof data.content === "string") return data.content;
  return "";
}

function extractStreamText(raw) {
  const chunks = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const data = JSON.parse(payload);
      const value = data.choices?.[0]?.delta?.content ??
        data.choices?.[0]?.message?.content ??
        data.choices?.[0]?.text ??
        data.delta?.text ??
        data.text;
      if (typeof value === "string") chunks.push(value);
      else if (Array.isArray(value)) {
        chunks.push(value.map(part => part?.text || "").join(""));
      }
    } catch {
      // Ignore non-JSON event data.
    }
  }
  return chunks.join("");
}

async function askAI(prompt) {
  let content = prompt;

  if (pendingImage) {
    const imageData = fs.readFileSync(pendingImage.path).toString("base64");
    content = [
      { type: "text", text: prompt || "Describe this image." },
      {
        type: "image_url",
        image_url: { url: `data:${pendingImage.mime};base64,${imageData}` }
      }
    ];
  }

  messages.push({ role: "user", content });

  const response = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      model: selectedChatModel,
      messages,
      stream: false
    }),
    signal: AbortSignal.timeout(120000)
  });

  const raw = await response.text();

  if (!response.ok) {
    messages.pop();
    throw new Error(`HTTP ${response.status}: ${raw.slice(0, 1200)}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const streamed = extractStreamText(raw);
    if (streamed.trim()) data = { choices: [{ message: { content: streamed } }] };
    else {
      messages.pop();
      throw new Error("API did not return JSON or readable stream: " + raw.slice(0, 1000));
    }
  }

  if (data.error) {
    messages.pop();
    throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  }

  const answer = extractText(data);

  if (!answer.trim()) {
    messages.pop();
    throw new Error("API response has no assistant text: " + raw.slice(0, 1200));
  }

  messages.push({ role: "assistant", content: answer });

  transcript.push({ role: "assistant", content: answer });

  pendingImage = null;
  saveHistory();
  return answer;
}

function mimeFromExtension(file) {
  const ext = path.extname(file).toLowerCase();
  const types = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp"
  };
  return types[ext] || "application/octet-stream";
}

function chooseImageFile() {
  if (process.platform !== "win32") {
    statusMessage = "File picker is currently implemented for Windows.";
    render();
    return;
  }

  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$d = New-Object System.Windows.Forms.OpenFileDialog",
    "$d.Title = 'Select an image for npm-gpt'",
    "$d.Filter = 'Images|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp'",
    "if ($d.ShowDialog() -eq 'OK') { [Console]::Write($d.FileName) }"
  ].join("; ");

  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script
  ], { encoding: "utf8", windowsHide: true });

  const selected = (result.stdout || "").trim();
  if (!selected || !fs.existsSync(selected)) {
    statusMessage = "Image selection cancelled.";
    return;
  }

  const stat = fs.statSync(selected);
  if (stat.size > 10 * 1024 * 1024) {
    statusMessage = "Image is larger than 10 MB.";
    return;
  }

  pendingImage = {
    path: selected,
    name: path.basename(selected),
    mime: mimeFromExtension(selected)
  };
  mode = "chat";
  statusMessage = "Image attached. Enter a question and press Enter.";
}

async function saveImageFromUrl(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = response.headers.get("content-type")?.includes("png") ? ".png" : ".jpg";
  const filename = `penguingpt-${Date.now()}${ext}`;
  const destination = path.join(IMAGE_DIR, filename);
  fs.writeFileSync(destination, buffer);
  latestImage = destination;
  return destination;
}

async function generateImage(prompt) {
  const body = {
    model: selectedImageModel,
    prompt,
    n: 1,
    size: "1024x1024"
  };

  const response = await fetch(`${API}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000)
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`Image API HTTP ${response.status}: ${raw.slice(0, 1200)}`);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Image API returned invalid JSON: " + raw.slice(0, 1000));
  }

  if (data.error) {
    throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  }

  const item = data.data?.[0] || data.images?.[0] || data;
  let saved;

  if (item.b64_json || item.base64) {
    const encoded = item.b64_json || item.base64;
    const buffer = Buffer.from(encoded, "base64");
    const filename = `penguingpt-${Date.now()}.png`;
    saved = path.join(IMAGE_DIR, filename);
    fs.writeFileSync(saved, buffer);
  } else {
    const url = item.url || item.image_url || data.url;
    if (!url) throw new Error("No image URL or base64 image in response: " + raw.slice(0, 1200));
    saved = await saveImageFromUrl(url);
  }

  latestImage = saved;

  transcript.push({ role: "assistant", content: `Image generated and saved: ${saved}` });
  saveHistory();
  return saved;
}

function showHistory() {
  if (!transcript.length) {
    statusMessage = "No conversation history yet.";
    return;
  }
  console.log("");
  console.log(color("  RECENT CONVERSATION", C.magenta + C.bold));
  console.log(color("  " + line, C.gray));
  for (const item of transcript.slice(-30)) {
    const label = item.role === "assistant" ? "AI " : "YOU";
    console.log(color(`  ${label}: `, item.role === "assistant" ? C.cyan : C.green) +
      wrapText(item.content, 65).join("\n       "));
  }
  console.log(color("  " + line, C.gray));
  console.log("");
  console.log(color("  Press any key to return.", C.gray));
}

async function saveLatestImage() {
  if (!latestImage || !fs.existsSync(latestImage)) {
    statusMessage = "No generated image to save yet.";
    return;
  }

  const destination = path.join(os.homedir(), "Downloads", path.basename(latestImage));
  fs.copyFileSync(latestImage, destination);
  statusMessage = `Image copied to Downloads: ${path.basename(destination)}`;
}

async function submitInput() {
  const prompt = input.trim();
  if (!prompt || busy || menuOpen) return;

  input = "";
  promptHistory.unshift(prompt);
  promptHistory = promptHistory.slice(0, 50);
  promptHistoryIndex = -1;
  busy = true;
  spinnerFrame = 0;

  if (mode === "chat") {
    if (!pendingImage) transcript.push({ role: "user", content: prompt });
  } else {
  
  }

  statusMessage = "Sending request...";
  render();

  spinnerTimer = setInterval(() => {
    spinnerFrame++;
    render();
  }, 120);

  try {
    if (mode === "chat") {
      const answer = await askAI(prompt);
      statusMessage = `Reply received from ${selectedChatModel}`;
    } else {
      const saved = await generateImage(prompt);
      statusMessage = `Image saved: ${saved}`;
    }
  } catch (error) {
    transcript.push({ role: "assistant", content: "ERROR: " + error.message });
    statusMessage = "Request failed. See the AI error message above.";
  } finally {
    busy = false;
    if (spinnerTimer) clearInterval(spinnerTimer);
    spinnerTimer = null;
    render();
  }
}

function switchMode(direction) {
  mode = direction === "image" ? "image" : "chat";
  menuOpen = false;
  statusMessage = mode === "image" ? "Image Studio ready." : "Chat mode ready.";
}

function openModelMenu() {
  const list = mode === "chat" ? chatModels : imageModels;
  if (!list.length) {
    statusMessage = "No models available.";
    return;
  }
  menuOpen = true;
  const current = mode === "chat" ? selectedChatModel : selectedImageModel;
  menuIndex = Math.max(0, list.indexOf(current));
}

function handleKey(str, key = {}) {
  if (shouldExit) return;

  if (key.ctrl && key.name === "c") {
    shouldExit = true;
    if (spinnerTimer) clearInterval(spinnerTimer);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    console.log("\n" + color("Goodbye!", C.cyan));
    process.exit(0);
  }

  if (busy) return;

  if (key.name === "escape") {
    if (menuOpen) menuOpen = false;
    else if (mode === "image") mode = "chat";
    pendingImage = null;
    statusMessage = "Cancelled.";
    render();
    return;
  }

  if (menuOpen) {
    const list = mode === "chat" ? chatModels : imageModels;
    if (key.name === "up") menuIndex = (menuIndex - 1 + list.length) % list.length;
    else if (key.name === "down") menuIndex = (menuIndex + 1) % list.length;
    else if (key.name === "return" || key.name === "enter") {
      const selected = list[menuIndex];
      if (mode === "chat") selectedChatModel = selected;
      else selectedImageModel = selected;
      menuOpen = false;
      statusMessage = `Selected model: ${selected}`;
    }
    render();
    return;
  }

  if (key.ctrl && key.name === "g") {
    switchMode("image");
    render();
    return;
  }

  if (key.ctrl && key.name === "e") {
    switchMode("chat");
    render();
    return;
  }

  if (key.ctrl && (key.name === "o" || key.name === "m")) {
    chooseImageFile();
    render();
    return;
  }

  if (key.ctrl && key.name === "s") {
    saveLatestImage().then(render).catch(error => {
      statusMessage = error.message;
      render();
    });
    return;
  }

  if (key.ctrl && key.name === "h") {
    showHistory();
    return;
  }

  if (key.name === "tab") {
    openModelMenu();
    render();
    return;
  }

  if (key.name === "left" || key.name === "right") {
    switchMode(key.name === "left" ? "chat" : "image");
    render();
    return;
  }

  if (key.name === "up") {
    if (promptHistory.length) {
      promptHistoryIndex = Math.min(promptHistoryIndex + 1, promptHistory.length - 1);
      input = promptHistory[promptHistoryIndex] || "";
      render();
    }
    return;
  }

  if (key.name === "down") {
    if (promptHistoryIndex > 0) {
      promptHistoryIndex--;
      input = promptHistory[promptHistoryIndex] || "";
    } else {
      promptHistoryIndex = -1;
      input = "";
    }
    render();
    return;
  }

  if (key.name === "return" || key.name === "enter") {
    submitInput();
    return;
  }

  if (key.name === "backspace") {
    input = input.slice(0, -1);
    render();
    return;
  }

  if (!key.ctrl && !key.meta && typeof str === "string" && str.length === 1 && str >= " ") {
    input += str;
    render();
  }
}

process.stdin.on("keypress", handleKey);

async function main() {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  loadHistory();
  await fetchModels();
  render();
  startUnicodeAnimation();

  process.on("exit", () => {
    stopUnicodeAnimation();
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
  });
}

main().catch(error => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  console.error(error);
  process.exit(1);
});
