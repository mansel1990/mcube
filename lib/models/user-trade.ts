import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserTrade extends Document {
  userId: string;
  source: string;
  signalRef: string;
  ticker: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  target: number | null;
  stopLoss: number | null;
  exitPrice: number | null;
  exitDate: string | null;
  status: "open" | "closed";
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserTradeSchema = new Schema<IUserTrade>(
  {
    userId: { type: String, required: true, index: true },
    source: { type: String, required: true },
    signalRef: { type: String, required: true },
    ticker: { type: String, required: true },
    quantity: { type: Number, required: true },
    entryPrice: { type: Number, required: true },
    entryDate: { type: String, required: true },
    target: { type: Number, default: null },
    stopLoss: { type: Number, default: null },
    exitPrice: { type: Number, default: null },
    exitDate: { type: String, default: null },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

UserTradeSchema.index({ userId: 1, status: 1 });
UserTradeSchema.index({ userId: 1, signalRef: 1 }, { unique: true, partialFilterExpression: { status: "open" } });

export const UserTrade: Model<IUserTrade> =
  mongoose.models.UserTrade || mongoose.model<IUserTrade>("UserTrade", UserTradeSchema);
