export type EventType = "email.send";

export interface BaseEvent {
  type: EventType;
  timestamp: string;
  id: string;
}

export interface EmailSendEvent extends BaseEvent {
  type: "email.send";
  to: string;
  subject: string;
  body: string;
}
