# Deepgram Demo for DataVoice Inc.

## Overview

Two demonstrations showing Deepgram's real-time and batch processing capabilities.

## Demos

### 1. Real-Time Streaming (WebSocket SDK)

**File:** `live-from-file.js`

Demonstrates live transcription with sub-second latency.

**Run:**

```bash
node live-from-file.js
```

---

### 2. Batch Processing (REST API)

**File:** `batch-process.js`

Demonstrates concurrent file processing with Promise.all.

**Run:**

```bash
node batch-process.js
```

---

## Setup

1. Install dependencies:

```bash
npm install @deepgram/sdk dotenv
```

2. Create `.env` file:

```
DEEPGRAM_API_KEY=your_api_key_here
```

3. Update audio file paths in each script
