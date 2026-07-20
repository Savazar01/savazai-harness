import "dotenv/config";
import http from "http";
import { URL } from "url";

const MCP_CRAWLER_URL = process.env.MCP_CRAWLER_URL || "http://localhost:21123/mcp/sse";
const CRAWL4AI_API_TOKEN = process.env.CRAWL4AI_API_TOKEN || "savaz_crawl_secret";

export class McpHttpClient {
  private endpoint: string;
  private token: string;

  constructor(endpoint: string = MCP_CRAWLER_URL, token: string = CRAWL4AI_API_TOKEN) {
    this.endpoint = endpoint;
    this.token = token;
  }

  /**
   * Helper to execute a request over the stateful SSE transport protocol.
   * Handles connecting to /mcp/sse, extracting session endpoint, initializing, and calling.
   */
  private async executeMcpCall(method: string, params: any, requestId: string = `req-${Date.now()}`): Promise<any> {
    const sseUrl = this.endpoint;
    const parsedUrl = new URL(sseUrl);

    console.log(`[McpHttpClient] Establishing SSE connection to: ${sseUrl}`);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        family: 4,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'text/event-stream'
        }
      };

      let postUrl = "";
      let sseBuffer = "";
      const sseEvents: string[] = [];
      let isDone = false;
      let isProcessing = false;

      const cleanup = () => {
        isDone = true;
        clearTimeout(timeoutId);
        req.destroy();
      };

      const processQueue = async () => {
        if (isProcessing) return;
        isProcessing = true;

        try {
          while (sseEvents.length > 0) {
            if (isDone) return;
            const eventText = sseEvents.shift()!;
            console.log(`[McpHttpClient] [${requestId}] Dequeued Event:\n---\n${eventText}\n---`);

            // 1. Read postUrl endpoint from the first SSE event
            if (!postUrl) {
              const lines = eventText.split('\n');
              const dataLine = lines.find(l => l.startsWith('data:'));
              if (dataLine) {
                const path = dataLine.substring(5).trim();
                const base = `${parsedUrl.protocol}//${parsedUrl.host}`;
                postUrl = `${base}${path}`;
                console.log(`[McpHttpClient] [${requestId}] Parsed postUrl: ${postUrl}`);
                
                console.log(`[McpHttpClient] [${requestId}] Sending initialize...`);
                await sendInitialize(postUrl);
              }
            } else {
              // 2. Wait for initialize result from the SSE stream
              if (eventText.includes(`init-${requestId}`)) {
                console.log(`[McpHttpClient] [${requestId}] Initialize response received. Sending command: ${method}`);
                await sendCommand(postUrl);
              }
              // 3. Read response from SSE stream
              else if (eventText.includes(requestId)) {
                console.log(`[McpHttpClient] [${requestId}] Command response received.`);
                const lines = eventText.split('\n');
                const dataLine = lines.find(l => l.startsWith('data:'));
                if (dataLine) {
                  const rawJson = dataLine.substring(5).trim();
                  const parsed = JSON.parse(rawJson);
                  cleanup();
                  if (parsed.error) {
                    reject(new Error(`MCP Error: ${JSON.stringify(parsed.error)}`));
                  } else {
                    resolve(parsed.result);
                  }
                  return;
                }
              } else {
                console.log(`[McpHttpClient] [${requestId}] Event did not match init or command IDs. Skipping.`);
              }
            }
          }
        } catch (err: any) {
          console.error(`[McpHttpClient] [${requestId}] Error in processQueue:`, err);
          cleanup();
          reject(err);
        } finally {
          isProcessing = false;
        }
      };

      const req = http.request(options, (res) => {
        console.log(`[McpHttpClient] [${requestId}] Response callback triggered. Status code: ${res.statusCode}`);
        if (res.statusCode !== 200) {
          cleanup();
          reject(new Error(`SSE Connection failed: HTTP ${res.statusCode}`));
          return;
        }

        res.setEncoding('utf8');
        
        res.on('data', (chunk) => {
          if (isDone) return;
          console.log(`[McpHttpClient] [${requestId}] Raw chunk received:`, JSON.stringify(chunk));
          // Normalize CRLF to LF
          sseBuffer += chunk.replace(/\r\n/g, '\n');
          let eventEndIndex;
          while ((eventEndIndex = sseBuffer.indexOf('\n\n')) !== -1) {
            const eventText = sseBuffer.substring(0, eventEndIndex).trim();
            sseBuffer = sseBuffer.substring(eventEndIndex + 2);
            if (eventText) {
              sseEvents.push(eventText);
            }
          }

          processQueue().catch((err) => {
            cleanup();
            reject(err);
          });
        });
      });

      req.on('error', (err) => {
        if (isDone) return;
        cleanup();
        reject(err);
      });

      // 60 second timeout for the entire MCP call
      const timeoutId = setTimeout(() => {
        if (isDone) return;
        cleanup();
        reject(new Error("Timeout waiting for command response"));
      }, 60000);

      req.end();
      
      const sendInitialize = async (url: string) => {
        const initPayload = {
          jsonrpc: "2.0",
          id: `init-${requestId}`,
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
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify(initPayload)
        });
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          throw new Error(`Initialize POST failed: HTTP ${r.status}. Body: ${errText}`);
        }
        
        const initializedPayload = {
          jsonrpc: "2.0",
          method: "notifications/initialized"
        };
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify(initializedPayload)
        });
      };

      const sendCommand = async (url: string) => {
        const commandPayload = {
          jsonrpc: "2.0",
          id: requestId,
          method,
          params
        };
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify(commandPayload)
        });
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          throw new Error(`Command POST failed: HTTP ${r.status}. Body: ${errText}`);
        }
      };
    });
  }

  async listTools(): Promise<any[]> {
    try {
      console.log(`[McpHttpClient] Requesting tools list from stateful SSE ${this.endpoint}...`);
      const result = await this.executeMcpCall("tools/list", {}, `list-${Date.now()}`);
      return result?.tools || [];
    } catch (error: any) {
      console.error("[McpHttpClient] listTools error:", error.message);
      return [];
    }
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    try {
      console.log(`[McpHttpClient] Invoking tool ${name} on stateful SSE ${this.endpoint}...`);
      const result = await this.executeMcpCall("tools/call", {
        name,
        arguments: arguments_,
      }, `call-${name}-${Date.now()}`);
      return result;
    } catch (error: any) {
      console.error(`[McpHttpClient] callTool ${name} error:`, error.message);
      throw error;
    }
  }
}
