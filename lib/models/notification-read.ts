import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface INotificationRead extends Document {
  userId: string;
  notificationId: Types.ObjectId;
  readAt: Date;
}

const NotificationReadSchema = new Schema<INotificationRead>(
  {
    userId: { type: String, required: true, index: true },
    notificationId: { type: Schema.Types.ObjectId, required: true, ref: "NotificationLog" },
    readAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

NotificationReadSchema.index({ userId: 1, notificationId: 1 }, { unique: true });

export const NotificationRead: Model<INotificationRead> =
  mongoose.models.NotificationRead ||
  mongoose.model<INotificationRead>("NotificationRead", NotificationReadSchema);
