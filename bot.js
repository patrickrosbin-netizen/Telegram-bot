const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');

// ===== ENV CHECK =====
if (!process.env.BOT_TOKEN || !process.env.ADMIN_ID || !process.env.DATABASE_URL) {
  console.error("❌ Missing BOT_TOKEN, ADMIN_ID, or DATABASE_URL");
  process.exit(1);
}

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN = process.env.ADMIN_ID.toString();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== TEMPORARY DATABASE RESET =====
(async () => {
  try {
    await pool.query(`DROP TABLE IF EXISTS movies`); // <- REMOVE AFTER FIRST DEPLOY
    await pool.query(`
      CREATE TABLE movies (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        file_id TEXT NOT NULL,
        caption TEXT
      )
    `);
    console.log("🔥 Movies table reset.");
  } catch (err) {
    console.error("DB INIT ERROR:", err.message);
    process.exit(1);
  }
})();

// ===== ADMIN ADD MOVIE =====
bot.onText(/\/addmovie (.+)/, (msg, match) => {
  if (msg.from.id.toString() !== ADMIN)
    return bot.sendMessage(msg.chat.id, "❌ Admin only.");

  const movieName = match[1].trim().toLowerCase();
  bot.sendMessage(msg.chat.id, "Send the video file OR direct link.");

  bot.once("message", async (response) => {
    try {
      let file_id = null;
      let caption = response.caption || "";

      if (response.video) file_id = response.video.file_id;
      else if (response.text && response.text.startsWith("http")) file_id = response.text;
      else return bot.sendMessage(msg.chat.id, "❌ Invalid input.");

      await pool.query(
        "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
        [movieName, file_id, caption]
      );

      bot.sendMessage(msg.chat.id, "✅ Movie Saved Successfully.");
    } catch (err) {
      console.error("ADD ERROR:", err.message);
      bot.sendMessage(msg.chat.id, "❌ Movie already exists or DB error.");
    }
  });
});

// ===== SEARCH MOVIE (CRASH PROOF) =====
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  try {
    const search = msg.text.trim().toLowerCase();
    const result = await pool.query(
      "SELECT id, name FROM movies WHERE LOWER(name) LIKE $1",
      [`%${search}%`]
    );

    if (!result.rows.length) return bot.sendMessage(msg.chat.id, "❌ Movie not found.");

    const movie = result.rows[0];
    await bot.sendMessage(msg.chat.id, `🎬 ${movie.name}`, {
      reply_markup: {
        inline_keyboard: [[{ text: "⬇ Download", callback_data: `download_${movie.id}` }]]
      }
    });
  } catch (err) {
    console.error("SEARCH ERROR:", err.message);
    bot.sendMessage(msg.chat.id, "❌ Search system error.");
  }
});

// ===== DOWNLOAD BUTTON HANDLER =====
bot.on("callback_query", async (query) => {
  if (!query.data.startsWith("download_")) return;
  const movieId = query.data.split("_")[1];

  try {
    const result = await pool.query("SELECT file_id, caption FROM movies WHERE id=$1", [movieId]);
    if (!result.rows.length) return bot.answerCallbackQuery(query.id, { text: "Movie not found." });

    const movie = result.rows[0];
    if (movie.file_id.startsWith("http")) await bot.sendMessage(query.message.chat.id, movie.file_id);
    else await bot.sendVideo(query.message.chat.id, movie.file_id, { caption: movie.caption || "🎬 Enjoy!" });

    bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error("DOWNLOAD ERROR:", err.message);
    bot.answerCallbackQuery(query.id, { text: "Error sending movie." });
  }
});

// ===== CHANNEL AUTO SAVE =====
bot.on("channel_post", async (msg) => {
  if (!msg.video || !msg.caption) return;
  const movieName = msg.caption.trim().toLowerCase();
  try {
    await pool.query(
      "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
      [movieName, msg.video.file_id, msg.caption]
    );
    console.log("📥 Saved from channel:", movieName);
  } catch {}
});

// ===== ADMIN STATS =====
bot.onText(/\/stats/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN) return bot.sendMessage(msg.chat.id, "❌ Admin only.");
  try {
    const total = await pool.query("SELECT COUNT(*) FROM movies");
    bot.sendMessage(msg.chat.id, `📊 Total Movies: ${total.rows[0].count}`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, "❌ Stats error.");
  }
});

console.log("🚀 Advanced Bot Running (WITH TEMP RESET)...");
