import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAdminExpense extends Document {
  title: string;
  category: string;
  amount: number;
  date: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminExpenseSchema = new Schema<IAdminExpense>(
  {
    title: { type: String, required: true },
    category: {
      type: String,
      enum: [
        "Domain",
        "Hardware",
        "Office",
        "Marketing",
        "Freelance",
        "Other",
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export const AdminExpense: Model<IAdminExpense> =
  (mongoose.models.AdminExpense as Model<IAdminExpense>) ||
  mongoose.model<IAdminExpense>("AdminExpense", AdminExpenseSchema);
