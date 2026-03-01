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
let pendingMovie = null;

// =======================
// 3️⃣ LOAD MOVIES.JSON SAFELY
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

// Initialize download counters if not exist
for (let key in movies) {
  if (!stats.downloads[key]) stats.downloads[key] = 0;
}

// =======================
// 5️⃣ ADD MOVIE COMMAND
// =======================
bot.onText(/\/addmovie (.+)/, (msg, match) => {
  const chatId = msg.chat.id;

  // Only admin can add movies
  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(chatId, "❌ Not authorized.");
  }

  pendingMovie = match[1].toLowerCase().trim();
  bot.sendMessage(chatId, `🎬 Send the video file for "${pendingMovie}" now.`);
});

// =======================
// 6️⃣ CAPTURE VIDEO FOR ADMIN
// =======================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  // Only process if admin is sending video to add
  if (msg.video && pendingMovie && msg.from.id === ADMIN_ID) {

    // Ask admin for poster URL and description
    bot.sendMessage(chatId, `📸 Send poster URL for "${pendingMovie}" (or type "skip" to leave empty):`);
    
    const posterCollector = (posterMsg) => {
      let poster = posterMsg.text.trim();
      if (poster.toLowerCase() === "skip") poster = "";
      bot.sendMessage(chatId, `📝 Send short description for "${pendingMovie}" (or type "skip"):`);

      const descCollector = (descMsg) => {
        let description = descMsg.text.trim();
        if (description.toLowerCase() === "skip") description = "";

        // Save movie
        movies[pendingMovie] = {
          title: pendingMovie,
          file_id: msg.video.file_id,
          poster: poster,
          description: description
        };

        fs.writeFileSync("movies.json", JSON.stringify(movies, null, 2));

        // Update stats
        stats.totalMovies = Object.keys(movies).length;
        stats.downloads[pendingMovie] = 0;

        bot.sendMessage(chatId, `✅ Movie "${pendingMovie}" saved! Users can now search and click the download button.`);

        pendingMovie = null;

        // Remove listeners
        bot.removeListener("message", descCollector);
      };

      bot.on("message", descCollector);

      // Remove poster listener
      bot.removeListener("message", posterCollector);
    };

    bot.on("message", posterCollector);
  }
});

// =======================
// 7️⃣ SEARCH MOVIE SYSTEM (private + groups) with preview
// =======================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text) return;
  const text = msg.text.toLowerCase().trim();
  if (text.startsWith("/")) return;

  const movie = movies[text];
  if (!movie) return;

  // Send poster + caption
  const caption = `🎬 ${movie.title}` + (movie.description ? `\n\n📝 ${movie.description}` : "");
  if (movie.poster) {
    bot.sendPhoto(chatId, movie.poster, {
      caption: caption,
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬇️ Download Movie", callback_data: text }]
        ]
      }
    });
  } else {
    bot.sendMessage(chatId, caption, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬇️ Download Movie", callback_data: text }]
        ]
      }
    });
  }
});

// =======================
// 8️⃣ HANDLE DOWNLOAD BUTTON
// =======================
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const movieKey = query.data;

  if (movies[movieKey]) {
    bot.sendVideo(chatId, movies[movieKey].file_id, {
      caption: `🎬 ${movies[movieKey].title}`
    });

    // Update download stats
    if (!stats.downloads[movieKey]) stats.downloads[movieKey] = 0;
    stats.downloads[movieKey]++;
  }

  bot.answerCallbackQuery(query.id);
});

// =======================
// 9️⃣ ADMIN STATS COMMAND
// =======================
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.id !== ADMIN_ID) return;

  let message = `📊 Admin Stats\n\n`;
  message += `Total Movies: ${stats.totalMovies}\n\n`;
  for (let key in stats.downloads) {
    message += `${movies[key].title}: ${stats.downloads[key]} downloads\n`;
  }

  bot.sendMessage(chatId, message);
});

console.log("✅ Bot running with movie previews & admin stats. Admin can add movies in private or groups.");
