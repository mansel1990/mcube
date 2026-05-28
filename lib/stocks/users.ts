import { connectToDatabase } from "@/lib/mongodb";
import mongoose from "mongoose";

export interface StocksUserRow {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string;
}

export async function listStocksUsers(): Promise<StocksUserRow[]> {
  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const users = await db
    .collection("user")
    .find({ section: "stocks" })
    .project({ username: 1, name: 1, email: 1, createdAt: 1 })
    .sort({ createdAt: 1 })
    .toArray();

  return users.map((u) => ({
    id: (u.id as string) ?? String(u._id),
    username: (u.username as string) ?? "",
    name: (u.name as string) ?? "",
    email: (u.email as string) ?? "",
    createdAt: u.createdAt ? new Date(u.createdAt as Date).toISOString() : "",
  }));
}

export async function countStocksUsers(): Promise<number> {
  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");
  return db.collection("user").countDocuments({ section: "stocks" });
}

export async function deleteStocksUser(userId: string): Promise<boolean> {
  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const oid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : null;
  const result = await db.collection("user").deleteOne({
    section: "stocks",
    $or: [{ id: userId }, ...(oid ? [{ _id: oid }] : [])],
  });
  if (result.deletedCount === 0) return false;

  await Promise.all([
    db.collection("session").deleteMany({ userId }),
    db.collection("account").deleteMany({ userId }),
  ]);

  return true;
}
