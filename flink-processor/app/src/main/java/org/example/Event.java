package org.example;

public class Event {
    public String userId;
    public String eventType;
    public String city;
    public double amount;
    public long timestamp;

    public Event() {
    }

    @Override
    public String toString() {
        return "Event{type='" + eventType + "', user='" + userId + "'}";
    }
}