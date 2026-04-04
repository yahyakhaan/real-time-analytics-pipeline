package org.example;

public class Event {
    public String userId;
    public String eventType;
    public long timestamp;

    // Flink requires an empty constructor
    public Event() {
    }

    @Override
    public String toString() {
        return "Event{type='" + eventType + "', user='" + userId + "'}";
    }
}