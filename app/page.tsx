import { Suspense } from "react";
import { LoadingScreen, Trainer } from "@/components/Trainer";

// The trainer reads `?spot=` with useSearchParams, which on a prerendered
// route client-renders everything up to the nearest Suspense boundary — so it
// needs one, or the production build fails outright.
export default function TrainerPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Trainer />
    </Suspense>
  );
}
