async function runProbe() {
  const base = "http://savazai-crawler-mcp:11235";
  const sseUrl = `${base}/mcp/sse`;

  console.log(`[PROBE] 1. Connecting to SSE endpoint: ${sseUrl}...`);
  try {
    const sseResponse = await fetch(sseUrl, {
      headers: {
        'Authorization': 'Bearer savaz_crawl_secret'
      }
    });

    if (!sseResponse.ok) {
      console.error(`[PROBE] SSE connection failed: HTTP ${sseResponse.status}`);
      process.exit(1);
    }

    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder();

    // 1. Get the POST endpoint from the first SSE event
    let postUrl = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      console.log(`[PROBE] SSE Init Event:\n`, text);

      const lines = text.split('\n');
      let dataLine = lines.find(l => l.startsWith('data:'));
      if (dataLine) {
        const path = dataLine.substring(5).trim();
        postUrl = `${base}${path}`;
        break;
      }
    }

    if (!postUrl) {
      console.error("[PROBE] Failed to extract POST endpoint from SSE stream.");
      process.exit(1);
    }

    // 2. Send "initialize" request
    console.log(`[PROBE] 2. Sending "initialize" request...`);
    const initPayload = {
      jsonrpc: "2.0",
      id: "init-1",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "savazai-client",
          version: "1.0.0"
        }
      }
    };

    const initPostPromise = fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer savaz_crawl_secret'
      },
      body: JSON.stringify(initPayload)
    });

    const initPostRes = await initPostPromise;
    console.log(`[PROBE] Init POST response: ${initPostRes.status}`);

    // Wait for the initialize result in the SSE stream
    let initResponseReceived = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      console.log(`[PROBE] SSE Event (waiting for init response):\n`, text);
      if (text.includes("init-1")) {
        initResponseReceived = true;
        break;
      }
    }

    if (!initResponseReceived) {
      console.error("[PROBE] Failed to receive initialize response.");
      process.exit(1);
    }

    // 3. Send "notifications/initialized"
    console.log(`[PROBE] 3. Sending "notifications/initialized" notification...`);
    const initializedPayload = {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    };

    await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer savaz_crawl_secret'
      },
      body: JSON.stringify(initializedPayload)
    });

    // 4. Send "tools/list"
    console.log(`[PROBE] 4. Sending "tools/list" request...`);
    const listPayload = {
      jsonrpc: "2.0",
      id: "list-2",
      method: "tools/list",
      params: {}
    };

    const listPostPromise = fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer savaz_crawl_secret'
      },
      body: JSON.stringify(listPayload)
    });

    const listPostRes = await listPostPromise;
    console.log(`[PROBE] List POST response: ${listPostRes.status}`);

    // Read the tools/list response from the SSE stream
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes("list-2")) {
        const lines = text.split('\n');
        const dataLine = lines.find(l => l.startsWith('data:'));
        if (dataLine) {
          const rawJson = dataLine.substring(5).trim();
          try {
            const parsed = JSON.parse(rawJson);
            if (parsed.result && parsed.result.tools) {
              console.log("[PROBE] Tool Names Discovered:", parsed.result.tools.map((t) => t.name));
            } else if (parsed.error) {
              console.error("[PROBE] Handshake returned error:", parsed.error);
            }
          } catch (e) {
            console.error("[PROBE] JSON parse error on event data:", e.message);
          }
        }
        console.log("[PROBE] SUCCESS! Full handshake complete!");
        process.exit(0);
      }
    }

  } catch (err) {
    console.error("[PROBE] Error during handshake:", err.message);
    process.exit(1);
  }
}

runProbe();
