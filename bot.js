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
// 4️⃣ ADD MOVIE COMMAND
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
// 5️⃣ CAPTURE VIDEO FOR ADMIN
// =======================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  // Only process if admin is sending video to add
  if (msg.video && pendingMovie && msg.from.id === ADMIN_ID) {

    movies[pendingMovie] = {
      title: pendingMovie,
      file_id: msg.video.file_id
    };

    // Save to movies.json
    fs.writeFileSync("movies.json", JSON.stringify(movies, null, 2));

    // Confirm saved (don’t send video yet)
    bot.sendMessage(chatId, `✅ Movie "${pendingMovie}" saved! Users can now search and click the download button.`);

    pendingMovie = null;
  }
});

// =======================
// 6️⃣ SEARCH MOVIE SYSTEM (private + groups)
// =======================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text) return;
  const text = msg.text.toLowerCase().trim();
  if (text.startsWith("/")) return;

  if (movies[text]) {
    bot.sendMessage(chatId,
      `🎬 ${movies[text].title}\nClick below to download:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬇️ Download Movie", callback_data: text }
            ]
          ]
        }
      }
    );
  }
});

// =======================
// 7️⃣ HANDLE DOWNLOAD BUTTON
// =======================
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const movieKey = query.data;

  if (movies[movieKey]) {
    bot.sendVideo(chatId, movies[movieKey].file_id, {
      caption: `🎬 ${movies[movieKey].title}`
    });
  }

  bot.answerCallbackQuery(query.id);
});

console.log("✅ Bot is running safely. Admin can add movies in private or groups.");
