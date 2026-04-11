import { TwitterApi } from 'twitter-api-v2';
import * as dotenv from 'dotenv';

dotenv.config();

const X_API_KEY = process.env.VITE_X_API_KEY;
const X_API_SECRET = process.env.VITE_X_API_SECRET;
const X_ACCESS_TOKEN = process.env.VITE_X_ACCESS_TOKEN;
const X_ACCESS_SECRET = process.env.VITE_X_ACCESS_SECRET;

async function debugX() {
  console.log("--- X API Debug Start ---");
  console.log("Checking environment variables...");
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    console.error("Error: Missing X API keys in .env");
    return;
  }
  console.log("Keys found. Initializing client...");

  const xClient = new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_SECRET,
  });

  try {
    console.log("Step 1: Fetching current user info (Verify Credentials)...");
    const me = await xClient.v2.me();
    console.log("Success! Authenticated as:", me.data.username, `(ID: ${me.data.id})`);
    
    console.log("Step 2: Attempting a test tweet...");
    const result = await xClient.v2.tweet(`Test Post from Rei System [Debug] - ${new Date().toLocaleTimeString()}`);
    console.log("Success! Tweet posted. ID:", result.data.id);
    
  } catch (error: any) {
    console.error("--- Error Occurred ---");
    if (error.data) {
      console.error("X API Error Data:", JSON.stringify(error.data, null, 2));
    } else {
      console.error("Error Message:", error.message);
    }
    console.error("Stack Trace:", error.stack);
  }
  console.log("--- Debug Finished ---");
}

debugX();
