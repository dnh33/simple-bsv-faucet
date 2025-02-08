-- Enable RLS on the squirts table
ALTER TABLE squirts ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Allow anyone to read squirts data
CREATE POLICY "Allow public read access"
ON squirts FOR SELECT
TO public
USING (true);

-- Allow inserts but validate the data
CREATE POLICY "Allow validated inserts"
ON squirts FOR INSERT
TO public
WITH CHECK (
  -- Ensure required fields are present and valid
  sender_address IS NOT NULL AND
  amount > 0 AND
  txid IS NOT NULL
);

-- Explicitly deny updates and deletes
CREATE POLICY "Deny updates"
ON squirts FOR UPDATE
TO public
USING (false);

CREATE POLICY "Deny deletes"
ON squirts FOR DELETE
TO public
USING (false); 