-- Enable the uuid-ossp extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the squirts table for tracking squirt events
CREATE TABLE IF NOT EXISTS squirts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_address text NOT NULL,
  username text NOT NULL DEFAULT 'anon',
  amount integer NOT NULL,
  txid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Optional: Create an index on sender_address for faster queries
CREATE INDEX IF NOT EXISTS idx_squirts_sender_address ON squirts (sender_address); 