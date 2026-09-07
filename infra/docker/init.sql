-- P0 infrastructure health only; protocol schema is specified but not implemented.
CREATE TABLE runtime_probe (
  name text PRIMARY KEY CHECK (name = 'worker'),
  updated_at timestamptz NOT NULL
);
