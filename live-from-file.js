// live-from-file.js
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Config (adjust as you like) ============================================
const AUDIO_PATH = path.resolve(
  "/Users/evangelos/Downloads/ttsMP3.com_VoiceText_2025-11-8_17-22-44.wav"
);
const CHUNK_SIZE = 8_192; // bytes per chunk (simulate "live" network audio)
const CHUNK_INTERVAL_MS = 20; // pacing to feel real-time-ish

const DG_MODEL = "nova-3"; // pick your model
const DG_PARAMS = {
  smart_format: true,
  diarize: true,
  punctuate: true,
  interim_results: true, // get partials
  keyterm: [
    "VoIP",
    "SLA",
    "MTTR",
    "SKU",
    "escalation",
    "outage management",
    "billing cycle",
    "telecom jargon",
  ],
};
// ============================================================================

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error("Missing DEEPGRAM_API_KEY (.env)");
    process.exit(1);
  }
  if (!fs.existsSync(AUDIO_PATH)) {
    console.error(`Audio file not found: ${AUDIO_PATH}`);
    process.exit(1);
  }

  const deepgram = createClient(apiKey);

  console.log("🚀 Connecting to Deepgram live (WebSocket) …");
  const connection = await deepgram.listen.live({
    model: DG_MODEL,
    ...DG_PARAMS,
  });

  // --- Event wiring ---------------------------------------------------------
  connection.on(LiveTranscriptionEvents.Open, async () => {
    console.log("✅ Live connection opened. Streaming audio…");
    await streamFileAsLive(connection, AUDIO_PATH);
  });

  connection.on(LiveTranscriptionEvents.Transcript, (msg) => {
    // Deepgram SDK delivers JSON messages with channel alternatives.
    try {
      const alt = msg?.channel?.alternatives?.[0];
      if (!alt) return;

      const isFinal = alt?.transcript && msg?.is_final;
      const text = alt?.transcript ?? "";

      // Print partials lightly; finals with emphasis.
      if (text?.trim()) {
        if (isFinal) {
          console.log(`\n🟢 FINAL: ${text}`);
          console.log(
            `   ⏱️  Confidence: ${(alt.confidence * 100).toFixed(1)}%`
          );

          // Show speaker detection (useful for call centers)
          if (
            msg.channel?.alternatives?.[0]?.words?.[0]?.speaker !== undefined
          ) {
            const speaker = msg.channel.alternatives[0].words[0].speaker;
            console.log(`   👤 Speaker: ${speaker}`);
          }
        } else {
          process.stdout.write(`\r… ${text.slice(0, 80)}`);
        }
      }
    } catch (e) {
      // ignore parsing quirks
    }
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log("\n🔚 Connection closed.");
    process.exit(0);
  });

  connection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error("\n❌ Deepgram error:", err?.message || err);
    process.exit(1);
  });

  // Safety: close on Ctrl+C
  process.on("SIGINT", async () => {
    console.log("\n🧹 Received SIGINT; finalizing stream…");
    try {
      await connection.finish();
    } finally {
      process.exit(0);
    }
  });
}

async function streamFileAsLive(connection, filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  let offset = 0;

  const interval = setInterval(() => {
    if (offset >= fileBuffer.length) {
      clearInterval(interval);
      console.log("\n📨 Finished sending audio. Waiting for final results…");
      connection.finish(); // tell Deepgram no more audio is coming
      return;
    }
    const end = Math.min(offset + CHUNK_SIZE, fileBuffer.length);
    const chunk = fileBuffer.subarray(offset, end);
    connection.send(chunk);
    offset = end;
  }, CHUNK_INTERVAL_MS);
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
