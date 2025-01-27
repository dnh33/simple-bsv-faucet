import { Handler } from "@netlify/functions";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

// Interface for our claims data
interface ClaimData {
  [address: string]: number; // address -> timestamp mapping
}

const CLAIMS_FILE = join(".netlify", "state", "claims.json");
const HOURS_24 = 24 * 60 * 60 * 1000;

const handler: Handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { address } = JSON.parse(event.body || "{}");

    if (!address) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Address is required" }),
      };
    }

    // Read existing claims
    let claims: ClaimData = {};
    try {
      const data = await readFile(CLAIMS_FILE, "utf8");
      claims = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, that's ok
    }

    // Check if address has claimed recently
    const lastClaim = claims[address];
    const now = Date.now();

    if (lastClaim && now - lastClaim < HOURS_24) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          canClaim: false,
          timeRemaining: HOURS_24 - (now - lastClaim),
        }),
      };
    }

    // Update claims data
    claims[address] = now;
    await writeFile(CLAIMS_FILE, JSON.stringify(claims, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify({ canClaim: true }),
    };
  } catch (error) {
    console.error("Error checking claim:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

export { handler };
