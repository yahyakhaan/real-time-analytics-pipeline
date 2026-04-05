# Real-Time Multi-Dimensional Analytics Pipeline: Architecture & Design

## 1. Problem Statement

Modern operational systems (such as ride-sharing grids, security camera networks, or high-traffic e-commerce platforms) generate telemetry at a velocity that traditional batch-processing pipelines cannot handle effectively. Relying purely on cron jobs and relational databases for live metrics results in high-latency dashboards, excessive database load, and an inability to react to systemic anomalies in real-time.

## 2. The Solution

This project implements a **Lambda Architecture** (specifically a modernized streaming variant) to process high-throughput events with sub-second latency while simultaneously maintaining a durable, long-term historical ledger.

It achieves this by decoupling data ingestion from processing, utilizing stateful stream aggregations, and splitting the processed output into a "hot" path (in-memory caching for live operations) and a "cold" path (relational database for historical analysis).

## 3. Data Flow & System Architecture

The pipeline processes data through five distinct stages:

1. **Ingestion (Node.js -> Kafka):** A simulated microservice generates randomized, multi-dimensional JSON events (page views, ride requests, completed rides with revenue) at a rate of 10 events/sec and publishes them to an Apache Kafka topic.
2. **Stream Processing (Apache Flink):** Flink consumes the raw stream, parses the JSON, and assigns Event-Time watermarks to handle out-of-order data.
3. **Stateful Aggregation:** Flink partitions the stream by dimensions (e.g., event type, city) and calculates rolling aggregates over a 10-second Tumbling Window. It also updates probabilistic data structures (HyperLogLog) to estimate unique active users without unbounded memory growth.
4. **Dual-Sink Routing (Redis + PostgreSQL):** \* _The Hot Path:_ Aggregations are written to Redis (Hashes and Lists) to overwrite the current live state for sub-millisecond retrieval.
   - _The Cold Path:_ Revenue aggregates are dual-written to PostgreSQL via JDBC batch inserts to build a permanent, queryable ledger.
5. **Presentation (Node.js API -> React SPA):** A backend service maintains an open Server-Sent Events (SSE) connection with the React frontend to stream live Redis updates, while providing REST endpoints to query the historical PostgreSQL data.

## 4. Technology Stack & Rationale

- **Apache Kafka (Message Broker):** Chosen for its high throughput, durability, and ability to act as a shock absorber. It decouples the data producers from the consumers, ensuring that sudden spikes in traffic do not overwhelm the analytics engine.
- **Apache Flink (Stream Processor):** Selected over Spark Streaming for its true event-at-a-time processing model and superior state management capabilities. Features utilized include:
  - _Event-Time Watermarking:_ Guarantees accurate aggregations even under network latency.
  - _Distributed Checkpointing:_ Ensures exactly-once processing semantics and fault tolerance.
  - _RichSinkFunctions:_ Custom implementations to manage external database connection pools across the cluster.
- **Redis (In-Memory Datastore):** Required for the "hot" data path. Flink writes to Redis at high frequencies, and the API reads from it continuously without incurring disk I/O penalties.
- **PostgreSQL (Relational Database):** Used as the durable "cold" storage for historical aggregations, allowing for complex, post-hoc querying.
- **Node.js & Express (Backend API):** The event-driven, non-blocking I/O model of Node.js is uniquely suited for holding open hundreds of concurrent Server-Sent Event (SSE) connections.
- **React & Chart.js (Frontend):** Provides a component-based, highly reactive UI that can consume rapid data streams and animate complex visualizations without forcing full DOM re-renders.
- **Docker Compose (Infrastructure):** Ensures the entire distributed ecosystem runs consistently and deterministically across any environment.

## 5. Version & Evolution History

- **v1.0 - The Foundation:** Established basic Kafka producer and consumer scripts. Flink ran locally, consuming raw strings and printing to `stdout`.
- **v1.1 - Containerization:** Migrated the infrastructure to Docker Compose. Upgraded Flink to the modern `KafkaSource` API. Implemented a multi-stage Gradle build to create a deployable Fat JAR.
- **v2.0 - Stateful Stream Processing:** Introduced Jackson for JSON serialization. Replaced processing-time with event-time watermarking. Implemented 10-second Tumbling Windows to calculate live aggregates. Replaced `stdout` with a custom Redis `RichSinkFunction`.
- **v2.1 - The Dashboard:** Enriched the event payload with geographic (`city`) and financial (`amount`) dimensions. Added a Node.js Express server acting as an SSE bridge to a vanilla HTML/Chart.js frontend.
- **v3.0 - Lambda Architecture (Current):** Evolved into a multi-sink topology. Added PostgreSQL for durable historical storage. Implemented HyperLogLog (`PFADD`/`PFCOUNT`) for memory-efficient Unique Active User tracking. Migrated the frontend to a React SPA built with Vite for improved state management and component isolation.
