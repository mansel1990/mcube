import mongoose, { Schema, Document, Model } from "mongoose";

export interface INotificationLog extends Document {
  title: string;
  body: string;
  event: "morning" | "scan" | "open" | "close" | "kite";
  tickers: string[];
  sent: number;
  sentAt: Date;
  url?: string;
  tag?: string;
  meta?: {
    totalCount?: number;
    bySource?: Record<string, number>;
    lastScanDate?: string | null;
  };
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    event: { type: String, enum: ["morning", "scan", "open", "close", "kite"], required: true },
    tickers: { type: [String], default: [] },
    sent: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
    url: { type: String, default: "/stocks" },
    tag: { type: String, default: null },
    meta: {
      totalCount: Number,
      bySource: Schema.Types.Mixed,
      lastScanDate: String,
    },
  },
  { timestamps: false }
);

export const NotificationLog: Model<INotificationLog> =
  mongoose.models.NotificationLog ||
  mongoose.model<INotificationLog>("NotificationLog", NotificationLogSchema);
