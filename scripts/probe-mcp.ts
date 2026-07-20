import fetch from 'node-fetch';

async function runProbe() {
  const url = "http://localhost:21123/mcp";
  const payload = {
    jsonrpc: "2.0",
    method: "tools/list",
    params: {}
  };

  console.log(`[PROBE] Sending JSON-RPC payload to ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer savaz_crawl_secret'
      },
      body: JSON.stringify(payload)
    });

    console.log(`[PROBE] HTTP Status: ${res.status} ${res.statusText}`);
    console.log(`[PROBE] Headers:`, Object.fromEntries(res.headers.entries()));
    
    const rawBody = await res.text();
    console.log(`[PROBE] Raw Body Output:\n`, rawBody);
  } catch (err) {
    console.error("[PROBE] Critical Network Connection Error:", err);
  }
}

runProbe();
