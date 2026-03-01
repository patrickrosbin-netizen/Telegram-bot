const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const ADMIN_ID = 7977914980;

// ================= DATABASE =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Create table if not exists
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movies (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE,
      title TEXT,
      file_id TEXT,
      link TEXT,
      poster TEXT,
      description TEXT,
      downloads INTEGER DEFAULT 0
    )
  `);
  console.log("Database ready");
})();

// ================= ADD MOVIE FLOW =================
let pendingMovie = null;
let pendingData = {};
let step = 0;

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text ? msg.text.trim() : "";

  // ===== ADMIN ADD FLOW =====
  if (userId === ADMIN_ID && pendingMovie) {
    if (step === 0) {
      if (msg.video) {
        pendingData.file_id = msg.video.file_id;
        step = 1;
        return bot.sendMessage(chatId, "📸 Send poster URL or type 'skip'");
      }
      if (text.toLowerCase() === "skip") {
        step = 1;
        return bot.sendMessage(chatId, "🌐 Send download link");
      }
      return;
    }

    if (step === 1) {
      if (pendingData.file_id) {
        pendingData.poster = text.toLowerCase() === "skip" ? null : text;
        step = 2;
        return bot.sendMessage(chatId, "📝 Send description or type 'skip'");
      } else {
        pendingData.link = text;
        step = 2;
        return bot.sendMessage(chatId, "📸 Send poster URL or type 'skip'");
      }
    }

    if (step === 2) {
      if (pendingData.file_id) {
        pendingData.description =
          text.toLowerCase() === "skip" ? null : text;
      } else {
        pendingData.poster =
          text.toLowerCase() === "skip" ? null : text;
        step = 3;
        return bot.sendMessage(chatId, "📝 Send description or type 'skip'");
      }

      await saveMovie();
      return;
    }

    if (step === 3) {
      pendingData.description =
        text.toLowerCase() === "skip" ? null : text;
      await saveMovie();
      return;
    }

    async function saveMovie() {
      await pool.query(
        `INSERT INTO movies (key, title, file_id, link, poster, description)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (key) DO UPDATE
         SET file_id=$3, link=$4, poster=$5, description=$6`,
        [
          pendingMovie,
          pendingMovie,
          pendingData.file_id || null,
          pendingData.link || null,
          pendingData.poster || null,
          pendingData.description || null,
        ]
      );

      bot.sendMessage(chatId, "✅ Movie saved permanently!");

      pendingMovie = null;
      pendingData = {};
      step = 0;
    }

    return;
  }

  // ===== SEARCH =====
  if (!text.startsWith("/")) {
    const result = await pool.query(
      "SELECT * FROM movies WHERE key = $1",
      [text.toLowerCase()]
    );

    if (result.rows.length === 0) return;

    const movie = result.rows[0];

    const caption =
      `🎬 ${movie.title}` +
      (movie.description ? `\n\n📝 ${movie.description}` : "");

    if (movie.file_id) {
      bot.sendPhoto(chatId, movie.poster || "", {
        caption,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬇️ Download Movie", callback_data: movie.key }],
          ],
        },
      });
    } else if (movie.link) {
      bot.sendPhoto(chatId, movie.poster || "", {
        caption,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬇️ Download Movie", url: movie.link }],
          ],
        },
      });
    }

    return;
  }

  // ===== COMMANDS =====
  if (text.startsWith("/addmovie") && userId === ADMIN_ID) {
    const args = text.split(" ").slice(1);
    if (!args[0])
      return bot.sendMessage(chatId, "Usage: /addmovie moviename");

    pendingMovie = args.join(" ").toLowerCase();
    pendingData = {};
    step = 0;

    return bot.sendMessage(
      chatId,
      `🎬 Adding "${pendingMovie}". Send video or type 'skip'`
    );
  }

  if (text === "/stats" && userId === ADMIN_ID) {
    const result = await pool.query(
      "SELECT title, downloads FROM movies"
    );

    let message = "📊 Admin Stats\n\n";

    result.rows.forEach((row) => {
      message += `${row.title}: ${row.downloads} downloads\n`;
    });

    return bot.sendMessage(chatId, message);
  }
});

// ===== CALLBACK FOR SMALL FILE =====
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;

  const result = await pool.query(
    "SELECT * FROM movies WHERE key = $1",
    [query.data]
  );

  if (result.rows.length === 0) return;

  const movie = result.rows[0];
  if (!movie.file_id) return;

  await pool.query(
    "UPDATE movies SET downloads = downloads + 1 WHERE key = $1",
    [query.data]
  );

  bot.sendVideo(chatId, movie.file_id);
  bot.answerCallbackQuery(query.id);
});

console.log("🚀 PostgreSQL Movie Bot Running");
