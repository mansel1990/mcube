import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILoanCreditor extends Document {
  name: string;
  type: "family" | "bank" | "friends" | "personal";
  originalAmount: number;
  interestRate: number;
  notes?: string;
  color: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LoanCreditorSchema = new Schema<ILoanCreditor>(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["family", "bank", "friends", "personal"],
      required: true,
    },
    originalAmount: { type: Number, required: true },
    interestRate: { type: Number, default: 0 },
    notes: { type: String },
    color: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const LoanCreditor: Model<ILoanCreditor> =
  (mongoose.models.LoanCreditor as Model<ILoanCreditor>) ||
  mongoose.model<ILoanCreditor>("LoanCreditor", LoanCreditorSchema);
