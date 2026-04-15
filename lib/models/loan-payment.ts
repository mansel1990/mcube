import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ILoanPayment extends Document {
  creditorId: Types.ObjectId;
  amount: number;
  date: Date;
  method: "bank_transfer" | "cash" | "upi" | "cheque" | "auto_emi" | "other";
  notes?: string;
  createdAt: Date;
}

const LoanPaymentSchema = new Schema<ILoanPayment>(
  {
    creditorId: {
      type: Schema.Types.ObjectId,
      ref: "LoanCreditor",
      required: true,
    },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    method: {
      type: String,
      enum: ["bank_transfer", "cash", "upi", "cheque", "auto_emi", "other"],
      required: true,
    },
    notes: { type: String },
  },
  { timestamps: true }
);

export const LoanPayment: Model<ILoanPayment> =
  (mongoose.models.LoanPayment as Model<ILoanPayment>) ||
  mongoose.model<ILoanPayment>("LoanPayment", LoanPaymentSchema);
