package org.example;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.api.java.tuple.Tuple2;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.jdbc.JdbcConnectionOptions;
import org.apache.flink.connector.jdbc.JdbcExecutionOptions;
import org.apache.flink.connector.jdbc.JdbcSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.sink.RichSinkFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import redis.clients.jedis.Jedis;

import java.time.Duration;

public class StreamingJob {

    // Standard Sink for Redis Hashes
    public static class RedisHashSink extends RichSinkFunction<Tuple2<String, String>> {
        private final String hashName;
        private transient Jedis jedis;

        public RedisHashSink(String hashName) {
            this.hashName = hashName;
        }

        @Override
        public void open(Configuration p) {
            jedis = new Jedis("redis", 6379);
        }

        @Override
        public void invoke(Tuple2<String, String> value, Context ctx) {
            jedis.hset(hashName, value.f0, value.f1);
        }

        @Override
        public void close() {
            if (jedis != null)
                jedis.close();
        }
    }

    public static void main(String[] args) throws Exception {
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        // Essential for exactly-once processing and failure recovery
        env.enableCheckpointing(5000);

        // 1. Kafka Source
        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers("kafka:9092")
                .setTopics("events.raw")
                .setGroupId("flink-analytics-group")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        // 2. Ingest, Parse, and Assign Watermarks
        DataStream<Event> timedStream = env
                .fromSource(source, WatermarkStrategy.noWatermarks(), "Kafka Source")
                .map(json -> new ObjectMapper().readValue(json, Event.class))
                .assignTimestampsAndWatermarks(WatermarkStrategy
                        .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(2))
                        .withTimestampAssigner((event, timestamp) -> event.timestamp));

        // STREAM 1: Overall Events (Count)
        timedStream
                .map(e -> new Tuple2<>(e.eventType, 1))
                .returns(Types.TUPLE(Types.STRING, Types.INT))
                .keyBy(t -> t.f0)
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                .sum(1)
                .map(t -> new Tuple2<>(t.f0, String.valueOf(t.f1)))
                .returns(Types.TUPLE(Types.STRING, Types.STRING))
                .addSink(new RedisHashSink("realtime_metrics"));

        // STREAM 2: Ride Requests by City (Count)
        timedStream
                .filter(e -> e.eventType.equals("ride_request"))
                .map(e -> new Tuple2<>(e.city, 1))
                .returns(Types.TUPLE(Types.STRING, Types.INT))
                .keyBy(t -> t.f0)
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                .sum(1)
                .map(t -> new Tuple2<>(t.f0, String.valueOf(t.f1)))
                .returns(Types.TUPLE(Types.STRING, Types.STRING))
                .addSink(new RedisHashSink("requests_by_city"));

        // STREAM 3: The Dual-Sink Topology (Revenue by City)
        // First, we calculate the core aggregation
        DataStream<Tuple2<String, Double>> revenueAggregation = timedStream
                .filter(e -> e.eventType.equals("ride_complete"))
                .map(e -> new Tuple2<>(e.city, e.amount))
                .returns(Types.TUPLE(Types.STRING, Types.DOUBLE))
                .keyBy(t -> t.f0)
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                .sum(1);

        // Path A: Write to Redis (String formatting for the live dashboard)
        revenueAggregation
                .map(t -> new Tuple2<>(t.f0, String.format("%.2f", t.f1)))
                .returns(Types.TUPLE(Types.STRING, Types.STRING))
                .addSink(new RedisHashSink("revenue_by_city"));

        // Path B: Write to PostgreSQL (Durable storage for historical analysis)
        revenueAggregation.addSink(
                JdbcSink.sink(
                        "INSERT INTO historical_revenue (city, amount) VALUES (?, ?)",
                        (statement, tuple) -> {
                            statement.setString(1, tuple.f0);
                            statement.setDouble(2, tuple.f1);
                        },
                        JdbcExecutionOptions.builder()
                                .withBatchSize(200) // Batch inserts for high throughput
                                .withBatchIntervalMs(1000) // Or flush every 1 second
                                .withMaxRetries(5) // Fault tolerance
                                .build(),
                        new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                                .withUrl("jdbc:postgresql://postgres:5432/analytics")
                                .withDriverName("org.postgresql.Driver")
                                .withUsername("admin")
                                .withPassword("password")
                                .build()));

        // STREAM 4: Time-Series History
        timedStream
                .map(e -> new Tuple2<>("ALL_EVENTS", 1))
                .returns(Types.TUPLE(Types.STRING, Types.INT))
                .keyBy(t -> t.f0)
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                .sum(1)
                .addSink(new RichSinkFunction<Tuple2<String, Integer>>() {
                    private transient Jedis jedis;

                    @Override
                    public void open(Configuration p) {
                        jedis = new Jedis("redis", 6379);
                    }

                    @Override
                    public void invoke(Tuple2<String, Integer> value, Context ctx) {
                        // LPUSH adds to the front of a list, LTRIM keeps only the last 30 items (5
                        // mins)
                        jedis.lpush("requests_history", String.valueOf(value.f1));
                        jedis.ltrim("requests_history", 0, 29);
                    }

                    @Override
                    public void close() {
                        if (jedis != null)
                            jedis.close();
                    }
                });

        // STREAM 5: Unique Active Users (HyperLogLog)
        timedStream
                .addSink(new RichSinkFunction<Event>() {
                    private transient Jedis jedis;

                    @Override
                    public void open(Configuration p) {
                        jedis = new Jedis("redis", 6379);
                    }

                    @Override
                    public void invoke(Event value, Context ctx) {
                        // PFADD adds elements to the HyperLogLog probabilistic structure
                        jedis.pfadd("unique_users", value.userId);
                    }

                    @Override
                    public void close() {
                        if (jedis != null)
                            jedis.close();
                    }
                });

        // STREAM 6: Pipeline Latency
        timedStream
                .map(event -> {
                    // System processing time minus the exact millisecond the event was generated
                    long latency = System.currentTimeMillis() - event.timestamp;
                    // Prevent negative latency from slight clock drifts across Docker containers
                    return String.valueOf(Math.max(0, latency));
                })
                .addSink(new RichSinkFunction<String>() {
                    private transient Jedis jedis;

                    @Override
                    public void open(Configuration p) {
                        jedis = new Jedis("redis", 6379);
                    }

                    @Override
                    public void invoke(String value, Context ctx) {
                        // SET replaces the value instantly (no hash map needed)
                        jedis.set("pipeline_latency_ms", value);
                    }

                    @Override
                    public void close() {
                        if (jedis != null)
                            jedis.close();
                    }
                });

        env.execute("Lambda Architecture Analytics Pipeline");
    }
}