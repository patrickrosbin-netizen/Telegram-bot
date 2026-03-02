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

// ===== SAFE DATABASE MIGRATION =====
(async () => {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        file_id TEXT NOT NULL,
        caption TEXT
      )
    `);

    // Safe ALTER TABLE to add new columns only if they don't exist
    const columns = ['poster','year','rating','description'];
    for (const col of columns) {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='movies' AND column_name='${col}') THEN
            ALTER TABLE movies ADD COLUMN ${col} TEXT;
          END IF;
        END $$;
      `);
    }

    console.log("✅ Database ready with all columns");
  } catch (err) {
    console.error("DB INIT ERROR:", err.message);
    process.exit(1);
  }
})();

// ===== HELPER: WAIT FOR NEXT MESSAGE =====
function waitForMessage(chatId) {
  return new Promise((resolve) => {
    const listener = (msg) => {
      if (msg.chat.id === chatId) {
        bot.removeListener("message", listener);
        resolve(msg);
      }
    };
    bot.on("message", listener);
  });
}

// ===== ADMIN ADD MOVIE WITH METADATA =====
bot.onText(/\/addmovie (.+)/, async (msg, match) => {
  if (msg.from.id.toString() !== ADMIN) return bot.sendMessage(msg.chat.id, "❌ Admin only.");

  const movieName = match[1].trim().toLowerCase();
  let movieData = { name: movieName };

  try {
    // Step 1: Get video/file
    await bot.sendMessage(msg.chat.id, "Send the video file OR direct link:");
    const videoMsg = await waitForMessage(msg.chat.id);
    if (videoMsg.video) movieData.file_id = videoMsg.video.file_id;
    else if (videoMsg.text && videoMsg.text.startsWith("http")) movieData.file_id = videoMsg.text;
    else return bot.sendMessage(msg.chat.id, "❌ Invalid video/link input.");

    movieData.caption = videoMsg.caption || "";

    // Step 2: Poster
    await bot.sendMessage(msg.chat.id, "Send poster image (Telegram photo/file_id or URL) or type 'skip':");
    const posterMsg = await waitForMessage(msg.chat.id);
    if (posterMsg.photo) movieData.poster = posterMsg.photo[posterMsg.photo.length - 1].file_id;
    else if (posterMsg.text && posterMsg.text.toLowerCase() !== "skip") movieData.poster = posterMsg.text;

    // Step 3: Year
    await bot.sendMessage(msg.chat.id, "Enter movie year or type 'skip':");
    const yearMsg = await waitForMessage(msg.chat.id);
    if (yearMsg.text && yearMsg.text.toLowerCase() !== "skip") movieData.year = yearMsg.text;

    // Step 4: Rating
    await bot.sendMessage(msg.chat.id, "Enter rating or type 'skip':");
    const ratingMsg = await waitForMessage(msg.chat.id);
    if (ratingMsg.text && ratingMsg.text.toLowerCase() !== "skip") movieData.rating = ratingMsg.text;

    // Step 5: Description
    await bot.sendMessage(msg.chat.id, "Enter description or type 'skip':");
    const descMsg = await waitForMessage(msg.chat.id);
    if (descMsg.text && descMsg.text.toLowerCase() !== "skip") movieData.description = descMsg.text;

    // Insert into database
    await pool.query(
      `INSERT INTO movies (name,file_id,caption,poster,year,rating,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        movieData.name,
        movieData.file_id,
        movieData.caption || "",
        movieData.poster || null,
        movieData.year || null,
        movieData.rating || null,
        movieData.description || null
      ]
    );

    bot.sendMessage(msg.chat.id, "✅ Movie saved successfully with metadata!");
  } catch (err) {
    console.error("ADD MOVIE ERROR:", err.message);
    bot.sendMessage(msg.chat.id, "❌ Failed to add movie. It may already exist.");
  }
});

// ===== SEARCH MOVIE WITH PAGINATION & METADATA =====
const PAGE_SIZE = 5;

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const search = msg.text.trim().toLowerCase();
  await sendSearchResults(msg.chat.id, search, 0);
});

async function sendSearchResults(chatId, search, page) {
  try {
    const result = await pool.query(
      "SELECT * FROM movies WHERE LOWER(name) LIKE $1 ORDER BY name ASC",
      [`%${search}%`]
    );

    if (!result.rows.length) return bot.sendMessage(chatId, "❌ Movie not found.");

    const start = page * PAGE_SIZE;
    const moviesPage = result.rows.slice(start, start + PAGE_SIZE);

    for (const movie of moviesPage) {
      let caption = `🎬 ${movie.name}\n`;
      if (movie.year) caption += `📅 Year: ${movie.year}\n`;
      if (movie.rating) caption += `⭐ Rating: ${movie.rating}\n`;
      if (movie.description) caption += `📝 ${movie.description}\n`;

      const buttons = [];
      if (movie.file_id) buttons.push([{ text: "⬇ Download", callback_data: `download_${movie.id}` }]);

      if (movie.poster) {
        await bot.sendPhoto(chatId, movie.poster, { caption, reply_markup: { inline_keyboard: buttons } });
      } else {
        await bot.sendMessage(chatId, caption, { reply_markup: { inline_keyboard: buttons } });
      }
    }

    // Pagination buttons
    const paginationButtons = [];
    if (start > 0) paginationButtons.push({ text: "⬅ Prev", callback_data: `page_${search}_${page - 1}` });
    if (start + PAGE_SIZE < result.rows.length) paginationButtons.push({ text: "Next ➡", callback_data: `page_${search}_${page + 1}` });
    if (paginationButtons.length) {
      await bot.sendMessage(chatId, "📑 Page Navigation", { reply_markup: { inline_keyboard: [paginationButtons] } });
    }
  } catch (err) {
    console.error("SEARCH ERROR:", err.message);
    bot.sendMessage(chatId, "❌ Search system error.");
  }
}

// ===== CALLBACK HANDLER =====
bot.on("callback_query", async (query) => {
  const data = query.data;

  // Download movie
  if (data.startsWith("download_")) {
    const movieId = data.split("_")[1];
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
  }

  // Pagination
  else if (data.startsWith("page_")) {
    const [, search, page] = data.split("_");
    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
    await sendSearchResults(query.message.chat.id, search, parseInt(page));
  }
});

// ===== CHANNEL AUTO SAVE =====
bot.on("channel_post", async (msg) => {
  if (!msg.video || !msg.caption) return;
  const movieName = msg.caption.trim().toLowerCase();
  try {
    await pool.query(
      "INSERT INTO movies (name,file_id,caption) VALUES ($1,$2,$3)",
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

console.log("🚀 Advanced Bot Running (METADATA + PAGINATION + DOWNLOAD + SAFE ALTER TABLE)...");
