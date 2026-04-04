package org.example;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.api.java.tuple.Tuple2;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;

import java.time.Duration;

public class StreamingJob {
    public static void main(String[] args) throws Exception {
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        // 1. Kafka Source
        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers("kafka:9092")
                .setTopics("events.raw")
                .setGroupId("flink-analytics-group")
                .setStartingOffsets(OffsetsInitializer.latest()) // Start from NOW to see immediate results
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<String> rawStream = env.fromSource(source, WatermarkStrategy.noWatermarks(), "Kafka Source");

        // 2. Parse JSON -> Event POJO
        DataStream<Event> eventStream = rawStream.map(json -> {
            ObjectMapper mapper = new ObjectMapper();
            return mapper.readValue(json, Event.class);
        });

        // 3. Assign Event-Time Watermarks (Tells Flink to trust the timestamp in the
        // JSON payload)
        WatermarkStrategy<Event> watermarkStrategy = WatermarkStrategy
                .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(2))
                .withTimestampAssigner((event, timestamp) -> event.timestamp);

        DataStream<Event> timedStream = eventStream.assignTimestampsAndWatermarks(watermarkStrategy);

        // 4. Analytics: Count events per type every 10 seconds
        DataStream<Tuple2<String, Integer>> aggregatedStream = timedStream
                // Map to (eventType, 1)
                .map(event -> new Tuple2<>(event.eventType, 1))
                .returns(Types.TUPLE(Types.STRING, Types.INT))
                // Group by eventType
                .keyBy(tuple -> tuple.f0)
                // 10-second Tumbling Window
                .window(TumblingEventTimeWindows.of(Time.seconds(10)))
                // Sum the counts
                .sum(1);

        // 5. Print the aggregated results
        aggregatedStream.print();

        env.execute("Real-Time Analytics Pipeline");
    }
}