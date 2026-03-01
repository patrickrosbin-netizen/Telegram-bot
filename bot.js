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

  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(chatId, "❌ Not authorized.");
  }

  pendingMovie = match[1].toLowerCase().trim();
  bot.sendMessage(chatId, `🎬 Send the video file for "${pendingMovie}" now (or type "skip" if it's a large file and you will provide a download link).`);
});

// =======================
// 6️⃣ CAPTURE VIDEO OR LINK FOR ADMIN
// =======================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (!pendingMovie || msg.from.id !== ADMIN_ID) return;

  // If admin sends "skip" → large file mode
  if (msg.text && msg.text.toLowerCase() === "skip") {
    bot.sendMessage(chatId, `🌐 Send the download link for "${pendingMovie}" now:`);
    const linkCollector = (linkMsg) => {
      const link = linkMsg.text.trim();
      if (!link.startsWith("http")) {
        bot.sendMessage(chatId, "❌ Invalid link. Try again.");
        return;
      }

      // Ask for poster
      bot.sendMessage(chatId, `📸 Send poster URL (or type "skip"):`);

      const posterCollector = (posterMsg) => {
        let poster = posterMsg.text.trim();
        if (poster.toLowerCase() === "skip") poster = "";

        // Ask for description
        bot.sendMessage(chatId, `📝 Send short description (or type "skip"):`);

        const descCollector = (descMsg) => {
          let description = descMsg.text.trim();
          if (description.toLowerCase() === "skip") description = "";

          // Save movie
          movies[pendingMovie] = {
            title: pendingMovie,
            link: link,
            poster: poster,
            description: description
          };

          fs.writeFileSync("movies.json", JSON.stringify(movies, null, 2));

          stats.totalMovies = Object.keys(movies).length;
          stats.downloads[pendingMovie] = 0;

          bot.sendMessage(chatId, `✅ Movie "${pendingMovie}" saved! Users can now search and click the download button.`);

          pendingMovie = null;

          bot.removeListener("message", descCollector);
        };

        bot.on("message", descCollector);
        bot.removeListener("message", posterCollector);
      };

      bot.on("message", posterCollector);
      bot.removeListener("message", linkCollector);
    };

    bot.on("message", linkCollector);
    return;
  }

  // If a video file is sent (small file)
  if (msg.video) {
    // Ask for poster
    bot.sendMessage(chatId, `📸 Send poster URL (or type "skip"):`);

    const posterCollector = (posterMsg) => {
      let poster = posterMsg.text.trim();
      if (poster.toLowerCase() === "skip") poster = "";

      // Ask for description
      bot.sendMessage(chatId, `📝 Send short description (or type "skip"):`);

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

        stats.totalMovies = Object.keys(movies).length;
        stats.downloads[pendingMovie] = 0;

        bot.sendMessage(chatId, `✅ Movie "${pendingMovie}" saved! Users can now search and click the download button.`);

        pendingMovie = null;

        bot.removeListener("message", descCollector);
      };

      bot.on("message", descCollector);
      bot.removeListener("message", posterCollector);
    };

    bot.on("message", posterCollector);
  }
});

// =======================
// 7️⃣ SEARCH MOVIE SYSTEM
// =======================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text) return;
  const text = msg.text.toLowerCase().trim();
  if (text.startsWith("/")) return;

  const movie = movies[text];
  if (!movie) return;

  const caption = `🎬 ${movie.title}` + (movie.description ? `\n\n📝 ${movie.description}` : "");

  if (movie.poster) {
    if (movie.file_id) {
      // Small file → send poster + download button (inline, triggers sendVideo)
      bot.sendPhoto(chatId, movie.poster, {
        caption: caption,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬇️ Download Movie", callback_data: text }]
          ]
        }
      });
    } else if (movie.link) {
      // Large file → send poster + download button with URL
      bot.sendPhoto(chatId, movie.poster, {
        caption: caption,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬇️ Download Movie", url: movie.link }]
          ]
        }
      });
    }
  } else {
    if (movie.file_id) {
      bot.sendMessage(chatId, caption, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬇️ Download Movie", callback_data: text }]
          ]
        }
      });
    } else if (movie.link) {
      bot.sendMessage(chatId, caption, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬇️ Download Movie", url: movie.link }]
          ]
        }
      });
    }
  }
});

// =======================
// 8️⃣ HANDLE DOWNLOAD BUTTON FOR SMALL FILES
// =======================
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const movieKey = query.data;

  const movie = movies[movieKey];
  if (!movie) return;

  if (movie.file_id) {
    bot.sendVideo(chatId, movie.file_id, { caption: `🎬 ${movie.title}` });
    if (!stats.downloads[movieKey]) stats.downloads[movieKey] = 0;
    stats.downloads[movieKey]++;
  }

  bot.answerCallbackQuery(query.id);
});

// =======================
// 9️⃣ ADMIN STATS
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

console.log("✅ Bot running! Handles small and large files with previews & admin stats.");
