package org.example;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

public class StreamingJob {
    public static void main(String[] args) throws Exception {
        // 1. Execution environment
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        // 2. Modern Kafka Source API
        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers("kafka:9092") // Points to the Docker network
                .setTopics("events.raw")
                .setGroupId("flink-group")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        // 3. Source stream (Watermarks will be added in Phase 2)
        DataStream<String> stream = env.fromSource(source, WatermarkStrategy.noWatermarks(), "Kafka Source");

        // 4. Simple processing (for now)
        stream.print();

        // 5. Execute job
        env.execute("Real-Time Analytics Pipeline");
    }
}