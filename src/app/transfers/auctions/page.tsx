import { redirect } from "next/navigation";

/** Auctions became Player drops (buy-it-now releases). */
export default function Moved() {
  redirect("/transfers/drops");
}
