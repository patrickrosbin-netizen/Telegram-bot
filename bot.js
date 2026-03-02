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

// ===== DATABASE INIT =====
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movies (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      file_id TEXT NOT NULL,
      caption TEXT
    )
  `);
  console.log("✅ Database Ready");
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

      if (response.video) {
        file_id = response.video.file_id;
      } else if (response.text && response.text.startsWith("http")) {
        file_id = response.text;
      } else {
        return bot.sendMessage(msg.chat.id, "❌ Invalid input.");
      }

      await pool.query(
        "INSERT INTO movies (name, file_id, caption) VALUES ($1,$2,$3)",
        [movieName, file_id, caption]
      );

      bot.sendMessage(msg.chat.id, "✅ Movie Saved Successfully.");

    } catch (err) {
      bot.sendMessage(msg.chat.id, "❌ Movie already exists or DB error.");
    }
  });
});

// ===== SEARCH MOVIE =====
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  try {
    const result = await pool.query(
      "SELECT * FROM movies WHERE name ILIKE $1",
      [`%${msg.text.trim().toLowerCase()}%`]
    );

    if (result.rows.length === 0)
      return bot.sendMessage(msg.chat.id, "❌ Movie not found.");

    const movie = result.rows[0];

    bot.sendMessage(msg.chat.id, `🎬 ${movie.name}`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⬇ Download",
              callback_data: `download_${movie.id}`
            }
          ]
        ]
      }
    });

  } catch (err) {
    console.error("Search error:", err.message);
    bot.sendMessage(msg.chat.id, "❌ Error retrieving movie.");
  }
});

// ===== DOWNLOAD BUTTON HANDLER =====
bot.on("callback_query", async (query) => {
  const data = query.data;

  if (!data.startsWith("download_")) return;

  const movieId = data.split("_")[1];

  try {
    const result = await pool.query(
      "SELECT * FROM movies WHERE id=$1",
      [movieId]
    );

    if (result.rows.length === 0)
      return bot.answerCallbackQuery(query.id, { text: "Movie not found." });

    const movie = result.rows[0];

    if (movie.file_id.startsWith("http")) {
      await bot.sendMessage(query.message.chat.id, movie.file_id);
    } else {
      await bot.sendVideo(query.message.chat.id, movie.file_id, {
        caption: movie.caption || "🎬 Enjoy!"
      });
    }

    bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.error("Download error:", err.message);
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
  if (msg.from.id.toString() !== ADMIN)
    return bot.sendMessage(msg.chat.id, "❌ Admin only.");

  const total = await pool.query("SELECT COUNT(*) FROM movies");

  bot.sendMessage(msg.chat.id, `📊 Total Movies: ${total.rows[0].count}`);
});

console.log("🚀 Advanced Bot Running...");
