const express = require('express');
const { createClient } = require('redis');
const { Pool } = require('pg'); // NEW: Postgres Client
const path = require('path');

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'client', 'dist')));

// 1. Redis Connection (The "Hot" Path)
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.on('error', err => console.error('Redis Client Error', err));

// 2. Postgres Connection (The "Cold" Path)
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/analytics'
});

async function startServer() {
  await redisClient.connect();

  // --- LIVE STREAMING ENDPOINT (SSE) ---
  app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const intervalId = setInterval(async () => {
      try {
        const metrics = await redisClient.hGetAll('realtime_metrics');
        const requests = await redisClient.hGetAll('requests_by_city');
        const revenue = await redisClient.hGetAll('revenue_by_city');
        const history = await redisClient.lRange('requests_history', 0, -1);
        const uniqueUsers = await redisClient.pfCount('unique_users');
        
        res.write(`data: ${JSON.stringify({ metrics, requests, revenue, history, uniqueUsers })}\n\n`);
      } catch (err) {
        console.error('Error fetching from Redis:', err);
      }
    }, 1000);

    req.on('close', () => clearInterval(intervalId));
  });

  // --- HISTORICAL REST ENDPOINT ---
  app.get('/api/history/revenue', async (req, res) => {
    try {
      // Group by city and sum the windowed amounts to get the all-time total
      const query = `
        SELECT city, SUM(amount) as total_revenue 
        FROM historical_revenue 
        GROUP BY city 
        ORDER BY total_revenue DESC;
      `;
      const result = await pgPool.query(query);
      res.json(result.rows);
    } catch (err) {
      console.error('Postgres Query Error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.listen(port, () => console.log(`Dashboard on http://localhost:${port}`));
}

startServer();