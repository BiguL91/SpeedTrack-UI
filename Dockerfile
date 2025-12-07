# Stage 1: Build React Frontend
FROM node:18-alpine as build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup Backend & Serve Frontend
FROM node:18-slim

# Install Ookla Speedtest CLI
RUN apt-get update && apt-get install -y curl gnupg1 apt-transport-https dirmngr \
    && curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash \
    && apt-get install -y speedtest

WORKDIR /app

# Copy Backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./

# Copy built Frontend from Stage 1
COPY --from=build /app/frontend/build ./public

# Expose Port
EXPOSE 5000

# Start Server
CMD ["node", "server.js"]
