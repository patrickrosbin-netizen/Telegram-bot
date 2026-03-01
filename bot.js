const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const ADMIN_ID = 7977914980;

let movies = {};
if (fs.existsSync("movies.json")) {
  movies = JSON.parse(fs.readFileSync("movies.json"));
}

let pendingMovie = null;
let pendingMovieData = {};

// =======================
// ADD MOVIE COMMAND
// =======================
bot.onText(/\/addmovie (.+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;

  pendingMovie = match[1].toLowerCase();
  pendingMovieData = {};

  bot.sendMessage(msg.chat.id, "Send video file or type 'skip' for large file.");
});

// =======================
// HANDLE VIDEO OR LINK
// =======================
bot.on("message", (msg) => {
  if (!pendingMovie || msg.from.id !== ADMIN_ID) return;

  if (msg.video) {
    pendingMovieData.file_id = msg.video.file_id;
    bot.sendMessage(msg.chat.id, "Send poster URL or type 'skip'.");
  } else if (msg.text && msg.text.toLowerCase() === "skip") {
    bot.sendMessage(msg.chat.id, "Send download link.");
  } else if (msg.text && msg.text.startsWith("http")) {
    if (!pendingMovieData.file_id) {
      pendingMovieData.link = msg.text;
      bot.sendMessage(msg.chat.id, "Send poster URL or type 'skip'.");
    } else {
      pendingMovieData.poster = msg.text;
      bot.sendMessage(msg.chat.id, "Send description or type 'skip'.");
    }
  } else if (msg.text) {
    pendingMovieData.description =
      msg.text.toLowerCase() === "skip" ? "" : msg.text;

    movies[pendingMovie] = {
      title: pendingMovie,
      ...pendingMovieData,
    };

    fs.writeFileSync("movies.json", JSON.stringify(movies, null, 2));

    bot.sendMessage(msg.chat.id, "Movie saved successfully!");

    pendingMovie = null;
    pendingMovieData = {};
  }
});

// =======================
// SEARCH MOVIE
// =======================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const key = msg.text.toLowerCase();
  const movie = movies[key];
  if (!movie) return;

  const caption =
    `🎬 ${movie.title}` +
    (movie.description ? `\n\n📝 ${movie.description}` : "");

  if (movie.file_id) {
    bot.sendPhoto(msg.chat.id, movie.poster || "", {
      caption,
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬇️ Download Movie", callback_data: key }],
        ],
      },
    });
  } else if (movie.link) {
    bot.sendPhoto(msg.chat.id, movie.poster || "", {
      caption,
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬇️ Download Movie", url: movie.link }],
        ],
      },
    });
  }
});

// =======================
// CALLBACK FOR SMALL FILES
// =======================
bot.on("callback_query", (query) => {
  const movie = movies[query.data];
  if (!movie || !movie.file_id) return;

  bot.sendVideo(query.message.chat.id, movie.file_id);
  bot.answerCallbackQuery(query.id);
});

console.log("Bot running (former multi-listener version)");
