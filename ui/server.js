const express = require('express');
const { createClient } = require('redis');
const { Pool } = require('pg');
const { Kafka } = require('kafkajs');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'client', 'dist')));

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.on('error', err => console.error('Redis Error', err));

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/analytics'
});

// Kafka Connection (For Simulation)
const kafka = new Kafka({ clientId: 'ui-api-producer', brokers: [process.env.KAFKA_BROKER || 'kafka:9092'] });
const producer = kafka.producer();

async function startServer() {
  await redisClient.connect();
  await producer.connect();

  // simulate endpoint
  app.post('/api/simulate', async (req, res) => {
    const { type, count } = req.body;
    const cities = ["Atlanta", "San Francisco", "New York", "Chicago"];
    const events = [];

    for (let i = 0; i < count; i++) {
      const eventType = type === 'surge' ? 'ride_request' : 'ride_complete';
      events.push({
        key: Math.floor(Math.random() * 1000).toString(),
        value: JSON.stringify({
          userId: Math.floor(Math.random() * 1000).toString(),
          eventType: eventType,
          city: cities[Math.floor(Math.random() * cities.length)],
          amount: eventType === 'ride_complete' ? +(Math.random() * 30 + 10).toFixed(2) : 0,
          timestamp: Date.now()
        })
      });
    }

    await producer.send({ topic: "events.raw", messages: events });
    res.json({ success: true, message: `Fired ${count} events into Kafka.` });
  });

  // live streaming endpoint
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
        const latency = await redisClient.get('pipeline_latency_ms') || 0; // Fetch latency
        
        res.write(`data: ${JSON.stringify({ metrics, requests, revenue, history, uniqueUsers, latency })}\n\n`);
      } catch (err) {
        console.error('Redis Fetch Error:', err);
      }
    }, 1000);

    req.on('close', () => clearInterval(intervalId));
  });

  //revenue endpoint
  app.get('/api/history/revenue', async (req, res) => {
    try {
      const query = `SELECT city, SUM(amount) as total_revenue FROM historical_revenue GROUP BY city ORDER BY total_revenue DESC;`;
      const result = await pgPool.query(query);
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.listen(port, () => console.log(`Dashboard on http://localhost:${port}`));
}

startServer();