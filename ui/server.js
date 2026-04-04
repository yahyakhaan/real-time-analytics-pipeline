const express = require('express');
const { createClient } = require('redis');
const path = require('path');

const app = express();
const port = 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Redis Client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', err => console.error('Redis Client Error', err));

async function startServer() {
  await redisClient.connect();

  // Server-Sent Events (SSE) Endpoint
  app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Poll Redis every 1 second and send data to the client
    const intervalId = setInterval(async () => {
      try {
        const metrics = await redisClient.hGetAll('realtime_metrics');
        // SSE format requires data to be prefixed with "data: " and end with "\n\n"
        res.write(`data: ${JSON.stringify(metrics)}\n\n`);
      } catch (err) {
        console.error('Error fetching from Redis:', err);
      }
    }, 1000);

    // Clean up when the client closes the tab
    req.on('close', () => {
      clearInterval(intervalId);
    });
  });

  app.listen(port, () => {
    console.log(`Live dashboard running on http://localhost:${port}`);
  });
}

startServer();