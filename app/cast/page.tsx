import { Suspense } from "react";
import { CastStudio } from "@/components/CastStudio";

export const metadata = {
  title: "Cast",
};

export default function CastPage() {
  return (
    <Suspense fallback={<p className="loading-screen">Opening the desk…</p>}>
      <CastStudio />
    </Suspense>
  );
}
