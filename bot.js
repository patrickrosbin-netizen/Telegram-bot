require('dotenv').config(); // Must be first
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');

// ===== ENV CHECK =====
const { BOT_TOKEN, ADMIN_ID, DATABASE_URL } = process.env;
if (!BOT_TOKEN || !ADMIN_ID || !DATABASE_URL) {
  console.error("❌ Missing BOT_TOKEN, ADMIN_ID, or DATABASE_URL in .env");
  process.exit(1);
}

// ===== INIT BOT =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ADMIN = ADMIN_ID.toString();

// ===== POSTGRES POOL =====
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Railway
});

// ===== CREATE TABLE =====
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
    console.log("✅ Database connected");
  } catch (err) {
    console.error("❌ DB connection error:", err.message);
    process.exit(1);
  }
})();

// ===== MANUAL ADD MOVIE =====
bot.onText(/\/addmovie (.+)/, (msg, match) => {
  if (msg.from.id.toString() !== ADMIN) return bot.sendMessage(msg.chat.id, "Only admin can add movies.");

  const movieName = match[1].toLowerCase();
  bot.sendMessage(msg.chat.id, "Send the video now.");

  // Listen for next video
  bot.once("video", async (videoMsg) => {
    if (!videoMsg.video) return bot.sendMessage(msg.chat.id, "❌ No video detected.");
    try {
      await pool.query(
        "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
        [movieName, videoMsg.video.file_id, videoMsg.caption || ""]
      );
      bot.sendMessage(msg.chat.id, "✅ Movie saved permanently");
    } catch (err) {
      bot.sendMessage(msg.chat.id, "❌ Movie already exists or DB error.");
      console.error("Add movie error:", err.message);
    }
  });
});

// ===== CHANNEL AUTO SAVE =====
bot.on("channel_post", async (msg) => {
  if (!msg.video || !msg.caption) return;
  const match = msg.caption.match(/#(\w+)/);
  if (!match) return;

  const movieName = match[1].toLowerCase();
  try {
    await pool.query(
      "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
      [movieName, msg.video.file_id, msg.caption]
    );
    console.log("✅ Saved from channel:", movieName);
  } catch (err) {
    console.log("Already exists or DB error:", movieName);
  }
});

// ===== SEARCH MOVIE =====
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  try {
    const result = await pool.query("SELECT * FROM movies WHERE name ILIKE $1", [`%${msg.text.toLowerCase()}%`]);
    if (result.rows.length === 0) return bot.sendMessage(msg.chat.id, "❌ Movie not found");

    const movie = result.rows[0];
    bot.sendVideo(msg.chat.id, movie.file_id, { caption: movie.caption || "🎬 Enjoy!" });
  } catch (err) {
    console.error("Search error:", err.message);
    bot.sendMessage(msg.chat.id, "❌ Error retrieving movie");
  }
});

// ===== ADMIN STATS =====
bot.onText(/\/stats/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN) return bot.sendMessage(msg.chat.id, "Only admin allowed.");
  try {
    const total = await pool.query("SELECT COUNT(*) FROM movies");
    bot.sendMessage(msg.chat.id, `📊 Total Movies: ${total.rows[0].count}`);
  } catch (err) {
    console.error("Stats error:", err.message);
    bot.sendMessage(msg.chat.id, "❌ Error fetching stats");
  }
});

console.log("🚀 Bot is running");
