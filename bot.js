require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

// ===== CHECK ENV VARIABLES =====
if (!process.env.BOT_TOKEN) {
  console.error("BOT_TOKEN missing!");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing!");
  process.exit(1);
}

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== SAFE POSTGRES CONFIG FOR RAILWAY =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

// ===== CREATE TABLE =====
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        file_id TEXT NOT NULL,
        caption TEXT
      )
    `);
    console.log("Database connected ✅");
  } catch (err) {
    console.error("DB Error:", err.message);
    process.exit(1);
  }
}

initDB();

// ===== ADMIN ID =====
const ADMIN_ID = process.env.ADMIN_ID;

// ===============================
// ADD MOVIE
// ===============================
bot.onText(/\/addmovie (.+)/, async (msg, match) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "Only admin can add movies.");
  }

  const movieName = match[1].toLowerCase();
  bot.sendMessage(msg.chat.id, "Send the video now.");

  bot.once("video", async (videoMsg) => {
    try {
      await pool.query(
        "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
        [
          movieName,
          videoMsg.video.file_id,
          videoMsg.caption || ""
        ]
      );

      bot.sendMessage(msg.chat.id, "Movie saved permanently ✅");
    } catch (err) {
      bot.sendMessage(msg.chat.id, "Movie already exists.");
    }
  });
});

// ===============================
// AUTO SAVE FROM CHANNEL
// ===============================
bot.on("channel_post", async (msg) => {
  if (!msg.video || !msg.caption) return;

  const match = msg.caption.match(/#(\w+)/);
  if (!match) return;

  try {
    await pool.query(
      "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
      [
        match[1].toLowerCase(),
        msg.video.file_id,
        msg.caption
      ]
    );

    console.log("Saved from channel:", match[1]);
  } catch (err) {
    console.log("Already exists");
  }
});

// ===============================
// SEARCH
// ===============================
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  try {
    const result = await pool.query(
      "SELECT * FROM movies WHERE name ILIKE $1",
      [`%${msg.text.toLowerCase()}%`]
    );

    if (result.rows.length === 0) {
      return bot.sendMessage(msg.chat.id, "Movie not found ❌");
    }

    const movie = result.rows[0];

    bot.sendVideo(msg.chat.id, movie.file_id, {
      caption: movie.caption || "Enjoy 🎬"
    });

  } catch (err) {
    console.error("Search error:", err.message);
  }
});

// ===== START MESSAGE =====
console.log("Bot is running 🚀");
