import type { Metadata } from "next";
import { Randomizer } from "@/components/Randomizer";

export const metadata: Metadata = {
  title: "Randomizer — PrefLopLab",
  description: "A 0–100 number that rerolls every 10 seconds, in a window that floats on top.",
};

export default function RandomizerPage() {
  return <Randomizer />;
}
