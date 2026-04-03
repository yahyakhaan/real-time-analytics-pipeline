const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "event-producer",
  brokers: ["localhost:9092"],
});

const producer = kafka.producer();

const eventTypes = ["page_view", "ride_request", "ride_complete"];

function generateEvent() {
  return {
    userId: Math.floor(Math.random() * 1000).toString(),
    eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
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