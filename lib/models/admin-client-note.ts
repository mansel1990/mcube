import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IAdminClientNote extends Document {
  clientId: Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminClientNoteSchema = new Schema<IAdminClientNote>(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "AdminClient",
      required: true,
    },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

export const AdminClientNote: Model<IAdminClientNote> =
  (mongoose.models.AdminClientNote as Model<IAdminClientNote>) ||
  mongoose.model<IAdminClientNote>("AdminClientNote", AdminClientNoteSchema);
