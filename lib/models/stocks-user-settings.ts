import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStocksUserSettings extends Document {
  userId: string;
  defaultTradeAmount: number;
  updatedAt: Date;
}

const StocksUserSettingsSchema = new Schema<IStocksUserSettings>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    defaultTradeAmount: { type: Number, default: 10000 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const StocksUserSettings: Model<IStocksUserSettings> =
  mongoose.models.StocksUserSettings ||
  mongoose.model<IStocksUserSettings>("StocksUserSettings", StocksUserSettingsSchema);
