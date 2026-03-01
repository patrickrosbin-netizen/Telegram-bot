require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== CREATE TABLE IF NOT EXISTS =====
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movies (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      file_id TEXT NOT NULL,
      caption TEXT
    )
  `);
})();

// ===== ADMIN ID =====
const ADMIN_ID = process.env.ADMIN_ID;

// ===============================
// ADD MOVIE MANUALLY
// ===============================
bot.onText(/\/addmovie (.+)/, async (msg, match) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "Only admin can add movies.");
  }

  const movieName = match[1].toLowerCase();

  bot.sendMessage(msg.chat.id, "Send the video now.");

  bot.once("video", async (videoMsg) => {
    const fileId = videoMsg.video.file_id;
    const caption = videoMsg.caption || "";

    try {
      await pool.query(
        "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
        [movieName, fileId, caption]
      );

      bot.sendMessage(msg.chat.id, "Movie permanently saved ✅");
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

  const movieName = match[1].toLowerCase();
  const fileId = msg.video.file_id;
  const caption = msg.caption;

  try {
    await pool.query(
      "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
      [movieName, fileId, caption]
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

  const search = msg.text.toLowerCase();

  const result = await pool.query(
    "SELECT * FROM movies WHERE name ILIKE $1",
    [`%${search}%`]
  );

  if (result.rows.length === 0) {
    return bot.sendMessage(msg.chat.id, "Movie not found ❌");
  }

  const movie = result.rows[0];

  bot.sendVideo(msg.chat.id, movie.file_id, {
    caption: movie.caption || "Enjoy 🎬"
  });
});

// ===============================
// ADMIN STATS
// ===============================
bot.onText(/\/stats/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "Only admin allowed.");
  }

  const total = await pool.query("SELECT COUNT(*) FROM movies");

  bot.sendMessage(
    msg.chat.id,
    `📊 Total Movies: ${total.rows[0].count}`
  );
});
