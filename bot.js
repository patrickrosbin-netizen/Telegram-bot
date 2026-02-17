
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = "8418112200:AAFeV6tbnSZ9Lsz8r5V62q8n0EmkEiw28Bc";
const apiKey = "38802c81";

const bot = new TelegramBot(token, { polling: true });

bot.on('message', async (msg) => {

    const chatId = msg.chat.id;
    const movieName = msg.text;

    try {

        const response = await axios.get(
            `https://www.omdbapi.com/?apikey=${apiKey}&t=${movieName}`
        );

        if(response.data.Response === "True"){

            await bot.sendPhoto(chatId, response.data.Poster);

            await bot.sendMessage(chatId,
`🎬 Title: ${response.data.Title}
⭐ Rating: ${response.data.imdbRating}
📅 Year: ${response.data.Year}`
            );

        } else {

            bot.sendMessage(chatId, "Movie not found");

        }

    } catch (error) {

        console.log(error);
        bot.sendMessage(chatId, "Error connecting to movie database");

    }

});
