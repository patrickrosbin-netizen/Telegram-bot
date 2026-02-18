const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// Load variables from Railway environment
const token = process.env.BOT_TOKEN;
const TMDB_KEY = process.env.TMDB_KEY;

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎬 Send any movie or TV series name. I will show multiple search results!");
});

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const query = msg.text;

    if (!query || query.startsWith("/")) return; // ignore commands

    try {
        // ⭐ Multi-search TMDb
        const search = await axios.get("https://api.themoviedb.org/3/search/multi", {
            params: { api_key: TMDB_KEY, query: query }
        });

        const results = search.data.results;

        if (!results || results.length === 0) {
            return bot.sendMessage(chatId, "❌ No results found.");
        }

        // Take top 5 results
        const topResults = results.slice(0, 5);

        // Build buttons for user to select
        const buttons = topResults.map((item, index) => {
            const title = item.title || item.name || "Unknown";
            return [{ text: `${index + 1}. ${title}`, callback_data: `select_${index}` }];
        });

        await bot.sendMessage(chatId, "Select a movie/series from the results:", {
            reply_markup: { inline_keyboard: buttons }
        });

        // Store results temporarily for this chat
        bot.userResults = bot.userResults || {};
        bot.userResults[chatId] = topResults;

    } catch (error) {
        console.log("ERROR:", error.message);
        bot.sendMessage(chatId, "❌ Error searching TMDb. Try again later.");
    }
});

// Handle user selecting a movie from inline buttons
bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (!data.startsWith("select_")) return;

    const index = parseInt(data.split("_")[1]);
    const selected = bot.userResults?.[chatId]?.[index];

    if (!selected) {
        return bot.sendMessage(chatId, "❌ Selection expired or invalid.");
    }

    const title = selected.title || selected.name || "Unknown";
    const release = selected.release_date || selected.first_air_date || "";
    const year = release ? release.split("-")[0] : "N/A";
    const rating = selected.vote_average || "N/A";
    const description = selected.overview || "No description available";

    const poster = selected.poster_path
        ? `https://image.tmdb.org/t/p/w500${selected.poster_path}`
        : null;

    // ⭐ Archive.org direct download
    let downloadLink = "Not available";
    try {
        const archive = await axios.get(
            `https://archive.org/advancedsearch.php?q=${encodeURIComponent(title)}&fl[]=identifier&sort[]=downloads desc&output=json`
        );
        if (archive.data.response.docs.length > 0) {
            const id = archive.data.response.docs[0].identifier;
            downloadLink = `https://archive.org/download/${id}/${id}.mp4`;
        }
    } catch {}

    // Streaming fallback
    const webLink = `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;

    const message = `🎬 ${title}
📅 Year: ${year}
⭐ Rating: ${rating}/10

📝 ${description}

📥 Direct Download: ${downloadLink}
🌐 Streaming / Watch Online: ${webLink}`;

    if (poster) {
        bot.sendPhoto(chatId, poster, { caption: message });
    } else {
        bot.sendMessage(chatId, message);
    }

    // Clear stored results to save memory
    if (bot.userResults?.[chatId]) delete bot.userResults[chatId];

    // Answer callback query to remove loading spinner
    bot.answerCallbackQuery(callbackQuery.id);
});
