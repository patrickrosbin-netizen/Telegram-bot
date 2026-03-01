// bot.js
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// =======================
// 1️⃣ BOT TOKEN
// =======================
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// =======================
// 2️⃣ ADMIN SETTINGS
// =======================
const ADMIN_ID = 7977914980;
let pendingMovie = null; // Track if admin is adding a movie
let addFlowStep = 0; // Track which step in add-movie flow

// =======================
// 3️⃣ LOAD MOVIES.JSON
// =======================
let movies = {};
if (fs.existsSync("movies.json")) {
  try {
    movies = JSON.parse(fs.readFileSync("movies.json"));
  } catch (err) {
    console.log("Error loading movies.json:", err);
    movies = {};
  }
}

// =======================
// 4️⃣ ADMIN STATS
// =======================
let stats = {
  totalMovies: Object.keys(movies).length,
  downloads: {} // key: movie title, value: count
};
for (let key in movies) if (!stats.downloads[key]) stats.downloads[key] = 0;

// =======================
// 5️⃣ SINGLE MESSAGE LISTENER
// =======================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text ? msg.text.trim() : "";

  // -----------------------
  // Admin add-movie flow
  // -----------------------
  if (userId === ADMIN_ID && pendingMovie) {
    if (addFlowStep === 0) {
      // Step 0: receive video or skip
      if (msg.video) {
        pendingMovieData = { file_id: msg.video.file_id };
        addFlowStep = 1;
        bot.sendMessage(chatId, "📸 Send poster URL (or type 'skip')");
      } else if (text.toLowerCase() === "skip") {
        pendingMovieData = {};
        addFlowStep = 1;
        bot.sendMessage(chatId, "🌐 Send download link for the large file:");
      } else {
        bot.sendMessage(chatId, "❌ Send a video file or type 'skip' for large file.");
      }
      return;
    }

    if (addFlowStep === 1) {
      // Step 1: poster URL or download link
      if (pendingMovieData.file_id) {
        // small file: poster
        pendingMovieData.poster = text.toLowerCase() === "skip" ? "" : text;
        addFlowStep = 2;
        bot.sendMessage(chatId, "📝 Send short description (or type 'skip')");
      } else {
        // large file: link
        if (!text.startsWith("http")) return bot.sendMessage(chatId, "❌ Invalid link. Try again.");
        pendingMovieData.link = text;
        addFlowStep = 2;
        bot.sendMessage(chatId, "📸 Send poster URL (or type 'skip')");
      }
      return;
    }

    if (addFlowStep === 2) {
      // Step 2: description or poster (depending on previous step)
      if (pendingMovieData.file_id) {
        pendingMovieData.description = text.toLowerCase() === "skip" ? "" : text;
      } else {
        pendingMovieData.poster = text.toLowerCase() === "skip" ? "" : text;
        addFlowStep = 3;
        bot.sendMessage(chatId, "📝 Send short description (or type 'skip')");
        return;
      }

      // Save movie
      movies[pendingMovie] = { title: pendingMovie, ...pendingMovieData };
      fs.writeFileSync("movies.json", JSON.stringify(movies, null, 2));

      // Update stats
      stats.totalMovies = Object.keys(movies).length;
      stats.downloads[pendingMovie] = 0;

      bot.sendMessage(chatId, `✅ Movie "${pendingMovie}" saved successfully!`);

      // Reset flow
      pendingMovie = null;
      addFlowStep = 0;
      return;
    }

    if (addFlowStep === 3) {
      // Step 3: description for large file
      pendingMovieData.description = text.toLowerCase() === "skip" ? "" : text;

      // Save movie
      movies[pendingMovie] = { title: pendingMovie, ...pendingMovieData };
      fs.writeFileSync("movies.json", JSON.stringify(movies, null, 2));

      stats.totalMovies = Object.keys(movies).length;
      stats.downloads[pendingMovie] = 0;

      bot.sendMessage(chatId, `✅ Large movie "${pendingMovie}" saved successfully!`);

      // Reset flow
      pendingMovie = null;
      addFlowStep = 0;
      return;
    }
  }

  // -----------------------
  // Search movies
  // -----------------------
  if (!text.startsWith("/")) {
    const movie = movies[text.toLowerCase()];
    if (!movie) return;

    const caption = `🎬 ${movie.title}` + (movie.description ? `\n\n📝 ${movie.description}` : "");

    if (movie.file_id) {
      bot.sendPhoto(chatId, movie.poster || "", {
        caption,
        reply_markup: {
          inline_keyboard: [[{ text: "⬇️ Download Movie", callback_data: text.toLowerCase() }]]
        }
      });
    } else if (movie.link) {
      bot.sendPhoto(chatId, movie.poster || "", {
        caption,
        reply_markup: {
          inline_keyboard: [[{ text: "⬇️ Download Movie", url: movie.link }]]
        }
      });
    }
    return;
  }

  // -----------------------
  // Admin commands
  // -----------------------
  if (text.startsWith("/addmovie") && userId === ADMIN_ID) {
    const args = text.split(" ").slice(1);
    if (!args[0]) return bot.sendMessage(chatId, "❌ Usage: /addmovie MovieTitle");
    pendingMovie = args.join(" ").toLowerCase();
    addFlowStep = 0;
    bot.sendMessage(chatId, `🎬 Starting add flow for "${pendingMovie}". Send video or type 'skip' for large file.`);
  }

  if (text === "/stats" && userId === ADMIN_ID) {
    let message = `📊 Admin Stats\n\nTotal Movies: ${stats.totalMovies}\n\n`;
    for (let key in stats.downloads) {
      message += `${movies[key].title}: ${stats.downloads[key]} downloads\n`;
    }
    bot.sendMessage(chatId, message);
  }
});

// =======================
// 6️⃣ Handle callback for small files
// =======================
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const movieKey = query.data.toLowerCase();
  const movie = movies[movieKey];
  if (!movie || !movie.file_id) return;

  bot.sendVideo(chatId, movie.file_id, { caption: `🎬 ${movie.title}` });

  if (!stats.downloads[movieKey]) stats.downloads[movieKey] = 0;
  stats.downloads[movieKey]++;

  bot.answerCallbackQuery(query.id);
});

console.log("✅ Bot running! Clean single-listener version with all features intact.");
