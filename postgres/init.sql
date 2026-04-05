CREATE TABLE historical_revenue (
    id SERIAL PRIMARY KEY,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    city VARCHAR(50),
    amount NUMERIC(10, 2)
);