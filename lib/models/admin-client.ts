import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAdminClient extends Document {
  name: string;
  email?: string;
  phone?: string;
  billingCycle: "monthly" | "yearly" | "one-time";
  cycleAmount: number;
  contractValue?: number;
  startDate: Date;
  status: "active" | "inactive";
  projectPhase:
    | "discovery"
    | "design"
    | "development"
    | "maintenance"
    | "complete";
  nextAction?: string;
  githubUrl?: string;
  websiteUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminClientSchema = new Schema<IAdminClient>(
  {
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly", "one-time"],
      required: true,
    },
    cycleAmount: { type: Number, required: true },
    contractValue: { type: Number },
    startDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    projectPhase: {
      type: String,
      enum: [
        "discovery",
        "design",
        "development",
        "maintenance",
        "complete",
      ],
      default: "development",
    },
    nextAction: { type: String },
    githubUrl: { type: String },
    websiteUrl: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export const AdminClient: Model<IAdminClient> =
  (mongoose.models.AdminClient as Model<IAdminClient>) ||
  mongoose.model<IAdminClient>("AdminClient", AdminClientSchema);
