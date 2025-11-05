const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");

// Load environment variables (though ROBLOX_COOKIE is now optional)
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Helper Functions to get User and Presence Info ---

/**
 * Retrieves the Roblox User ID for a given username.
 * @param {string} username The Roblox username.
 * @returns {Promise<number|undefined>} The user ID or undefined if not found.
 */
async function getUserId(username) {
  const resp = await axios.post(
    "https://users.roblox.com/v1/usernames/users",
    { usernames: [username] },
    { headers: { "Content-Type": "application/json" } }
  );

  return resp.data.data?.[0]?.id;
}

/**
 * Generates the necessary headers, optionally including the Cookie.
 * It reads the cookie from the custom request header 'x-roblox-cookie'.
 * @param {object} req The Express request object.
 * @returns {object} The headers object for Axios requests.
 */
function getHeaders(req) {
  // Read the cookie dynamically from a custom header
  const cookie = req.headers['x-roblox-cookie'];

  if (!cookie) {
    return {};
  }

  // Format the cookie correctly for the Roblox API
  return {
    'Cookie': `.ROBLOSECURITY=${cookie}`
  };
}

/**
 * Retrieves the presence status for a specific user ID.
 * @param {number} userId The Roblox user ID.
 * @param {object} headers The dynamic headers object containing the cookie (if available).
 * @returns {Promise<object>} The user presence data.
 */
async function getPresence(userId, headers) {
  const body = { userIds: [userId] };
  // Use the dynamically provided headers
  const resp = await axios.post("https://presence.roblox.com/v1/presence/users", body, { headers });
  return resp.data.userPresences[0];
}

/**
 * Retrieves the game name (place details) for a given placeId or universeId.
 * @param {number} placeId The Roblox place or universe ID.
 * @param {object} headers The dynamic headers object containing the cookie (if available).
 * @returns {Promise<string>} The game name or "Unknown Place".
 */
async function getGameInfo(placeId, headers) {
  if (!placeId) return "Unknown Place";

  try {
    const resp = await axios.get(
      `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}`,
      { headers } // Use the dynamically provided headers
    );
    const placeData = resp.data[0];
    // universeId is used in the presence data, but the API endpoint 
    // requires placeIds. If the presence only gives universeId and not placeId,
    // this call might fail if universeId isn't a valid placeId. 
    // We stick to presence.placeId for best results.
    return placeData?.name || "Unknown Place";
  } catch (err) {
    // Log error for debugging, but return generic message
    console.error(`Error fetching game info for placeId ${placeId}:`, err.message);
    return "Unknown Place";
  }
}


// --- API Endpoint ---

app.get("/api/status", async (req, res) => {
  const users = [
    "Taloongoodboy",
    "Basoka001",
    "Basooka002",
    "Basooka003",
    "Basooka004",
    "nyukk1000",
    "nyukk1002",
    "nyukk10003",
    "kuya0600",
    "uubyyror",
    "talonbaikk63",
    "ermancing_1",
    "Duck_CHILL37",
    "Julian_Dawn72",
    "NovaPrism200531",
    "XxOw3nQu33nTurb0xX",
    "Fr0st_TIG3R53",
    "IsabellaFireBlade201",
    "StormMoonGolden79"
  ]
  const results = [];

  // Get dynamic headers for this specific request
  const dynamicHeaders = getHeaders(req);

  for (const username of users) {
    try {
      const userId = await getUserId(username);

      const presence = await getPresence(userId, dynamicHeaders);

      let mapName = "Offline";
      if (presence.placeId) {
        mapName = await getGameInfo(presence.placeId, dynamicHeaders);
      } else if (presence.userPresenceType === 3) {
        mapName = "In Game (placeId hidden)";
      } else if (presence.userPresenceType === 2) {
        mapName = "In Studio";
      } else if (presence.userPresenceType === 1) {
        mapName = "Online";
      }

      results.push({
        username,
        status:
          presence.userPresenceType === 0
            ? "Offline"
            : presence.userPresenceType === 1
              ? "Online"
              : "In Game", 
        placeId: presence.placeId || null,
        mapName,
        lastLocation: presence.lastLocation || "FISH IT",
      });
    } catch (err) {
      console.error(`Error processing user ${username}:`, err.message);
      results.push({ username, error: err.message });
    }
  }

  res.json(results);
});

app.listen(3000, () => console.log("✅ Server running at http://localhost:3000"));
