# Use the official Node.js LTS image
FROM node:18

# Install system dependencies
RUN apt-get update && apt-get install -y libatomic1

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your bot code
COPY . .

# Run the bot
CMD ["node", "bot.js"]
