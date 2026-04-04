package org.example;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.api.java.tuple.Tuple2;
import org.apache.flink.configuration.Configuration;
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

    // --- CUSTOM REDIS SINK ---
    // Demonstrates understanding of Flink's distributed lifecycle
    public static class RedisSink extends RichSinkFunction<Tuple2<String, Integer>> {
        private transient Jedis jedis;

        @Override
        public void open(Configuration parameters) throws Exception {
            // Flink calls this ONCE per TaskManager thread before processing starts.
            // "redis" resolves to the Docker container named redis.
            jedis = new Jedis("redis", 6379);
        }

        @Override
        public void invoke(Tuple2<String, Integer> value, Context context) throws Exception {
            // Flink calls this for EVERY windowed record.
            // We store the data in a Redis Hash.
            // Key: "realtime_metrics", Field: eventType, Value: count
            jedis.hset("realtime_metrics", value.f0, String.valueOf(value.f1));
        }

        @Override
        public void close() throws Exception {
            // Flink calls this on shutdown to prevent memory leaks.
            if (jedis != null) {
                jedis.close();
            }
        }
    }

    public static void main(String[] args) throws Exception {
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        // --- FAANG TIER: RESILIENCE ---
        // Enable Checkpointing every 5 seconds. Flink will take a snapshot of the
        // window
        // state and offsets. If a node dies, it recovers exactly-once processing.
        env.enableCheckpointing(5000);

        // 1. Kafka Source
        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers("kafka:9092")
                .setTopics("events.raw")
                .setGroupId("flink-analytics-group")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<String> rawStream = env.fromSource(source, WatermarkStrategy.noWatermarks(), "Kafka Source");

        // 2. Parse JSON -> Event POJO
        DataStream<Event> eventStream = rawStream.map(json -> {
            ObjectMapper mapper = new ObjectMapper();
            return mapper.readValue(json, Event.class);
        });

        // 3. Assign Event-Time Watermarks
        WatermarkStrategy<Event> watermarkStrategy = WatermarkStrategy
                .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(2))
                .withTimestampAssigner((event, timestamp) -> event.timestamp);

        DataStream<Event> timedStream = eventStream.assignTimestampsAndWatermarks(watermarkStrategy);

        // 4. Analytics: Count events per type every 10 seconds
        DataStream<Tuple2<String, Integer>> aggregatedStream = timedStream
                .map(event -> new Tuple2<>(event.eventType, 1))
                .returns(Types.TUPLE(Types.STRING, Types.INT))
                .keyBy(tuple -> tuple.f0)
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                .sum(1);

        // 5. THE SINK: Write to Redis instead of standard output
        aggregatedStream.addSink(new RedisSink());

        env.execute("Real-Time Analytics Pipeline");
    }
}