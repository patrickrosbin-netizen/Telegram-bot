const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const ADMIN_ID = 7977914980; // replace with your Telegram ID

// ---------- PostgreSQL Setup ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create movies table if it doesn't exist
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
  console.log("Database ready ✅");
})();

// ---------- Admin Add Movie Flow ----------
const pendingMovies = {}; // stores per-admin pending movies

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text ? msg.text.trim() : "";

  // ---------- Admin /addmovie command ----------
  if (text.startsWith("/addmovie") && userId === ADMIN_ID) {
    const args = text.split(" ").slice(1);
    if (!args[0]) return bot.sendMessage(chatId, "Usage: /addmovie moviename");

    pendingMovies[userId] = {
      key: args.join(" ").toLowerCase(),
      file_id: null,
      link: null,
      poster: null,
      description: null,
      step: "videoOrLink"
    };

    return bot.sendMessage(chatId, "🎬 Send small video or type a download link for the movie");
  }

  // ---------- Admin Add Flow ----------
  if (pendingMovies[userId]) {
    const movie = pendingMovies[userId];

    switch (movie.step) {
      case "videoOrLink":
        if (msg.video) {
          movie.file_id = msg.video.file_id;
        } else if (text) {
          movie.link = text;
        } else {
          return;
        }
        movie.step = "poster";
        return bot.sendMessage(chatId, "📸 Send poster URL or type 'skip'");

      case "poster":
        movie.poster = text.toLowerCase() === "skip" ? null : text;
        movie.step = "description";
        return bot.sendMessage(chatId, "📝 Send description or type 'skip'");

      case "description":
        movie.description = text.toLowerCase() === "skip" ? null : text;

        // Save to database
        await pool.query(
          `INSERT INTO movies (key, title, file_id, link, poster, description)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (key) DO UPDATE
           SET file_id=$3, link=$4, poster=$5, description=$6`,
          [
            movie.key,
            movie.key,
            movie.file_id,
            movie.link,
            movie.poster,
            movie.description
          ]
        );

        bot.sendMessage(chatId, `✅ Movie "${movie.key}" saved permanently!`);
        delete pendingMovies[userId];
        return;
    }
  }

  // ---------- Search Movie ----------
  if (!text.startsWith("/")) {
    const result = await pool.query("SELECT * FROM movies WHERE key = $1", [text.toLowerCase()]);
    if (result.rows.length === 0) return;

    const movie = result.rows[0];
    const caption =
      `🎬 ${movie.title}` + (movie.description ? `\n\n📝 ${movie.description}` : "");

    // Send video if file_id exists
    if (movie.file_id) {
      await pool.query("UPDATE movies SET downloads = downloads + 1 WHERE key = $1", [movie.key]);
      return bot.sendVideo(chatId, movie.file_id, { caption });
    }

    // Send download link if no file_id
    if (movie.link) {
      await pool.query("UPDATE movies SET downloads = downloads + 1 WHERE key = $1", [movie.key]);
      return bot.sendMessage(chatId, `${caption}\n\n⬇️ Download link: ${movie.link}`);
    }
  }

  // ---------- Admin Stats ----------
  if (text === "/stats" && userId === ADMIN_ID) {
    const result = await pool.query("SELECT title, downloads FROM movies");
    let message = "📊 Admin Stats\n\n";
    result.rows.forEach((row) => {
      message += `${row.title}: ${row.downloads} downloads\n`;
    });
    return bot.sendMessage(chatId, message);
  }
});

console.log("🚀 PostgreSQL Movie Bot Running");
