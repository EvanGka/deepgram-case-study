import pLimit from "p-limit"; // npm install p-limit

async function transcribe(fileUrl) {
  const deepgramURL = "https://api.deepgram.com/v1/listen";

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    diarize: "true",
  });

  const options = {
    method: "POST",
    headers: {
      Authorization: "Token 82107d998e3378d426ba8c5196fc9c850b9c20cc",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: fileUrl }),
  };

  const start = Date.now();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${deepgramURL}?${params}`, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429 && attempt < 2) {
          const wait = 2 ** attempt * 1000;
          await new Promise((res) => setTimeout(res, wait));
          continue;
        }
        const errorText = await response.text();
        return {
          url: fileUrl,
          success: false,
          status: response.status,
          error: errorText.slice(0, 300),
          ms: Date.now() - start,
        };
      }

      const data = await response.json();
      const transcript =
        data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

      const audioSec = data?.metadata?.duration ?? null; // ← audio length (seconds)

      return {
        url: fileUrl,
        success: true,
        ms: Date.now() - start,
        audioSec,
        words: transcript.split(/\s+/).filter(Boolean).length,
        snippet: transcript.slice(0, 160),
        diarization:
          data?.results?.channels?.[0]?.alternatives?.[0]?.words?.slice(0, 3) ??
          [],
        raw: data, // keep for debugging if you want
      };
    } catch (error) {
      if (attempt < 2) {
        const wait = 2 ** attempt * 1000;
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      return {
        url: fileUrl,
        success: false,
        status: "network",
        error: String(error).slice(0, 300),
        ms: Date.now() - start,
      };
    }
  }
}

async function batchTranscribe(urls) {
  const limit = pLimit(3); // max 3 at the same time

  const promises = urls.map((url) => limit(() => transcribe(url)));
  return Promise.allSettled(promises);
}

const fileUrls = [
  "https://static.deepgram.com/examples/interview_speech-analytics.wav",
  "https://static.deepgram.com/examples/interview_speech-analytics.wav",
];

// (async () => {
//   console.log("Starting transcription...\n");
//   const results = await batchTranscribe(fileUrls); // ← Fixed variable
//   console.dir(results, { depth: null });
// })();

(async () => {
  console.log("Starting batch transcription…\n");
  const t0 = Date.now();

  const settled = await batchTranscribe(fileUrls);

  // Normalize fulfilled/rejected into a flat array
  const results = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value; // your success/fail object from transcribe
    return {
      url: fileUrls[i],
      success: false,
      status: "rejected",
      error: String(r.reason).slice(0, 300),
      ms: 0,
    };
  });

  const ok = results.filter((r) => r.success);
  const fail = results.filter((r) => !r.success);

  // ✅ Summary stats
  const totalFiles = results.length;
  const totalTime = Date.now() - t0; // total wall-clock time
  const avgTime = ok.reduce((acc, r) => acc + r.ms, 0) / (ok.length || 1);
  const totalAudioSec = results.reduce((acc, r) => acc + (r.audioSec || 0), 0);

  // Pretty per-file lines
  //   results.forEach((r, i) => {
  //     const name = (r.url || "").split("/").pop();
  //     const wallSec = (r.ms ?? 0) / 1000;
  //     const audio = r.audioSec ?? 0;
  //     const x = audio && wallSec ? audio / wallSec : 0;
  //     console.log(
  //       `File ${i + 1}: ${name} — ${audio.toFixed(1)}s audio → ${wallSec.toFixed(
  //         1
  //       )}s wall  (${x.toFixed(1)}× real-time)`
  //     );
  //   });

  console.table(
    results.map((r) => ({
      url: (r.url || "").split("/").pop(),
      success: r.success,
      ms: r.ms ?? 0,
      rt_x:
        r.audioSec && r.ms ? (r.audioSec / (r.ms / 1000)).toFixed(1) : "0.0",
      words: r.words ?? 0,
      status: r.status ?? 200,
      snippet: r.snippet ?? "",
    }))
  );

  console.log(
    `\nProcessed ${totalFiles} files — total audio ${totalAudioSec.toFixed(
      1
    )}s in ${totalTime} ms  `
  );

  results.forEach((r, i) => {
    const audio = r.audioSec ?? 0;
    const wall = (r.ms ?? 0) / 1000;
    console.log(
      `File ${i + 1}: ${(audio || 0).toFixed(
        0
      )} seconds audio → processed in ${wall.toFixed(1)}s`
    );
  });

  console.log(`Average processing time per file: ${avgTime.toFixed(0)} ms`);

  console.log(
    `\nCompleted ${results.length} files in ${Date.now() - t0} ms → ` +
      `${ok.length} OK / ${fail.length} failed`
  );
})();
