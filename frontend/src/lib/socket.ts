import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

export function createSocket(token: string): Socket {
  return io(API_URL, {
    auth: { token },
    transports: ["websocket"],
  });
}
