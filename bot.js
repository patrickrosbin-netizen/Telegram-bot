require('dotenv').config(); // Load .env variables
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');

// ===== CHECK ENV VARIABLES =====
if (!process.env.BOT_TOKEN || !process.env.ADMIN_ID || !process.env.DATABASE_URL) {
  console.error("Missing BOT_TOKEN, ADMIN_ID, or DATABASE_URL in .env");
  process.exit(1);
}

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = process.env.ADMIN_ID;

// ===== POSTGRESQL POOL =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") 
    ? false 
    : { rejectUnauthorized: false }
});

// ===== CREATE TABLE IF NOT EXISTS =====
(async () => {
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
    console.error("DB error:", err.message);
    process.exit(1);
  }
})();

// ===============================
// MANUAL ADD MOVIE
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
// AUTO SAVE FROM PRIVATE CHANNEL
// ===============================
bot.on("channel_post", async (msg) => {
  if (!msg.video || !msg.caption) return;

  // Optional: Use a hashtag as the movie name
  const match = msg.caption.match(/#(\w+)/);
  if (!match) return;

  const movieName = match[1].toLowerCase();
  const fileId = msg.video.file_id;

  try {
    await pool.query(
      "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
      [movieName, fileId, msg.caption]
    );
    console.log("Saved from channel:", movieName);
  } catch (err) {
    console.log("Already exists:", movieName);
  }
});

// ===============================
// SEARCH MOVIE
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

// ===============================
// ADMIN STATS
// ===============================
bot.onText(/\/stats/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "Only admin allowed.");
  }

  try {
    const total = await pool.query("SELECT COUNT(*) FROM movies");
    bot.sendMessage(msg.chat.id, `📊 Total Movies: ${total.rows[0].count}`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, "Error fetching stats.");
  }
});

console.log("Bot is running 🚀");
