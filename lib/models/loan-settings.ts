import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILoanSettings extends Document {
  monthlyBudget: number;
  updatedAt: Date;
}

const LoanSettingsSchema = new Schema<ILoanSettings>(
  {
    monthlyBudget: { type: Number, default: 350000 },
  },
  { timestamps: true }
);

export const LoanSettings: Model<ILoanSettings> =
  (mongoose.models.LoanSettings as Model<ILoanSettings>) ||
  mongoose.model<ILoanSettings>("LoanSettings", LoanSettingsSchema);
