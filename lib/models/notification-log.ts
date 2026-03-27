import mongoose, { Schema, Document, Model } from "mongoose";

export interface INotificationLog extends Document {
  title: string;
  body: string;
  event: "open" | "close";
  tickers: string[];
  sent: number;
  sentAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    event: { type: String, enum: ["open", "close"], required: true },
    tickers: { type: [String], default: [] },
    sent: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const NotificationLog: Model<INotificationLog> =
  mongoose.models.NotificationLog ||
  mongoose.model<INotificationLog>("NotificationLog", NotificationLogSchema);
