import fs from "node:fs";

const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
if (envFileArg) {
  const envFile = envFileArg.slice("--env-file=".length);
  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*[=:]\s*"?([^"\r\n]+)"?\s*$/);
    if (match) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

const requiredVariables = [
  "CHROME_EXTENSION_ID",
  "CHROME_PUBLISHER_ID",
  "CHROME_CLIENT_ID",
  "CHROME_CLIENT_SECRET",
  "CHROME_REFRESH_TOKEN",
];

const missingVariables = requiredVariables.filter((name) => !process.env[name]);
if (missingVariables.length) {
  throw new Error(
    `Missing Chrome Web Store secrets: ${missingVariables.join(", ")}`,
  );
}

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    client_id: process.env["CHROME_CLIENT_ID"],
    client_secret: process.env["CHROME_CLIENT_SECRET"],
    refresh_token: process.env["CHROME_REFRESH_TOKEN"],
    grant_type: "refresh_token",
  }),
});

const tokenData = await tokenResponse.json();
if (!tokenResponse.ok || !tokenData.access_token) {
  throw new Error(`OAuth token request failed: ${JSON.stringify(tokenData)}`);
}

const itemUrl = `https://chromewebstore.googleapis.com/v2/publishers/${process.env["CHROME_PUBLISHER_ID"]}/items/${process.env["CHROME_EXTENSION_ID"]}:fetchStatus`;
const itemResponse = await fetch(itemUrl, {
  headers: {
    Authorization: `Bearer ${tokenData.access_token}`,
    "x-goog-api-version": "2",
  },
});

const itemText = await itemResponse.text();
if (!itemResponse.ok) {
  throw new Error(
    `Chrome Web Store item check failed: ${itemResponse.status} ${itemText}`,
  );
}

console.log("Chrome Web Store credentials are valid.");
console.log(`Extension ID: ${process.env["CHROME_EXTENSION_ID"]}`);
