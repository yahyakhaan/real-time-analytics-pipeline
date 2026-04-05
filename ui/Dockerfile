# Stage 1: Build the React Frontend
FROM node:18-alpine as builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Run the Express API Server
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY server.js ./
# Copy the compiled React files from Stage 1 into the backend folder
COPY --from=builder /app/client/dist ./client/dist
EXPOSE 3000
CMD ["node", "server.js"]