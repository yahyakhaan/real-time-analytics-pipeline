const express = require('express');
const { createClient } = require('redis');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.on('error', err => console.error('Redis Client Error', err));

async function startServer() {
  await redisClient.connect();

  app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const intervalId = setInterval(async () => {
      try {
        const metrics = await redisClient.hGetAll('realtime_metrics');
        const requests = await redisClient.hGetAll('requests_by_city');
        const revenue = await redisClient.hGetAll('revenue_by_city');
        
        // Fetch history array and Unique User count
        const history = await redisClient.lRange('requests_history', 0, -1);
        const uniqueUsers = await redisClient.pfCount('unique_users');
        
        res.write(`data: ${JSON.stringify({ metrics, requests, revenue, history, uniqueUsers })}\n\n`);
      } catch (err) {
        console.error('Error fetching from Redis:', err);
      }
    }, 1000);

    req.on('close', () => clearInterval(intervalId));
  });

  app.listen(port, () => console.log(`Dashboard on http://localhost:${port}`));
}

startServer();