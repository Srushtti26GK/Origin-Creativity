import type { Response } from 'express';
import type { NotificationRecord } from '../repositories/notification.repository.js';

class NotificationHub {
  private clients = new Map<string, Set<Response>>();

  addClient(userId: string, response: Response): () => void {
    let userClients = this.clients.get(userId);
    if (!userClients) {
      userClients = new Set();
      this.clients.set(userId, userClients);
    }
    userClients.add(response);

    // Initial ping to acknowledge connection
    response.write(': connected\n\n');

    // Heartbeat every 25 seconds to keep connection alive across proxies/NAT
    const interval = setInterval(() => {
      try {
        response.write(': ping\n\n');
      } catch {
        clearInterval(interval);
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(interval);
      const active = this.clients.get(userId);
      if (active) {
        active.delete(response);
        if (active.size === 0) {
          this.clients.delete(userId);
        }
      }
    };

    response.on('close', cleanup);
    return cleanup;
  }

  publish(recipientId: string, notification: NotificationRecord): void {
    const userClients = this.clients.get(recipientId);
    if (!userClients || userClients.size === 0) return;

    const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
    for (const client of userClients) {
      try {
        client.write(payload);
      } catch {
        // Handled by close listener
      }
    }
  }

  get activeUserCount(): number {
    return this.clients.size;
  }
}

export const notificationHub = new NotificationHub();
