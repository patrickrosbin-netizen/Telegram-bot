const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const bot = new TelegramBot(process.env.BOT, { polling: true });
const TMDB_API = process.env.TMDB_API;

bot.on("message", async (msg) => {

    const chatId = msg.chat.id;
    const query = msg.text;

    try {

        // ⭐ Multi Search (Movies + TV Series)
        const search = await axios.get(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API}&query=${encodeURIComponent(query)}`
        );

        const result = search.data.results;

        if (!result) {
            return bot.sendMessage(chatId, "❌ No results found");
        }

const result = results[0];
        // ⭐ Detect Movie OR Series
        const title = result.title || result.name;
        const release = result.release_date || result.first_air_date;
        const year = release ? release.split("-")[0] : "Unknown";
        const rating = result.vote_average || "N/A";
        const description = result.overview || "No description available";

        const poster = result.poster_path
            ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
            : null;

        // ⭐ Archive.org Download Search
        let downloadLink = "Not available";

        try {

            const archive = await axios.get(
                `https://archive.org/advancedsearch.php?q=${encodeURIComponent(title)}&output=json`
            );

            if (archive.data.response.docs.length > 0) {

                const id = archive.data.response.docs[0].identifier;

                downloadLink = `https://archive.org/details/${id}`;
            }

        } catch {
            downloadLink = "Not available";
        }

        // ⭐ Streaming Link
        const streamingLink =
            `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;

        // ⭐ Final Message
        const message = `
🎬 ${title}

📅 Year: ${year}
⭐ Rating: ${rating}/10

📝 Description:
${description}

📥 Download:
${downloadLink}

▶ Watch:
${streamingLink}
`;

        if (poster) {
            bot.sendPhoto(chatId, poster, { caption: message });
        } else {
            bot.sendMessage(chatId, message);
        }

    } catch (error) {

        console.log(error);
        bot.sendMessage(chatId, "⚠️ Error searching movie/series");

    }

});
