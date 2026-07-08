import type { ServerResponse } from "node:http";

export type StreamMode = "sse" | "http";

export class StreamBroadcaster {
  private res: ServerResponse;
  private mode: StreamMode;
  private _closed = false;

  constructor(res: ServerResponse, mode: StreamMode) {
    this.res = res;
    this.mode = mode;
    this.setupHeaders();
    this.setupCleanup();
  }

  private setupHeaders(): void {
    if (this.mode === "sse") {
      this.res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
    } else {
      this.res.writeHead(200, {
        "Transfer-Encoding": "chunked",
        "Content-Type": "application/x-ndjson",
      });
    }
  }

  private setupCleanup(): void {
    this.res.on("close", () => {
      this._closed = true;
    });
  }

  send(data: unknown): void {
    if (this._closed) return;
    const json = JSON.stringify(data);
    if (this.mode === "sse") {
      this.res.write(`data: ${json}\n\n`);
    } else {
      this.res.write(`${json}\n`);
    }
  }

  end(): void {
    if (this._closed) return;
    this._closed = true;
    if (this.mode === "sse") {
      this.res.write("data: [DONE]\n\n");
    }
    this.res.end();
  }

  error(err: Error): void {
    if (this._closed) return;
    this.send({ error: err.message });
    this.end();
  }

  get isClosed(): boolean {
    return this._closed;
  }
}
