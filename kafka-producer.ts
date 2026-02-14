import { Kafka, logLevel } from "kafkajs";
import type { EmailSendEvent } from "./event-schemas";

export const KAFKA_TOPICS = {
  NOTIFICATIONS_EMAIL: "notifications.email",
};

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID!,
  brokers: process.env.KAFKA_BROKERS!.split(","),
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 100,
    retries: 5,
  },
});

const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5,
});

await producer.connect();
console.log("Kafka producer connected");

function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function publishEmailEvent(to: string, subject: string, body: string): void {
  const event: EmailSendEvent = {
    type: "email.send",
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    to,
    subject,
    body,
  };

  producer
    .send({
      topic: KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
      messages: [
        {
          key: to,
          value: JSON.stringify(event),
          headers: {
            "correlation-id": generateEventId(),
          },
        },
      ],
    })
    .catch((error: any) => {
      console.error(`Failed to publish email event to ${to}:`, error);
    });
}
