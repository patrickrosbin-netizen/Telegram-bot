const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const bot = new TelegramBot(process.env.BOT, { polling: true });

const TMDB_API = "d97d11510f77aa1f9e5b53c397e2613f";

bot.on("message", async (msg) => {

    const chatId = msg.chat.id;
    const movieName = msg.text;

    try {

        // ---------- Search Movie ----------
        const movieRes = await axios.get(
            `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API}&query=${encodeURIComponent(movieName)}`
        );

        const movie = movieRes.data.results[0];

        if (!movie) {
            return bot.sendMessage(chatId, "❌ Movie not found");
        }

        // ---------- Movie Info ----------
        const poster = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
        const year = movie.release_date?.split("-")[0] || "Unknown";
        const rating = movie.vote_average || "N/A";
        const description = movie.overview || "No description available";

        // ---------- Archive.org Search ----------
        let archiveLink = "Not available";

        try {
            const archiveRes = await axios.get(
                `https://archive.org/advancedsearch.php?q=${encodeURIComponent(movie.title)}&output=json`
            );

            if (archiveRes.data.response.docs.length > 0) {
                archiveLink = `https://archive.org/details/${archiveRes.data.response.docs[0].identifier}`;
            }

        } catch {
            archiveLink = "Not available";
        }

        // ---------- JustWatch Link ----------
        const justWatch = `https://www.justwatch.com/us/search?q=${encodeURIComponent(movie.title)}`;

        // ---------- Final Message ----------
        const message = `
🎬 *${movie.title}*

📅 Year: ${year}
⭐ Rating: ${rating}/10

📝 Description:
${description}

📥 Download (Public Domain):
${archiveLink}

▶ Watch Legally:
${justWatch}
`;

        bot.sendPhoto(chatId, poster, {
            caption: message,
            parse_mode: "Markdown"
        });

    } catch (error) {
        console.log(error);
        bot.sendMessage(chatId, "⚠️ Error fetching movie");
    }

});
