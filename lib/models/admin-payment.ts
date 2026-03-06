import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IAdminPayment extends Document {
  clientId: Types.ObjectId;
  clientName: string;
  amount: number;
  date: Date;
  periodStart?: Date;
  monthsCovered: number;
  periodLabel?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminPaymentSchema = new Schema<IAdminPayment>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "AdminClient", required: true },
    clientName: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    periodStart: { type: Date },
    monthsCovered: { type: Number, default: 1 },
    periodLabel: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export const AdminPayment: Model<IAdminPayment> =
  (mongoose.models.AdminPayment as Model<IAdminPayment>) ||
  mongoose.model<IAdminPayment>("AdminPayment", AdminPaymentSchema);
