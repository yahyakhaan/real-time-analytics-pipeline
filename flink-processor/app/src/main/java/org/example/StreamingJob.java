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

    // A reusable Redis Sink that takes the target Hash name as a parameter
    public static class RedisSink extends RichSinkFunction<Tuple2<String, String>> {
        private final String hashName;
        private transient Jedis jedis;

        public RedisSink(String hashName) {
            this.hashName = hashName;
        }

        @Override
        public void open(Configuration parameters) {
            jedis = new Jedis("redis", 6379);
        }

        @Override
        public void invoke(Tuple2<String, String> value, Context context) {
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
        env.enableCheckpointing(5000);

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers("kafka:9092")
                .setTopics("events.raw")
                .setGroupId("flink-analytics-group")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<Event> timedStream = env
                .fromSource(source, WatermarkStrategy.noWatermarks(), "Kafka Source")
                .map(json -> new ObjectMapper().readValue(json, Event.class))
                .assignTimestampsAndWatermarks(WatermarkStrategy
                        .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(2))
                        .withTimestampAssigner((event, timestamp) -> event.timestamp));

        // stream 1: Overall Events (Count)
        timedStream
                .map(e -> new Tuple2<>(e.eventType, 1))
                .returns(Types.TUPLE(Types.STRING, Types.INT))
                .keyBy(t -> t.f0)
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                .sum(1)
                .map(t -> new Tuple2<>(t.f0, String.valueOf(t.f1)))
                .returns(Types.TUPLE(Types.STRING, Types.STRING))
                .addSink(new RedisSink("realtime_metrics"));

        // stream 2: Ride Requests by City (Count)
        timedStream
                .filter(e -> e.eventType.equals("ride_request"))
                .map(e -> new Tuple2<>(e.city, 1))
                .returns(Types.TUPLE(Types.STRING, Types.INT))
                .keyBy(t -> t.f0)
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                .sum(1)
                .map(t -> new Tuple2<>(t.f0, String.valueOf(t.f1)))
                .returns(Types.TUPLE(Types.STRING, Types.STRING))
                .addSink(new RedisSink("requests_by_city"));

        // stream 3: Revenue by City (Sum of amount)
        timedStream
                .filter(e -> e.eventType.equals("ride_complete"))
                .map(e -> new Tuple2<>(e.city, e.amount))
                .returns(Types.TUPLE(Types.STRING, Types.DOUBLE))
                .keyBy(t -> t.f0)
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                .sum(1)
                .map(t -> new Tuple2<>(t.f0, String.format("%.2f", t.f1))) // Format to 2 decimal places
                .returns(Types.TUPLE(Types.STRING, Types.STRING))
                .addSink(new RedisSink("revenue_by_city"));

        env.execute("Multi-Dimensional Analytics Pipeline");
    }
}