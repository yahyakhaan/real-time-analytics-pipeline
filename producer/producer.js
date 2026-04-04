const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "event-producer",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"], 
});

const producer = kafka.producer();

const eventTypes = ["page_view", "ride_request", "ride_complete"];
const cities = ["Atlanta", "San Francisco", "New York", "Chicago"];

function generateEvent() {
  const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  
  // only completed rides generate revenue
  const amount = type === "ride_complete" ? +(Math.random() * 30 + 10).toFixed(2) : 0;

  return {
    userId: Math.floor(Math.random() * 1000).toString(),
    eventType: type,
    city: cities[Math.floor(Math.random() * cities.length)],
    amount: amount,
    timestamp: Date.now(),
  };
}

async function run() {
  await producer.connect();

  setInterval(async () => {
    const event = generateEvent();

    await producer.send({
      topic: "events.raw",
      messages: [
        {
          key: event.userId,
          value: JSON.stringify(event),
        },
      ],
    });

    console.log("Sent:", event);
  }, 100); // 10 events/sec
}

run();