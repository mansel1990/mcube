import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAdminSubscription extends Document {
  name: string;
  amount: number;
  billingCycle: "monthly" | "yearly";
  startDate: Date;
  status: "active" | "paused" | "cancelled";
  cancelledAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSubscriptionSchema = new Schema<IAdminSubscription>(
  {
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    billingCycle: { type: String, enum: ["monthly", "yearly"], required: true },
    startDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "paused", "cancelled"],
      default: "active",
    },
    cancelledAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export const AdminSubscription: Model<IAdminSubscription> =
  (mongoose.models.AdminSubscription as Model<IAdminSubscription>) ||
  mongoose.model<IAdminSubscription>(
    "AdminSubscription",
    AdminSubscriptionSchema
  );
