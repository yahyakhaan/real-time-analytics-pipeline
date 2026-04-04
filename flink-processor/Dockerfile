# Stage 1: Build the Fat JAR using Gradle (RUNS ON JDK 17)
FROM gradle:8.4-jdk17 AS builder
WORKDIR /home/gradle/project
COPY . .
# Build the shadow jar
RUN ./gradlew :app:shadowJar --no-daemon

# Stage 2: Create the Flink Image (STANDARD 1.17 - RUNS ON JDK 11)
FROM flink:1.17
# Copy the built jar into Flink's user library directory
COPY --from=builder /home/gradle/project/app/build/libs/app-all.jar /opt/flink/usrlib/job.jar