import { Kafka, logLevel } from "kafkajs";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "1025"),
  secure: process.env.SMTP_SECURE === "true",
  auth: (process.env.SMTP_USER && process.env.SMTP_PASSWORD)
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined
});

await transporter.verify();
console.log("Email service initialized successfully");

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "noreply@videx.local";

  try {
    await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: body,
    });
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
}

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "kafka:9092").split(",");
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "videx-email-consumer";
const KAFKA_GROUP_ID =
  process.env.KAFKA_CONSUMER_GROUP_ID || "videx-email-consumer-group";

const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 100,
    retries: 5,
  },
});

async function processMessage(message: any): Promise<void> {
  if (!message.value) {
    return;
  }

  try {
    const event = JSON.parse(message.value.toString());
    console.log(`Processing event: ${event.type}`);

    if (event.type === "email.send" && event.to && event.subject && event.body) {
      await sendEmail(event.to, event.subject, event.body);
    } else {
      console.warn("Received unknown or malformed event:", event.type);
    }
  } catch (error) {
    console.error(`Error processing message:`, error);
  }
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });
await consumer.connect();

await consumer.subscribe({ topics: ["notifications.email"] });

await consumer.run({
  eachMessage: async ({ message }) => {
    await processMessage(message);
  },
});
